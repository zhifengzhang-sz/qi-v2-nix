// Whether a flake's inputs are outdated (the shared rules, The session: a lock is outdated when its source has moved
// past what it names): flake.lock's inputs as their sources can be asked, and each input's line from what its source
// says. Pure; the edge asks the sources (edge/locks.ts).
import { parseDocument } from "yaml";
import { z } from "zod";
import { err, kitError, ok, type Result } from "./result.ts";

// an input of the root, as git can ask its source: the repository, the branch or tag it follows, the commit the
// flake itself names (`?rev=`, a pin no source moves), the commit locked, and the folder it is taken from, where it is
// taken from one; an input that follows another's (`follows`) by the path it comes through, which is where it is
// updated, and the branch or tag that the input it comes by follows (`throughRef`)
export type Input = {
  readonly name: string;
  readonly through: readonly string[] | null;
  readonly throughRef: string | null;
  readonly url: string | null;
  readonly ref: string;
  readonly rev: string | null;
  readonly locked: string | null;
  readonly dir: string | null;
};

const Original = z.looseObject({
  type: z.string(),
  owner: z.string().optional(),
  repo: z.string().optional(),
  url: z.string().optional(),
  ref: z.string().optional(),
  rev: z.string().optional(),
  dir: z.string().optional(),
});
const Lock = z.looseObject({
  root: z.string(),
  nodes: z.record(
    z.string(),
    z.looseObject({
      inputs: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
      locked: z.looseObject({ rev: z.string().optional() }).optional(),
      original: Original.optional(),
    }),
  ),
});

const source = (o: z.infer<typeof Original> | undefined): string | null =>
  o === undefined
    ? null
    : o.type === "github" && o.owner !== undefined && o.repo !== undefined
      ? `https://github.com/${o.owner}/${o.repo}`
      : o.type === "git" && o.url !== undefined
        ? o.url
        : null;

export const inputsOf = (text: string): Result<readonly Input[]> => {
  // JSON read as YAML: its errors come back as values, nothing thrown
  const doc = parseDocument(text);
  if (doc.errors.length > 0)
    return err(kitError("SPEC_INVALID", "flake.lock", doc.errors.map((e) => e.message).join("; ")));
  const parsed = Lock.safeParse(doc.toJS());
  if (!parsed.success) return err(kitError("SPEC_INVALID", "flake.lock", parsed.error.message));
  const { root, nodes } = parsed.data;
  // a `follows` path, from the root: each name the input of the node before it, a name whose input is itself a path
  // followed from the root again
  const follow = (path: readonly string[], seen = 0): string | undefined =>
    seen > 64
      ? undefined
      : path.reduce<string | undefined>((at, name) => {
          const k = at === undefined ? undefined : nodes[at]?.inputs?.[name];
          return typeof k === "string" || k === undefined ? k : follow(k, seen + 1);
        }, root);
  return ok(
    Object.entries(nodes[root]?.inputs ?? {})
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([name, key]): Input => {
        const node = nodes[typeof key === "string" ? key : (follow(key) ?? "")];
        const o = node?.original;
        const by = typeof key === "string" ? undefined : nodes[follow(key.slice(0, 1)) ?? ""];
        return {
          name,
          through: typeof key === "string" ? null : key,
          throughRef: by === undefined ? null : (by.original?.ref ?? "HEAD"),
          url: source(o),
          ref: o?.ref ?? "HEAD",
          rev: o?.rev ?? null,
          locked: node?.locked?.rev ?? null,
          dir: o?.dir === undefined ? null : `${o.dir.replace(/\/+$/, "")}/`,
        };
      }),
  );
};

