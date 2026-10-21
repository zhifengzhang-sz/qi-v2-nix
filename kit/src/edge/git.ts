// The work tree's snapshot (run.ts): HEAD and the stash, so that a run that commits or stashes is seen; then every
// path git lists as differing from HEAD in the work tree or the index (renames split into their two paths), each
// by what it is: a file by its content's hash, a link by its target, a directory as one, a path gone as deleted.
// Ignored files are not in it: what a build writes there is the build's.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { err, kitError, ok, type Result } from "../result.ts";
import type { Snapshot } from "../run.ts";
import { tryCatch } from "./catch.ts";

const git = (root: string, args: readonly string[]): Result<string> => {
  const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  return r.status === 0
    ? ok(r.stdout)
    : err(kitError("FILE_UNREADABLE", `git ${args.join(" ")}`, r.stderr || String(r.error)));
};

// a ref's commit, or "none" where it does not exist (no stash)
const ref = (root: string, name: string): string => {
  const r = spawnSync("git", ["-C", root, "rev-parse", "--verify", "-q", name], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "none";
};

const state = (path: string): string => {
  const s = tryCatch("FILE_UNREADABLE", path, () => lstatSync(path));
  if (!s.ok) return "deleted";
  if (s.value.isSymbolicLink()) return `link:${readlinkSync(path)}`;
  if (s.value.isDirectory()) return "directory";
  return createHash("sha256").update(readFileSync(path)).digest("hex");
};

export const snapshot = (root: string): Result<Snapshot> => {
  const listed = git(root, ["ls-files", "-z", "--modified", "--deleted", "--others", "--exclude-standard"]);
  const staged = git(root, ["diff", "--cached", "--name-only", "--no-renames", "-z"]);
  if (!listed.ok) return listed;
  if (!staged.ok) return staged;
  const paths = [...new Set([...listed.value.split("\0"), ...staged.value.split("\0")])].filter(
    (p) => p !== "",
  );
  return tryCatch("FILE_UNREADABLE", "the work tree", () => ({
    "(HEAD)": ref(root, "HEAD"),
    "(stash)": ref(root, "refs/stash"),
    ...Object.fromEntries(paths.map((p) => [p, state(join(root, p))])),
  }));
};
