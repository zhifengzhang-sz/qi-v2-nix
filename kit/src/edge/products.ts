// kit products: PRODUCTS.md against what the project has (products.ts): flake.lock's inputs where it has one, the
// *.lock files at its root, and the paths its Doc cells name. Changes nothing.
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { inputsOf } from "../locks.ts";
import { docsOf, faultsOf, statedOf } from "../products.ts";
import { err, kitError, ok, type Result } from "../result.ts";
import { tryAsync } from "./catch.ts";

const FILE = "PRODUCTS.md";
const LOCK = "flake.lock";

// flake.lock's inputs; a project with none at its root has no inputs
const inputNames = async (root: string): Promise<Result<readonly string[]>> => {
  if (!existsSync(join(root, LOCK))) return ok([]);
  const text = await tryAsync("FILE_UNREADABLE", LOCK, () => readFile(join(root, LOCK), "utf8"));
  if (!text.ok) return text;
  const inputs = inputsOf(text.value);
  return inputs.ok ? ok(inputs.value.map((i) => i.name)) : inputs;
};

// the root's *.lock files as a shell's glob finds them, no hidden file and no folder, but flake.lock
const rootLocks = async (root: string): Promise<Result<readonly string[]>> => {
  const r = await tryAsync("FILE_UNREADABLE", root, () => readdir(root, { withFileTypes: true }));
  return r.ok
    ? ok(
        r.value
          .filter((e) => !e.isDirectory() && e.name.endsWith(".lock"))
          .map((e) => e.name)
          .filter((n) => !n.startsWith(".") && n !== LOCK)
          .toSorted(),
      )
    : r;
};

export const products = async (root: string): Promise<Result<readonly string[]>> => {
  const file = join(root, FILE);
  if (!existsSync(file)) return err(kitError("PRODUCTS_INVALID", file, "missing"));
  const text = await tryAsync("FILE_UNREADABLE", file, () => readFile(file, "utf8"));
  if (!text.ok) return text;
  const [inputs, locks] = await Promise.all([inputNames(root), rootLocks(root)]);
  if (!inputs.ok) return inputs;
  if (!locks.ok) return locks;
  const stated = statedOf(text.value);
  const docs = docsOf(stated).filter((p) => existsSync(join(root, p)));
  const faults = faultsOf(stated, { inputs: inputs.value, locks: locks.value, docs });
  return faults.length === 0
    ? ok([
        `${FILE}: ${stated.products?.rows.length ?? 0} products, ${stated.takes?.rows.length ?? 0} taken, valid`,
      ])
    : err(kitError("PRODUCTS_INVALID", file, `\n${faults.join("\n")}`));
};
