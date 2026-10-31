// What a project states about itself (practices.md, 7; the shared rules, The session): PRODUCTS.md's sections as they
// are written, and each fault in them given what the project has. Pure; the edge reads the files (edge/products.ts).

const PRODUCT_COLUMNS = ["Product", "What", "Form", "Version", "Release", "Doc"];
const TAKES_COLUMNS = ["Product", "From", "Pinned by"];

type Row = Readonly<Record<string, string>>;
type Table = { readonly columns: readonly string[]; readonly rows: readonly Row[] };

// the three sections, null for one the file does not have; a section with no table has no columns
export type Stated = {
  readonly responsibility: string | null;
  readonly products: Table | null;
  readonly takes: Table | null;
};

// what the project has: flake.lock's inputs, the *.lock files at its root but flake.lock, and those of the paths
// docsOf gave that exist
export type Has = {
  readonly inputs: readonly string[];
  readonly locks: readonly string[];
  readonly docs: readonly string[];
};

// a section's lines: from its heading to the next heading of its level or above, or the end
const sectionOf = (lines: readonly string[], name: string): readonly string[] | null => {
  const at = lines.findIndex((l) => l.trimEnd() === `## ${name}`);
  if (at < 0) return null;
  const rest = lines.slice(at + 1);
  const end = rest.findIndex((l) => /^#{1,2} /.test(l));
  return end < 0 ? rest : rest.slice(0, end);
};

const isRow = (line: string): boolean => line.trimStart().startsWith("|");

// a table line's cells, each without the code marks around it; a pipe in a cell is written \|
const cellsOf = (line: string): readonly string[] =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/^`([^`]*)`$/, "$1"));

// the first table among a section's lines: the columns, the line of dashes, the rows
const tableOf = (lines: readonly string[]): Table => {
  const at = lines.findIndex(isRow);
  const rest = at < 0 ? [] : lines.slice(at);
  const end = rest.findIndex((l) => !isRow(l));
  const [head, dashes, ...body] = end < 0 ? rest : rest.slice(0, end);
  if (head === undefined || dashes === undefined || !/^[\s|:-]+$/.test(dashes))
    return { columns: [], rows: [] };
  const columns = cellsOf(head);
  return {
    columns,
    rows: body.map((l) => {
      const cells = cellsOf(l);
      return Object.fromEntries(columns.map((c, i) => [c, cells[i] ?? ""]));
    }),
  };
};

export const statedOf = (text: string): Stated => {
  const lines = text.split(/\r?\n/);
  const responsibility = sectionOf(lines, "Responsibility");
  const products = sectionOf(lines, "Products");
  const takes = sectionOf(lines, "Takes");
  return {
    responsibility: responsibility === null ? null : responsibility.join("\n").trim(),
    products: products === null ? null : tableOf(products),
    takes: takes === null ? null : tableOf(takes),
  };
};

const cell = (r: Row, column: string): string => r[column] ?? "";

// a path inside the project: named, not absolute, and no step up out of it
const inside = (path: string): boolean =>
  path !== "" && !path.startsWith("/") && !path.split("/").includes("..");

// the Doc paths the edge is to look for; one outside the project is not among them, so it is a fault as one that
// does not exist
export const docsOf = (s: Stated): readonly string[] =>
  (s.products?.rows ?? []).map((r) => cell(r, "Doc")).filter(inside);

const columnFaults = (name: string, t: Table | null, want: readonly string[]): readonly string[] =>
  t === null
    ? [`## ${name}: missing`]
    : want.filter((c) => !t.columns.includes(c)).map((c) => `## ${name}: no column ${c}`);

const docFaults = (t: Table | null, has: Has): readonly string[] =>
  t === null || !t.columns.includes("Doc")
    ? []
    : t.rows
        .filter((r) => !has.docs.includes(cell(r, "Doc")))
        .map(
          (r) => `## Products: ${cell(r, "Product")}: Doc "${cell(r, "Doc")}" does not exist in the project`,
        );

// a flake input's row has its name under Product; a lock file's row names it under Product or Pinned by
const takesFaults = (t: Table | null, has: Has): readonly string[] => {
  if (t === null || !t.columns.includes("Product") || !t.columns.includes("Pinned by")) return [];
  const products = t.rows.map((r) => cell(r, "Product"));
  const pins = t.rows.map((r) => cell(r, "Pinned by"));
  const matches = (r: Row): boolean =>
    has.inputs.includes(cell(r, "Product")) ||
    has.locks.includes(cell(r, "Product")) ||
    has.locks.includes(cell(r, "Pinned by"));
  return [
    ...has.inputs.filter((i) => !products.includes(i)).map((i) => `## Takes: flake input ${i} has no row`),
    ...has.locks
      .filter((l) => !products.includes(l) && !pins.includes(l))
      .map((l) => `## Takes: ${l} has no row`),
    ...t.rows
      .filter((r) => !matches(r))
      .map((r) => `## Takes: the row "${cell(r, "Product")}" matches no flake input or lock file`),
  ];
};

// every fault, each on its own: a missing section or column stands for what could not be compared without it
export const faultsOf = (s: Stated, has: Has): readonly string[] => [
  ...(s.responsibility === null
    ? ["## Responsibility: missing"]
    : s.responsibility === ""
      ? ["## Responsibility: empty"]
      : []),
  ...columnFaults("Products", s.products, PRODUCT_COLUMNS),
  ...columnFaults("Takes", s.takes, TAKES_COLUMNS),
  ...docFaults(s.products, has),
  ...takesFaults(s.takes, has),
];
