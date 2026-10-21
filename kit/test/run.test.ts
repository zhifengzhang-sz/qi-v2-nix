// A role's run checked on its output: the verdict for each kind of writes, and the command in a git repository.
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { changed, verdict } from "../src/run.ts";
import type { RoleFront } from "../src/spec.ts";

const role = (writes: RoleFront["writes"], builds = false): RoleFront => ({
  name: "r",
  for: "x",
  model: "small",
  effort: "low",
  can: ["read"],
  writes,
  builds,
});

describe("the verdict", () => {
  it("changed: a file changed, made dirty, or brought back to HEAD", () => {
    expect(changed({ a: "1", b: "2", c: "3" }, { a: "1", b: "9", d: "4" })).toEqual(["b", "c", "d"]);
  });
  it("writes none: nothing may change; a role that builds only reports", () => {
    expect(verdict(role("none"), [], []).pass).toBe(true);
    expect(verdict(role("none"), ["a"], []).pass).toBe(false);
    expect(verdict(role("none", true), ["a"], []).pass).toBe(true);
  });
  it("brief-files: only the named files", () => {
    expect(verdict(role("brief-files"), ["a"], ["a", "b"]).pass).toBe(true);
    expect(verdict(role("brief-files"), ["a", "c"], ["a"]).lines).toEqual([
      "r: 1 changed outside the brief's files:",
      "  c",
    ]);
  });
});

const MAIN = join(import.meta.dirname, "../src/edge/main.ts");
const kit = (root: string, ...args: string[]) =>
  spawnSync("bun", [MAIN, ...args, "--root", root], { encoding: "utf8" });
const sh = (root: string, ...args: string[]) =>
  spawnSync(args[0] ?? "", args.slice(1), { cwd: root, encoding: "utf8" });