// a release's tag, `<product>-<major>.<minor>.<patch>` (the shared rules, A release): its product and its version
const release = (tag: string): { readonly product: string; readonly version: readonly number[] } | null => {
  const m = /^(.+)-(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  return m === null ? null : { product: m[1] ?? "", version: [m[2], m[3], m[4]].map(Number) };
};

// a product's release branch, `release/<product>` (the shared rules, A release), moved to each release's commit: its
// product, or null for any other ref
const releaseBranch = (ref: string): string | null => /^release\/(.+)$/.exec(ref)?.[1] ?? null;

// the product an input's releases are asked by: the one its release branch or release's tag names; for an input that
// follows another branch from a folder, the folder's, a repository of several products releasing each as
// `<folder>-<version>` (as qi-v2-nix does qi-v2 and kit); null for any other input
export const productOf = (i: Input): string | null =>
  releaseBranch(i.ref) ?? release(i.ref)?.product ?? (i.dir === null ? null : i.dir.replace(/\/+$/, ""));

// what the source says of an input's product: each release's tag with its commit, and the commit of its release
// branch, or null where it has none
export type Releases = {
  readonly tags: readonly { readonly tag: string; readonly commit: string }[];
  readonly branch: string | null;
};
export const noReleases: Releases = { tags: [], branch: null };

// the product's releases from git ls-remote's lines (commit, ref), an annotated tag's commit by its `^{}` line
export const releasesOf = (lines: readonly (readonly [string, string])[], product: string): Releases => {
  // each of the product's tag lines: its tag, its commit, and whether it is the `^{}` line
  const tagLines = lines.flatMap(([commit, ref]) => {
    const m = /^refs\/tags\/(.+?)(\^\{\})?$/.exec(ref);
    const tag = m?.[1];
    return tag !== undefined && release(tag)?.product === product
      ? [{ tag, commit, peeled: m?.[2] !== undefined }]
      : [];
  });
  const tags = tagLines
    .filter((t) => !t.peeled)
    .map((t) => ({
      tag: t.tag,
      commit: tagLines.find((p) => p.peeled && p.tag === t.tag)?.commit ?? t.commit,
    }));
  return { tags, branch: lines.find(([, ref]) => ref === `refs/heads/release/${product}`)?.[0] ?? null };
};

// whether version a is after version b, the first number that differs deciding
const after = (a: readonly number[], b: readonly number[]): boolean => {
  const k = a.findIndex((x, n) => x !== b[n]);
  return k >= 0 && (a[k] ?? 0) > (b[k] ?? 0);
};

// the newest of the product's tags, and of those at a commit, the newest there
const newest = (product: string, tags: readonly string[]): string | null =>
  tags
    .flatMap((t) => {
      const r = release(t);
      return r !== null && r.product === product ? [{ tag: t, version: r.version }] : [];
    })
    .reduce<{ readonly tag: string; readonly version: readonly number[] } | null>(
      (x, y) => (x === null || after(y.version, x.version) ? y : x),
      null,
    )?.tag ?? null;
const at = (product: string, r: Releases, commit: string | null): string | null =>
  newest(
    product,
    r.tags.filter((t) => t.commit === commit).map((t) => t.tag),
  );

// the product's newest release among the source's tags: for an input that follows a release's tag, where it is newer
// than that tag (a tag does not move, so the release after it is what makes it outdated); for one that follows another
// branch from a folder, the newest there is; null where there is none, for an input on its release branch (judged by
// the branch), or for one with no product
export const newer = (i: Input, tags: readonly string[]): string | null => {
  const product = productOf(i);
  if (product === null || releaseBranch(i.ref) !== null) return null;
  const best = newest(product, release(i.ref) === null ? tags : [i.ref, ...tags]);
  return best === null || best === i.ref ? null : best;
};

// whether an input is judged by its product's releases, not by its branch or folder
export const byReleases = (i: Input, r: Releases): boolean =>
  releaseBranch(i.ref) !== null ||
  r.branch !== null ||
  newer(
    i,
    r.tags.map((t) => t.tag),
  ) !== null;

// where an input that follows another's is updated: in the lock it comes through, then taken by the input it comes by:
// by nix flake update where that follows a branch (a release branch, once a release moves it); at a release's tag,
// which does not move, a newer release of it, by its tag
const via = (through: readonly string[], ref: string | null): string => {
  const tag = ref === null ? null : release(ref);
  const line = ref === null ? null : releaseBranch(ref);
  return `it comes through ${through.slice(0, -1).join("/")}: updated in its lock, then ${
    tag !== null
      ? `a release of ${tag.product} after ${ref}, taken by its tag in flake.nix and nix flake update ${through[0]}`
      : line !== null
        ? `a release of ${line}, taken by nix flake update ${through[0]}`
        : `nix flake update ${through[0]}`
  }`;
};

// where the input's ref is changed: in flake.nix (`?ref=`, `&ref=` after the folder's `?dir=`), or, for an input that
// follows another's, in the lock it comes through
const toRef = (i: Input, ref: string): string =>
  i.through === null
    ? `${i.dir === null ? "?" : "&"}ref=${ref} in flake.nix, then nix flake update ${i.name}`
    : via(i.through, i.throughRef);
const update = (i: Input): string =>
  i.through === null ? `nix flake update ${i.name}` : via(i.through, i.throughRef);

// an input on its product's release branch: current at the commit locked, outdated where the branch moved to a
// release (a major marked), not taken where it moved to a commit no release's tag names
const onBranch = (i: Input, product: string, head: string | null, locked: string, r: Releases): string => {
  const was = at(product, r, locked);
  const now = at(product, r, head);
  const major = (release(now ?? "")?.version[0] ?? 0) > (release(was ?? "")?.version[0] ?? Infinity);
  return head === locked
    ? `flake.lock ${i.name}: current (${locked.slice(0, 10)}, ${was ?? `no ${product}-* tag names it`})`
    : now === null
      ? `flake.lock ${i.name}: not taken: ${i.ref} is at ${(head ?? "").slice(0, 10)}, which no ${product}-* tag names (the branch moves only to a release); locked ${locked.slice(0, 10)}`
      : `flake.lock ${i.name}: outdated: follows ${i.ref}, locked ${locked.slice(0, 10)}${was === null ? "" : ` (${was})`}, ${i.url}: ${now} is released${major ? ", a major: see its Changes" : ""}: ${update(i)}`;
};

// an input's line, given the commit its branch or tag is at, for an input taken from a folder how many of the files
// changed since the locked commit are in that folder, and its product's releases: an input on its release branch is
// judged by the release it is at; one that follows another branch or a tag, once the product has a release branch, is
// outdated, to take it (an exact pin is `?rev=`); with no release branch, one that follows a branch is outdated by the
// newest tag, and one that follows a tag by a newer
export const lineOf = (
  i: Input,
  head: string | null,
  inFolder: number | null,
  r: Releases = noReleases,
): string => {
  const product = productOf(i);
  const later = newer(
    i,
    r.tags.map((t) => t.tag),
  );
  const follows = i.ref === "HEAD" ? "the default branch" : i.ref;
  return i.url === null || i.locked === null
    ? `flake.lock ${i.name}: not asked (not a git or GitHub input)`
    : i.rev !== null
      ? `flake.lock ${i.name}: pinned (${i.rev.slice(0, 10)}, the flake's ?rev=): not asked; flake.nix changes it`
      : product !== null && releaseBranch(i.ref) !== null
        ? onBranch(i, product, head, i.locked, r)
        : product !== null && r.branch !== null
          ? `flake.lock ${i.name}: outdated: follows ${follows} (${i.locked.slice(0, 10)}), ${i.url}: ${product} is taken by its release branch, release/${product}: ${toRef(i, `release/${product}`)}`
          : later !== null && release(i.ref) === null
            ? `flake.lock ${i.name}: outdated: follows ${follows} (${i.locked.slice(0, 10)}), ${i.url}: ${product} is released by tag, ${later} the newest: ${toRef(i, later)}`
            : head === i.locked && later !== null
              ? `flake.lock ${i.name}: outdated: locked ${i.ref} (${i.locked.slice(0, 10)}), ${i.url}: ${later} is released: ${toRef(i, later)}`
              : head === i.locked
                ? `flake.lock ${i.name}: current (${i.locked.slice(0, 10)})`
                : i.dir !== null && inFolder === 0
                  ? `flake.lock ${i.name}: current (${i.locked.slice(0, 10)}; its repository moved, ${i.dir} not)`
                  : `flake.lock ${i.name}: outdated: locked ${i.locked.slice(0, 10)}, ${i.url}: ${
                      i.dir === null ? `${i.ref} is at ${(head ?? "").slice(0, 10)}` : `${i.dir} changed`
                    }: ${update(i)}`;
};
