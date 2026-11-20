// kit locks' pure part: flake.lock's inputs as their sources can be asked, and each input's line.
import { describe, expect, it } from "vitest";
import {
  byReleases,
  type Input,
  inputsOf,
  lineOf,
  newer,
  productOf,
  type Releases,
  releasesOf,
} from "../src/locks.ts";

const lock = JSON.stringify({
  root: "root",
  version: 7,
  nodes: {
    root: {
      inputs: {
        kit: "kit",
        nixpkgs: "nixpkgs",
        tool: "tool",
        local: "local",
        pinned: "pinned",
        contract: "contract",
        lib: "lib",
        shared: ["kit", "nixpkgs"],
        tools: ["lib", "nixpkgs"],
        line: "line",
        lined: ["line", "nixpkgs"],
      },
    },
    line: {
      inputs: { nixpkgs: "nixpkgs" },
      locked: { rev: "h".repeat(40), type: "github" },
      original: { type: "github", owner: "o", repo: "r", dir: "qi-v2", ref: "release/qi-v2" },
    },
    lib: {
      inputs: { nixpkgs: "nixpkgs" },
      locked: { rev: "h".repeat(40), type: "github" },
      original: { type: "github", owner: "o", repo: "r", dir: "qi-v2", ref: "qi-v2-1.0.0" },
    },
    kit: {
      inputs: { nixpkgs: "nixpkgs" },
      locked: { rev: "a".repeat(40), type: "github" },
      original: { type: "github", owner: "o", repo: "r", dir: "kit" },
    },
    nixpkgs: {
      locked: { rev: "b".repeat(40), type: "github" },
      original: { type: "github", owner: "NixOS", repo: "nixpkgs", ref: "nixos-26.05" },
    },
    tool: { locked: { rev: "c".repeat(40), type: "git" }, original: { type: "git", url: "ssh://git@h/x" } },
    contract: {
      locked: { rev: "g".repeat(40), type: "github" },
      original: { type: "github", owner: "o", repo: "c", ref: "widget-1.1.0" },
    },
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
// a source's releases: each tag at the commit given (a tag alone at 0…0), and its release branch's commit
const rel = (
  tags: readonly (string | readonly [string, string])[],
  branch: string | null = null,
): Releases => ({
  tags: tags.map((t) =>
    typeof t === "string" ? { tag: t, commit: "0".repeat(40) } : { tag: t[0], commit: t[1] },
  ),
  branch,
});

describe("kit locks", () => {
  it("reads the root's inputs, each with its source, branch, locked commit and folder", () => {
    expect(inputs().map((i) => i.name)).toEqual([
      "contract",
      "kit",
      "lib",
      "line",
      "lined",
      "local",
      "nixpkgs",
      "pinned",
      "shared",
      "tool",
      "tools",
    ]);
    expect(named("kit")).toEqual({
      name: "kit",
      through: null,
      throughRef: null,
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
  it("names where an input that follows another's is updated: in the lock it comes through", () => {
    expect(named("shared").through).toEqual(["kit", "nixpkgs"]);
    expect(named("shared").locked).toBe("b".repeat(40));
    expect(lineOf(named("shared"), "d".repeat(40), null)).toContain(
      "it comes through kit: updated in its lock, then nix flake update kit",
    );
  });
  it("says an input that comes by one at a release's tag is updated by a newer release, not nix flake update", () => {
    const t = named("tools");
    expect(t.through).toEqual(["lib", "nixpkgs"]);
    expect(t.throughRef).toBe("qi-v2-1.0.0");
    expect(named("shared").throughRef).toBe("HEAD");
    expect(lineOf(t, "d".repeat(40), null)).toContain(
      "it comes through lib: updated in its lock, then a release of qi-v2 after qi-v2-1.0.0, taken by its tag in flake.nix and nix flake update lib",
    );
  });
  it("judges a folder input by its folder: current where the folder did not change", () => {
    expect(lineOf(named("kit"), "d".repeat(40), 0)).toContain("its repository moved, kit/ not");
    expect(lineOf(named("kit"), "d".repeat(40), 2)).toContain("kit/ changed");
  });
  it("does not ask an input the flake pins to a commit (?rev=): its branch moving does not outdate it", () => {
    expect(lineOf(named("pinned"), "f".repeat(40), null)).toContain("pinned");
    expect(lineOf(named("pinned"), "f".repeat(40), null)).not.toContain("outdated");
  });
  it("finds the newest release of the product an input's tag names, only where it is after the tag", () => {
    const c = named("contract");
    expect(productOf(c)).toBe("widget");
    expect(newer(c, ["widget-1.0.0", "widget-1.1.0", "widget-1.2.0", "widget-1.10.0", "other-9.0.0"])).toBe(
      "widget-1.10.0",
    );
    expect(newer(c, ["widget-1.0.0", "widget-1.1.0", "other-9.0.0", "widget-2.0"])).toBeNull();
    expect(productOf(named("nixpkgs"))).toBeNull();
    expect(newer(named("nixpkgs"), ["nixos-26.05"])).toBeNull();
  });
  it("names a folder input that follows a branch by its folder, and finds the folder's newest release", () => {
    const k = named("kit");
    expect(productOf(k)).toBe("kit");
    expect(newer(k, ["kit-0.4.1", "kit-0.10.0", "kit-0.5.0", "kit-1.0", "kitten-9.0.0"])).toBe("kit-0.10.0");
    expect(newer(k, [])).toBeNull();
    expect(newer(k, ["kitten-9.0.0", "kit-1.0"])).toBeNull();
  });
  it("says a folder input that follows a branch outdated once its product is released, whatever the branch did", () => {
    const line =
      "flake.lock kit: outdated: follows the default branch (aaaaaaaaaa), https://github.com/o/r: kit is released by tag, kit-0.5.0 the newest: &ref=kit-0.5.0 in flake.nix, then nix flake update kit";
    expect(lineOf(named("kit"), "a".repeat(40), null, rel(["kit-0.5.0"]))).toBe(line);
    expect(lineOf(named("kit"), "d".repeat(40), null, rel(["kit-0.5.0"]))).toBe(line);
    expect(lineOf(named("kit"), "a".repeat(40), null, rel([]))).toContain("current");
  });
  it("judges a folder input that follows a release's tag by its product's tags, the tag changed after ?dir= (&ref=)", () => {
    const l = named("lib");
    expect(productOf(l)).toBe("qi-v2");
    expect(newer(l, ["qi-v2-1.0.0", "qi-v2-extra-2.0.0"])).toBeNull();
    expect(newer(l, ["qi-v2-1.0.0", "qi-v2-1.1.0"])).toBe("qi-v2-1.1.0");
    expect(lineOf(l, "h".repeat(40), null, rel(["qi-v2-1.0.0"]))).toContain("current");
    expect(lineOf(l, "h".repeat(40), null, rel(["qi-v2-1.0.0", "qi-v2-1.1.0"]))).toContain(
      "outdated: locked qi-v2-1.0.0 (hhhhhhhhhh), https://github.com/o/r: qi-v2-1.1.0 is released: &ref=qi-v2-1.1.0 in flake.nix, then nix flake update lib",
    );
  });
  it("says an input that follows a release's tag outdated where a newer release is out, with how to take it", () => {
    const c = named("contract");
    expect(lineOf(c, "g".repeat(40), null)).toContain("current");
    expect(lineOf(c, "g".repeat(40), null, rel(["widget-1.2.0"]))).toContain(
      "outdated: locked widget-1.1.0 (gggggggggg), https://github.com/o/c: widget-1.2.0 is released: ?ref=widget-1.2.0 in flake.nix, then nix flake update contract",
    );
  });
  it("reads a product's releases from git ls-remote: each tag at its commit (an annotated one's ^{}), its release branch", () => {
    const r = releasesOf(
      [
        ["t".repeat(40), "refs/tags/qi-v2-1.0.0"],
        ["h".repeat(40), "refs/tags/qi-v2-1.0.0^{}"],
        ["i".repeat(40), "refs/tags/qi-v2-1.1.0"],
        ["x".repeat(40), "refs/tags/qi-v2-extra-2.0.0"],
        ["x".repeat(40), "refs/tags/qi-v2-extra-2.0.0^{}"],
        ["i".repeat(40), "refs/heads/release/qi-v2"],
        ["y".repeat(40), "refs/heads/release/qi-v2-extra"],
      ],
      "qi-v2",
    );
    expect(r).toEqual({
      tags: [
        { tag: "qi-v2-1.0.0", commit: "h".repeat(40) },
        { tag: "qi-v2-1.1.0", commit: "i".repeat(40) },
      ],
      branch: "i".repeat(40),
    });
    expect(releasesOf([["h".repeat(40), "refs/tags/qi-v2-1.0.0"]], "qi-v2").branch).toBeNull();
  });
  it("judges an input on its release branch by the release the branch is at: current, outdated, or not taken", () => {
    const l = named("line");
    const h = "h".repeat(40);
    expect(productOf(l)).toBe("qi-v2");
    expect(newer(l, ["qi-v2-9.0.0"])).toBeNull();
    expect(byReleases(l, rel([]))).toBe(true);
    expect(lineOf(l, h, null, rel([["qi-v2-1.0.0", h]], h))).toBe(
      "flake.lock line: current (hhhhhhhhhh, qi-v2-1.0.0)",
    );
    expect(
      lineOf(
        l,
        "i".repeat(40),
        null,
        rel([
          ["qi-v2-1.0.0", h],
          ["qi-v2-1.1.0", "i".repeat(40)],
        ]),
      ),
    ).toBe(
      "flake.lock line: outdated: follows release/qi-v2, locked hhhhhhhhhh (qi-v2-1.0.0), https://github.com/o/r: qi-v2-1.1.0 is released: nix flake update line",
    );
    expect(
      lineOf(
        l,
        "j".repeat(40),
        null,
        rel([
          ["qi-v2-1.0.0", h],
          ["qi-v2-2.0.0", "j".repeat(40)],
        ]),
      ),
    ).toContain("qi-v2-2.0.0 is released, a major: see its Changes: nix flake update line");
    expect(lineOf(l, "k".repeat(40), null, rel([["qi-v2-1.0.0", h]]))).toBe(
      "flake.lock line: not taken: release/qi-v2 is at kkkkkkkkkk, which no qi-v2-* tag names (the branch moves only to a release); locked hhhhhhhhhh",
    );
    expect(lineOf(l, h, null, rel([]))).toContain("current (hhhhhhhhhh, no qi-v2-* tag names it)");
  });
  it("says an input that follows main or a tag outdated once its product has a release branch, to take that", () => {
    const b = "i".repeat(40);
    expect(lineOf(named("kit"), "a".repeat(40), null, rel(["kit-0.5.0"], b))).toBe(
      "flake.lock kit: outdated: follows the default branch (aaaaaaaaaa), https://github.com/o/r: kit is taken by its release branch, release/kit: &ref=release/kit in flake.nix, then nix flake update kit",
    );
    expect(lineOf(named("lib"), "h".repeat(40), null, rel(["qi-v2-1.0.0"], b))).toBe(
      "flake.lock lib: outdated: follows qi-v2-1.0.0 (hhhhhhhhhh), https://github.com/o/r: qi-v2 is taken by its release branch, release/qi-v2: &ref=release/qi-v2 in flake.nix, then nix flake update lib",
    );
    expect(byReleases(named("kit"), rel([], b))).toBe(true);
    expect(byReleases(named("kit"), rel([]))).toBe(false);
  });
  it("says an input that comes by one on a release branch is updated by its next release, by nix flake update", () => {
    expect(named("lined").throughRef).toBe("release/qi-v2");
    expect(lineOf(named("lined"), "d".repeat(40), null)).toContain(
      "it comes through line: updated in its lock, then a release of qi-v2, taken by nix flake update line",
    );
  });
  it("does not ask an input that is not git or GitHub", () => {
    expect(lineOf(named("local"), null, null)).toContain("not asked");
  });
  it("refuses a flake.lock it cannot read", () => {
    expect(inputsOf("{").ok).toBe(false);
  });
});
