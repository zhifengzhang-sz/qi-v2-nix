// kit locks: each input of flake.lock against its source (locks.ts), by git ls-remote (a private GitHub repository
// asked again by SSH, as the machine reads it) and, for an input taken from a folder, GitHub's compare by the GitHub
// CLI, logged in (`gh auth login`): SSH alone does not reach it, and without it the run stops with gh's message.
// Changes nothing.
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type Input, inputsOf, lineOf } from "../locks.ts";
import { err, kitError, ok, type Result } from "../result.ts";
import { tryAsync } from "./catch.ts";

const run = (cmd: string, args: readonly string[]): Result<string> => {
  const r = spawnSync(cmd, args, { encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  return r.status === 0
    ? ok(r.stdout)
    : err(
        kitError(
          "SOURCE_UNREACHABLE",
          `${cmd} ${args.slice(0, 2).join(" ")}`,
          (r.stderr || String(r.error)).trim(),
        ),
      );
};

// the commit a branch or a tag is at: a tag's commit (an annotated tag's `^{}`) first, then a branch's
const head = (i: Input): Result<string> => {
  const refs =
    i.ref === "HEAD" ? ["HEAD"] : [`refs/tags/${i.ref}^{}`, `refs/tags/${i.ref}`, `refs/heads/${i.ref}`];
  const asked = (url: string) => run("git", ["ls-remote", url, ...refs]);
  const first = asked(i.url ?? "");
  const gh = /^https:\/\/github\.com\/(.+?)(?:\.git)?$/.exec(i.url ?? "");
  const r = first.ok || gh === null ? first : asked(`git@github.com:${gh[1]}.git`);
  if (!r.ok) return r;
  const lines = r.value
    .split("\n")
    .map((l) => l.split("\t"))
    .filter((l): l is [string, string] => l.length === 2);
  const rev = refs.map((ref) => lines.find(([, name]) => name === ref)?.[0]).find((x) => x !== undefined);
  return rev === undefined ? err(kitError("SOURCE_UNREACHABLE", i.url ?? "", `no ${i.ref}`)) : ok(rev);
};

// how many of the files changed from the locked commit to the head are in the input's folder
const inFolder = (i: Input, at: string): Result<number> => {
  const repo = /github\.com[:/](.+?)(?:\.git)?$/.exec(i.url ?? "")?.[1];
  if (repo === undefined || i.locked === null || i.dir === null)
    return err(
      kitError("SOURCE_UNREACHABLE", i.url ?? "", "a folder input not on GitHub cannot be compared"),
    );
  const r = run("gh", [
    "api",
    `repos/${repo}/compare/${i.locked}...${at}`,
    "--jq",
    `[.files[]? | select(.filename | startswith("${i.dir}"))] | length`,
  ]);
  return r.ok ? ok(Number(r.value.trim() || "0")) : r;
};

export const locks = async (root: string): Promise<Result<readonly string[]>> => {
  const text = await tryAsync("FILE_UNREADABLE", "flake.lock", () =>
    readFile(join(root, "flake.lock"), "utf8"),
  );
  if (!text.ok) return text;
  const inputs = inputsOf(text.value);
  if (!inputs.ok) return inputs;
  const lines = inputs.value.map((i): Result<string> => {
    if (i.url === null || i.locked === null || i.rev !== null) return ok(lineOf(i, null, null));
    const h = head(i);
    if (!h.ok) return h;
    if (h.value === i.locked || i.dir === null) return ok(lineOf(i, h.value, null));
    const n = inFolder(i, h.value);
    return n.ok ? ok(lineOf(i, h.value, n.value)) : n;
  });
  const failed = lines.find((l) => !l.ok);
  return failed !== undefined && !failed.ok ? failed : ok(lines.map((l) => (l.ok ? l.value : "")));
};
