// Whether a flake's inputs are outdated (the shared rules, The session: a lock is outdated when its source has moved
// past what it names): flake.lock's inputs as their sources can be asked, and each input's line from what its source
// says. Pure; the edge asks the sources (edge/locks.ts).
import { parseDocument } from "yaml";
import { z } from "zod";
import { err, kitError, ok, type Result } from "./result.ts";

// an input of the root, as git can ask its source: the repository, the branch or tag it follows, the commit the
// flake itself names (`?rev=`, a pin no source moves), the commit locked, and the folder it is taken from, where it is
// taken from one; an input that follows another's (`follows`) by the path it comes through, which is where it is
// updated
export type Input = {
  readonly name: string;
  readonly through: readonly string[] | null;
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
        return {
          name,
          through: typeof key === "string" ? null : key,
          url: source(o),
          ref: o?.ref ?? "HEAD",
          rev: o?.rev ?? null,
          locked: node?.locked?.rev ?? null,
          dir: o?.dir === undefined ? null : `${o.dir.replace(/\/+$/, "")}/`,
        };
      }),
  );
};

// an input's line, given the commit its branch or tag is at and, for an input taken from a folder, how many of the
// files changed since the locked commit are in that folder
export const lineOf = (i: Input, head: string | null, inFolder: number | null): string =>
  i.url === null || i.locked === null
    ? `flake.lock ${i.name}: not asked (not a git or GitHub input)`
    : i.rev !== null
      ? `flake.lock ${i.name}: pinned (${i.rev.slice(0, 10)}, the flake's ?rev=): not asked; flake.nix changes it`
      : head === i.locked
        ? `flake.lock ${i.name}: current (${i.locked.slice(0, 10)})`
        : i.dir !== null && inFolder === 0
          ? `flake.lock ${i.name}: current (${i.locked.slice(0, 10)}; its repository moved, ${i.dir} not)`
          : `flake.lock ${i.name}: outdated: locked ${i.locked.slice(0, 10)}, ${i.url}: ${
              i.dir === null ? `${i.ref} is at ${(head ?? "").slice(0, 10)}` : `${i.dir} changed`
            }: ${
              i.through === null
                ? `nix flake update ${i.name}`
                : `it comes through ${i.through.slice(0, -1).join("/")}: updated in its lock, then nix flake update ${i.through[0]}`
            }`;
