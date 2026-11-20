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

// the product an input's tags are asked by: the one its release's tag names; for an input that follows a branch from a
// folder, the folder's, a repository of several products tagging each `<folder>-<version>` (as qi-v2-nix does qi-v2
// and kit); null for any other input
export const productOf = (i: Input): string | null =>
  release(i.ref)?.product ?? (i.dir === null ? null : i.dir.replace(/\/+$/, ""));

// the product's newest release among the source's tags: for an input that follows a release's tag, where it is newer
// than that tag (a tag does not move, so the release after it is what makes it outdated); for one that follows a
// branch from a folder, the newest there is (a product released by tag is taken by its tag, never its branch); null
// where there is none, or the input has no product
export const newer = (i: Input, tags: readonly string[]): string | null => {
  const product = productOf(i);
  if (product === null) return null;
  const at = release(i.ref);
  // whether version a is after version b, the first number that differs deciding
  const after = (a: readonly number[], b: readonly number[]): boolean => {
    const k = a.findIndex((x, n) => x !== b[n]);
    return k >= 0 && (a[k] ?? 0) > (b[k] ?? 0);
  };
  const best = tags
    .flatMap((t) => {
      const r = release(t);
      return r !== null && r.product === product ? [{ tag: t, version: r.version }] : [];
    })
    .reduce<{ readonly tag: string; readonly version: readonly number[] } | null>(
      (x, y) => (x === null || after(y.version, x.version) ? y : x),
      at === null ? null : { tag: i.ref, version: at.version },
    );
  return best === null || best.tag === i.ref ? null : best.tag;
};

// where an input that follows another's is updated: in the lock it comes through, then taken by the input it comes by,
// which, at a release's tag, does not move: a newer release of it is taken, by its tag
const via = (through: readonly string[], ref: string | null): string => {
  const at = ref === null ? null : release(ref);
  return `it comes through ${through.slice(0, -1).join("/")}: updated in its lock, then ${
    at === null
      ? `nix flake update ${through[0]}`
      : `a release of ${at.product} after ${ref}, taken by its tag in flake.nix and nix flake update ${through[0]}`
  }`;
};

// where the input's ref is changed to a release's tag: in flake.nix (`?ref=`, `&ref=` after the folder's `?dir=`),
// or, for an input that follows another's, in the lock it comes through
const toTag = (i: Input, tag: string): string =>
  i.through === null
    ? `${i.dir === null ? "?" : "&"}ref=${tag} in flake.nix, then nix flake update ${i.name}`
    : via(i.through, i.throughRef);

// an input's line, given the commit its branch or tag is at, for an input taken from a folder how many of the files
// changed since the locked commit are in that folder, and the newest release (`newer`): for an input that follows a
// branch, outdated whatever the branch did, its product being released
export const lineOf = (
  i: Input,
  head: string | null,
  inFolder: number | null,
  later: string | null = null,
): string =>
  i.url === null || i.locked === null
    ? `flake.lock ${i.name}: not asked (not a git or GitHub input)`
    : i.rev !== null
      ? `flake.lock ${i.name}: pinned (${i.rev.slice(0, 10)}, the flake's ?rev=): not asked; flake.nix changes it`
      : later !== null && release(i.ref) === null
        ? `flake.lock ${i.name}: outdated: follows ${i.ref === "HEAD" ? "the default branch" : i.ref} (${i.locked.slice(0, 10)}), ${i.url}: ${productOf(i)} is released by tag, ${later} the newest: ${toTag(i, later)}`
        : head === i.locked && later !== null
          ? `flake.lock ${i.name}: outdated: locked ${i.ref} (${i.locked.slice(0, 10)}), ${i.url}: ${later} is released: ${toTag(i, later)}`
          : head === i.locked
            ? `flake.lock ${i.name}: current (${i.locked.slice(0, 10)})`
            : i.dir !== null && inFolder === 0
              ? `flake.lock ${i.name}: current (${i.locked.slice(0, 10)}; its repository moved, ${i.dir} not)`
              : `flake.lock ${i.name}: outdated: locked ${i.locked.slice(0, 10)}, ${i.url}: ${
                  i.dir === null ? `${i.ref} is at ${(head ?? "").slice(0, 10)}` : `${i.dir} changed`
                }: ${i.through === null ? `nix flake update ${i.name}` : via(i.through, i.throughRef)}`;
