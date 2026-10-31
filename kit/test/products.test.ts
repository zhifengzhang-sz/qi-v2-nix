// kit products: the command on a copy of the fixture, each fault it names; its pure part on what a table may hold.
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { statedOf } from "../src/products.ts";

const MAIN = join(import.meta.dirname, "../src/edge/main.ts");
const project = () => {
  const root = mkdtempSync(join(tmpdir(), "kit-products-"));
  cpSync(join(import.meta.dirname, "fixture/products"), root, { recursive: true });
  return root;
};
const kit = (root: string) => spawnSync("bun", [MAIN, "products", "--root", root], { encoding: "utf8" });
const edited = (root: string, from: string | RegExp, to: string) => {
  const file = join(root, "PRODUCTS.md");
  const text = readFileSync(file, "utf8");
  const next = text.replace(from, to);
  expect(next).not.toBe(text);
  writeFileSync(file, next);
  return root;
};
const fails = (root: string, fault: string) => {
  const r = kit(root);
  expect(r.status).toBe(1);
  expect(r.stderr).toContain("PRODUCTS_INVALID");
  expect(r.stderr).toContain(fault);
};

describe("kit products", () => {
  it("passes a project whose PRODUCTS.md states what it has, and changes nothing", () => {
    const root = project();
    const files = () => readdirSync(root, { recursive: true }).toSorted();
    const before = files();
    const stated = readFileSync(join(root, "PRODUCTS.md"), "utf8");
    const r = kit(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("PRODUCTS.md: 1 products, 3 taken, valid");
    expect(files()).toEqual(before);
    expect(readFileSync(join(root, "PRODUCTS.md"), "utf8")).toBe(stated);
  });
  it("fails where PRODUCTS.md is missing", () => {
    const root = project();
    rmSync(join(root, "PRODUCTS.md"));
    fails(root, "PRODUCTS.md: missing");
  });
  it("fails where a section is missing, each named", () => {
    fails(edited(project(), "## Responsibility", "## What it does"), "## Responsibility: missing");
    fails(edited(project(), "## Products", "## Produces"), "## Products: missing");
    fails(edited(project(), "## Takes", "### Takes"), "## Takes: missing");
  });
  it("fails where the Responsibility has no text", () => {
    fails(edited(project(), /It owns.*\n/, ""), "## Responsibility: empty");
  });
  it("fails where a column is missing, each named", () => {
    for (const c of ["What", "Form", "Version", "Release", "Doc"])
      fails(edited(project(), `| ${c} |`, "| Other |"), `## Products: no column ${c}`);
    fails(edited(project(), "| Product | What", "| Thing | What"), "## Products: no column Product");
    for (const c of ["From", "Pinned by"])
      fails(edited(project(), `| ${c} |`, "| Other |"), `## Takes: no column ${c}`);
    fails(edited(project(), "| Product | From", "| Thing | From"), "## Takes: no column Product");
  });
  it("fails where a section has no table", () => {
    fails(edited(project(), /\| Product \| From[\s\S]*$/, "None.\n"), "## Takes: no column Pinned by");
  });
  it("fails where a flake input has no row, one that follows another's among them", () => {
    fails(edited(project(), /\| `kit` .*\n/, ""), "## Takes: flake input kit has no row");
    fails(edited(project(), /\| `nixpkgs` .*\n/, ""), "## Takes: flake input nixpkgs has no row");
  });
  it("fails where a root *.lock file has no row, and takes its row under Product or Pinned by", () => {
    fails(edited(project(), /\| the data .*\n/, ""), "## Takes: data.lock has no row");
    const root = edited(
      project(),
      "| the data | a registry | `data.lock` |",
      "| `data.lock` | a registry | a tag |",
    );
    expect(kit(root).status).toBe(0);
  });
  it("asks no row of flake.lock, a hidden file, a folder or a lock inside a folder", () => {
    const root = project();
    writeFileSync(join(root, ".build.lock"), "");
    mkdirSync(join(root, "run.lock"));
    writeFileSync(join(root, "docs/inner.lock"), "");
    expect(kit(root).status).toBe(0);
  });
  it("fails where a row of Takes matches no flake input or lock file", () => {
    fails(
      edited(project(), "| the data |", "| `gone` | a source | `flake.lock` |\n| the data |"),
      '## Takes: the row "gone" matches no flake input or lock file',
    );
    fails(
      edited(project(), "| the data |", "| other data | a source | `other.lock` |\n| the data |"),
      '## Takes: the row "other data" matches no flake input or lock file',
    );
  });
  it("fails where a Doc path does not exist in the project, is empty or leaves the project", () => {
    fails(
      edited(project(), "`docs/tool.md`", "`docs/gone.md`"),
      '## Products: tool: Doc "docs/gone.md" does not exist in the project',
    );
    fails(edited(project(), "| `docs/tool.md` |", "| |"), 'Doc "" does not exist in the project');
    fails(edited(project(), "`docs/tool.md`", "`../outside.md`"), 'Doc "../outside.md" does not exist');
    fails(edited(project(), "`docs/tool.md`", "`/etc/hostname`"), 'Doc "/etc/hostname" does not exist');
  });
  it("takes a folder as a Doc path", () => {
    expect(kit(edited(project(), "`docs/tool.md`", "`docs/`")).status).toBe(0);
  });
  it("names every fault of a run, not only the first", () => {
    const root = edited(edited(project(), /\| `kit` .*\n/, ""), "`docs/tool.md`", "`docs/gone.md`");
    fails(root, "flake input kit has no row");
    fails(root, 'Doc "docs/gone.md"');
  });
  it("has no inputs to check with no flake.lock at the root, and passes", () => {
    const root = edited(edited(project(), /\| `kit` .*\n/, ""), /\| `nixpkgs` .*\n/, "");
    rmSync(join(root, "flake.lock"));
    const r = kit(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("1 products, 1 taken, valid");
  });
  it("passes a table of Takes with no rows, where the project has nothing to list", () => {
    const root = edited(
      project(),
      /(\| Product \| From.*\n.*\n)[\s\S]*$/,
      "$1\nA sentence after the table.\n",
    );
    rmSync(join(root, "flake.lock"));
    rmSync(join(root, "data.lock"));
    expect(kit(root).stdout).toContain("1 products, 0 taken, valid");
  });
  it("still fails a row for an input, and a lock's missing row, with no flake.lock at the root", () => {
    const root = project();
    rmSync(join(root, "flake.lock"));
    fails(root, '## Takes: the row "kit" matches no flake input or lock file');
    fails(edited(root, /\| the data .*\n/, ""), "## Takes: data.lock has no row");
  });
  it("stops at a flake.lock it cannot read, and at a root that is not there", () => {
    const root = project();
    writeFileSync(join(root, "flake.lock"), "{");
    const r = kit(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("SPEC_INVALID flake.lock");
    expect(kit(join(root, "no-such-folder")).stderr).toContain("PRODUCTS.md: missing");
  });
  it("reads a table's cells without their code marks; a pipe written \\| stays in its cell", () => {
    const s = statedOf(
      "## Takes\r\n\r\n| Product | From | Pinned by |\r\n|---|:--|---|\r\n| `a` | b \\| c | `flake.lock` |\r\n\r\n# The end\r\n",
    );
    expect(s.takes?.rows).toEqual([{ Product: "a", From: "b \\| c", "Pinned by": "flake.lock" }]);
  });
});
