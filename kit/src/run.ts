// A role's run checked on its output, where a kind cannot restrict its tools (notes/copilot-vscode.md, 4a): the
// work tree's dirty files with their hashes before the run and after, and the role's writes against what changed.
import type { RoleFront } from "./spec.ts";

// a work tree's state: every file that differs from HEAD (modified, added, deleted, untracked), by its hash
export type Snapshot = Readonly<Record<string, string>>;

// the files whose state moved between two snapshots: changed, made dirty, or brought back to HEAD
export const changed = (before: Snapshot, after: Snapshot): readonly string[] =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((p) => before[p] !== after[p])
    .toSorted();

// PASS: the role kept to its writes; FAIL: it did not; LISTED: what changed is listed, not judged (a role that
// builds or makes the change, or a brief-files role whose brief is not known, as in a hook)
export type Status = "PASS" | "FAIL" | "LISTED";
export type Verdict = { readonly pass: boolean; readonly status: Status; readonly lines: readonly string[] };

// named: the brief's files; undefined where they are not known (a hook), and a brief-files role is then reported
export const verdict = (
  role: RoleFront,
  moved: readonly string[],
  named: readonly string[] | undefined,
): Verdict => {
  const list = moved.map((p) => `  ${p}`);
  if (role.writes === "none" && !role.builds)
    return moved.length === 0
      ? { pass: true, status: "PASS", lines: [`${role.name}: writes none; nothing changed`] }
      : {
          pass: false,
          status: "FAIL",
          lines: [`${role.name}: writes none, but ${moved.length} changed:`, ...list],
        };
  if (role.writes === "brief-files" && named !== undefined) {
    const outside = moved.filter((p) => !named.includes(p));
    return outside.length === 0
      ? {
          pass: true,
          status: "PASS",
          lines: [`${role.name}: only the brief's files changed (${moved.length})`, ...list],
        }
      : {
          pass: false,
          status: "FAIL",
          lines: [
            `${role.name}: ${outside.length} changed outside the brief's files:`,
            ...outside.map((p) => `  ${p}`),
          ],
        };
  }
  // a role that builds, or makes the change: what changed is reported for the session to read
  return {
    pass: true,
    status: "LISTED",
    lines: [
      `${role.name}: writes ${role.writes}${role.builds ? ", builds" : ""}; ${moved.length} changed:`,
      ...list,
    ],
  };
};