describe("run-start and run-check", () => {
  it("a reader's run that edits a file fails; one that edits nothing passes; a file dirty before stays out", () => {
    const root = mkdtempSync(join(tmpdir(), "kit-run-"));
    cpSync(join(import.meta.dirname, "fixture/agents"), join(root, "agents"), { recursive: true });
    writeFileSync(join(root, ".gitignore"), "agents.run/\n");
    writeFileSync(join(root, "a.txt"), "a\n");
    sh(root, "git", "init", "-q");
    sh(root, "git", "add", ".");
    sh(root, "git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "fixture");
    writeFileSync(join(root, "dirty.txt"), "before the run\n");
    expect(kit(root, "run-start", "--role", "reader").status).toBe(0);
    expect(kit(root, "run-check", "--role", "reader").stdout).toContain("nothing changed");
    expect(kit(root, "run-start", "--role", "reader").status).toBe(0);
    writeFileSync(join(root, "a.txt"), "changed by the run\n");
    const r = kit(root, "run-check", "--role", "reader");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("RUN_OUTSIDE");
    expect(r.stderr).toContain("  a.txt");
    expect(r.stderr).not.toContain("dirty.txt");
    expect(kit(root, "run-check", "--role", "reader").stderr).toContain("no run-start");
  });
  it("a run that commits, moves a file, or leaves a link to a directory is seen; a link does not break the record", () => {
    const root = mkdtempSync(join(tmpdir(), "kit-run-"));
    cpSync(join(import.meta.dirname, "fixture/agents"), join(root, "agents"), { recursive: true });
    writeFileSync(join(root, ".gitignore"), "agents.run/\n");
    writeFileSync(join(root, "a.txt"), "a\n");
    writeFileSync(join(root, "b.txt"), "b\n");
    sh(root, "git", "init", "-q");
    sh(root, "git", "add", ".");
    const commit = (m: string) =>
      sh(root, "git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", m);
    commit("fixture");
    kit(root, "run-start", "--role", "reader");
    writeFileSync(join(root, "a.txt"), "edited and committed\n");
    commit("by the role");
    expect(kit(root, "run-check", "--role", "reader").stderr).toContain("(HEAD)");
    kit(root, "run-start", "--role", "reader");
    sh(root, "git", "mv", "b.txt", "c.txt");
    const moved = kit(root, "run-check", "--role", "reader").stderr;
    expect(moved).toContain("  b.txt");
    expect(moved).toContain("  c.txt");
    sh(root, "git", "mv", "c.txt", "b.txt");
    sh(root, "ln", "-s", root, "dir-link");
    expect(kit(root, "run-start", "--role", "reader").status).toBe(0);
    expect(kit(root, "run-check", "--role", "reader").stdout).toContain("nothing changed");
  });

  it("from the CLI's hooks: the payload's agentName resolved to the role, the verdict in agents.run/log", () => {
    const root = mkdtempSync(join(tmpdir(), "kit-hook-"));
    cpSync(join(import.meta.dirname, "fixture/agents"), join(root, "agents"), { recursive: true });
    writeFileSync(join(root, ".gitignore"), "agents.run/\n");
    writeFileSync(join(root, "a.txt"), "a\n");
    sh(root, "git", "init", "-q");
    sh(root, "git", "add", ".");
    sh(root, "git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "fixture");
    // as the CLI hands it (notes/copilot.md, Tried in the CLI), less the fields not read
    const payload = (id: string, name = "reader", response?: string) =>
      JSON.stringify({
        sessionId: "s",
        agentName: name,
        agentDisplayName: name,
        agentId: id,
        agentType: name,
        ...(response === undefined ? {} : { response }),
      });
    const hook = (step: string, input: string) =>
      spawnSync("bun", [MAIN, "hook", step, "--root", root], { input, encoding: "utf8" });
    expect(hook("start", payload("run-1")).status).toBe(0);
    expect(hook("stop", payload("run-1", "reader", "The report.")).status).toBe(0);
    expect(JSON.parse(readFileSync(join(root, "agents.run/run-1.run.json"), "utf8"))).toEqual({
      role: "reader",
      kind: "copilot",
      model: "not reported",
      family: "not reported",
      effort: "high",
      tokens: "not reported",
      tokens_why: "Copilot's hook payload does not provide usage; obtain it from /usage or OpenTelemetry.",
      brief: "agents/roles/reader.md",
      report: "agents.run/run-1.report.md",
      changed: [],
    });
    expect(readFileSync(join(root, "agents.run/run-1.report.md"), "utf8")).toBe("The report.");
    expect(hook("start", payload("run-2")).status).toBe(0);
    writeFileSync(join(root, "a.txt"), "edited by the reader\n");
    const stop = hook("stop", payload("run-2"));
    expect(stop.status).toBe(0);
    expect(hook("start", payload("run-4")).status).toBe(0);
    writeFileSync(join(root, "a.txt"), "edited again by the reader\n");
    mkdirSync(join(root, "agents.run/run-4.run.json"));
    expect(hook("stop", payload("run-4")).status).toBe(0);
    expect(hook("start", payload("run-3", "explore")).stdout).toContain("not a role");
    // what goes wrong is logged, and the hook still exits 0
    expect(hook("stop", "not json").status).toBe(0);
    expect(hook("stop", payload("call_4.x")).status).toBe(0);
    expect(hook("start", payload("../escape")).status).toBe(0);
    // a brief-files role through a hook: its changes listed, not judged
    writeFileSync(
      join(root, "agents/roles/drafter.md"),
      readFileSync(join(root, "agents/roles/reader.md"), "utf8")
        .replace("name: reader", "name: drafter")
        .replace("writes: none", "writes: brief-files"),
    );
    hook("start", payload("run-5", "drafter"));
    writeFileSync(join(root, "a.txt"), "edited by the drafter\n");
    hook("stop", payload("run-5", "drafter"));
    const log = readFileSync(join(root, "agents.run/log"), "utf8");
    expect(log).toMatch(/run-1 start RECORDED reader: the work tree recorded, 0 files differ from HEAD/);
    expect(log).toMatch(/run-1 stop PASS reader: writes none; nothing changed/);
    expect(log).toMatch(/run-2 stop FAIL reader: writes none, but 1 changed:/);
    expect(log).toMatch(/run-2 stop FAIL +a\.txt/);
    expect(log).toMatch(/run-4 stop FAIL reader: writes none, but 1 changed:/);
    expect(log).toMatch(/run-4 stop FAIL \(FILE_UNWRITABLE agents\.run\/run-4\.run\.json:/);
    expect(log).toMatch(/run-3 start SKIPPED explore: not a role/);
    expect(log).toMatch(/\? stop ERROR ARGS_INVALID the hook's input/);
    expect(log).toMatch(/call_4\.x stop ERROR FILE_UNREADABLE .*no run-start for reader/);
    expect(log).toMatch(/\? start ERROR ARGS_INVALID/);
    expect(log).toMatch(/run-5 stop LISTED drafter: writes brief-files; 1 changed:/);
  });
});
