// kit locks' pure part: flake.lock's inputs as their sources can be asked, and each input's line.
import { describe, expect, it } from "vitest";
import { type Input, inputsOf, lineOf } from "../src/locks.ts";

const lock = JSON.stringify({
  root: "root",
  version: 7,
  nodes: {
    root: { inputs: { kit: "kit", nixpkgs: "nixpkgs", tool: "tool", local: "local", pinned: "pinned" } },
    kit: {
      locked: { rev: "a".repeat(40), type: "github" },
      original: { type: "github", owner: "o", repo: "r", dir: "kit" },
    },
    nixpkgs: {
      locked: { rev: "b".repeat(40), type: "github" },
      original: { type: "github", owner: "NixOS", repo: "nixpkgs", ref: "nixos-26.05" },
    },
    tool: { locked: { rev: "c".repeat(40), type: "git" }, original: { type: "git", url: "ssh://git@h/x" } },
    local: { locked: { type: "path" }, original: { type: "path", path: "./x" } },
    pinned: {
      locked: { rev: "e".repeat(40), type: "github" },
      original: { type: "github", owner: "o", repo: "p", rev: "e".repeat(40) },
    },
  },
});
const inputs = (): readonly Input[] => {
  const r = inputsOf(lock);
  if (!r.ok) expect.fail(r.error.message);
  return r.value;
};
const named = (n: string): Input => inputs().find((i) => i.name === n) ?? expect.fail(`no ${n}`);

describe("kit locks", () => {
  it("reads the root's inputs, each with its source, branch, locked commit and folder", () => {
    expect(inputs().map((i) => i.name)).toEqual(["kit", "local", "nixpkgs", "pinned", "tool"]);
    expect(named("kit")).toEqual({
      name: "kit",
      url: "https://github.com/o/r",
      ref: "HEAD",
      rev: null,
      locked: "a".repeat(40),
      dir: "kit/",
    });
    expect(named("nixpkgs").ref).toBe("nixos-26.05");
    expect(named("tool").url).toBe("ssh://git@h/x");
    expect(named("local").url).toBeNull();
  });
  it("says current where the head is the locked commit", () => {
    expect(lineOf(named("tool"), "c".repeat(40), null)).toContain("current");
  });
  it("says outdated, with the update, where the head moved", () => {
    expect(lineOf(named("nixpkgs"), "d".repeat(40), null)).toContain("outdated");
    expect(lineOf(named("nixpkgs"), "d".repeat(40), null)).toContain("nix flake update nixpkgs");
  });
  it("judges a folder input by its folder: current where the folder did not change", () => {
    expect(lineOf(named("kit"), "d".repeat(40), 0)).toContain("its repository moved, kit/ not");
    expect(lineOf(named("kit"), "d".repeat(40), 2)).toContain("kit/ changed");
  });
  it("does not ask an input the flake pins to a commit (?rev=): its branch moving does not outdate it", () => {
    expect(lineOf(named("pinned"), "f".repeat(40), null)).toContain("pinned");
    expect(lineOf(named("pinned"), "f".repeat(40), null)).not.toContain("outdated");
  });
  it("does not ask an input that is not git or GitHub", () => {
    expect(lineOf(named("local"), null, null)).toContain("not asked");
  });
  it("refuses a flake.lock it cannot read", () => {
    expect(inputsOf("{").ok).toBe(false);
  });
});
