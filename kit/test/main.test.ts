// The command on a copy of the fixture: its flags, the manifest per kind, the developer's models.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MAIN = join(import.meta.dirname, "../src/edge/main.ts");
const project = () => {
  const root = mkdtempSync(join(tmpdir(), "kit-"));
  cpSync(join(import.meta.dirname, "fixture/agents"), join(root, "agents"), { recursive: true });
  return root;
};
const kit = (...args: string[]) => spawnSync("bun", [MAIN, ...args], { encoding: "utf8" });

describe("kit, the command", () => {
  it("refuses an unknown flag, a flag with no value, an unknown kind", () => {
    expect(kit("check", "--rot", ".").stderr).toContain("ARGS_INVALID");
    expect(kit("check", "--root").stderr).toContain("ARGS_INVALID");
    expect(kit("generate", "--kind", "vim", "--root", project()).stderr).toContain("KIND_UNKNOWN");
  });
  it("one kind's run keeps the other kind's files; a role removed is removed", () => {
    const root = project();
    expect(kit("generate", "--root", root).status).toBe(0);
    expect(existsSync(join(root, ".github/agents/reader.agent.md"))).toBe(true);
    expect(kit("generate", "--kind", "claude-code", "--root", root).status).toBe(0);
    expect(existsSync(join(root, ".github/agents/reader.agent.md"))).toBe(true);
    cpSync(join(root, "agents/roles/reader.md"), join(root, "agents/roles/viewer.md"));
    writeFileSync(
      join(root, "agents/roles/viewer.md"),
      readFileSync(join(root, "agents/roles/viewer.md"), "utf8").replace("name: reader", "name: viewer"),
    );
    spawnSync("rm", [join(root, "agents/roles/reader.md")]);
    expect(kit("generate", "--kind", "claude-code", "--root", root).stdout).toContain(
      "removed .claude/agents/reader.md",
    );
    expect(existsSync(join(root, ".github/agents/reader.agent.md"))).toBe(true);
    expect(kit("generate", "--root", root).stdout).toContain("removed .github/agents/reader.agent.md");
  });
  it("takes Copilot's models from agents.local.json, and refuses one that does not fit", () => {
    const root = project();
    writeFileSync(
      join(root, "agents.local.json"),
      JSON.stringify({ copilot: { models: { strongest: "gpt-5.4" } } }),
    );
    kit("generate", "--kind", "copilot", "--root", root);
    expect(readFileSync(join(root, ".github/agents/reader.agent.md"), "utf8")).toContain('model: "gpt-5.4"');
    writeFileSync(join(root, "agents.local.json"), JSON.stringify({ copilot: { models: { best: "x" } } }));
    expect(kit("generate", "--root", root).stderr).toContain("agents.local.json");
  });
});
