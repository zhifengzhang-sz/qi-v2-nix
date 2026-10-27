// The kit on a fixture spec of its own (test/fixture/agents/): the spec decoded and refused, each kind's files,
// and the generated workflow script run against a stand-in for Claude Code's Workflow tool.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { claudeCode } from "../src/kinds/claude-code.ts";
import { copilot } from "../src/kinds/copilot.ts";
import { readProcess, readRole, readSpec } from "../src/read.ts";
import type { Spec } from "../src/spec.ts";

const FIX = join(import.meta.dirname, "fixture");
const at = (p: string) => ({ file: p, text: readFileSync(join(FIX, p), "utf8") });
const files = {
  rules: at("agents/rules.md"),
  roles: readdirSync(join(FIX, "agents/roles")).map((f) => at(`agents/roles/${f}`)),
  processes: readdirSync(join(FIX, "agents/stages")).map((f) => at(`agents/stages/${f}`)),
};
const decoded = readSpec(files);
const spec = (): Spec => {
  if (!decoded.ok) expect.fail(decoded.error.message);
  return decoded.value;
};
const fileOf = (fs: readonly { path: string; text: string }[], path: string): string =>
  fs.find((f) => f.path === path)?.text ?? expect.fail(`no ${path}`);

describe("the shared rules", () => {
  const shared = {
    file: "rules.md",
    text: "# Shared\n\nThe kit's.\n\n## The session\n\n- A shared session rule.\n\n## Every role\n\n- A shared role rule.\n\n## Only the kit's\n\n- A rule of a section the project lacks.\n",
  };
  const withShared = readSpec({ ...files, shared });
  const merged = (): Spec => {
    if (!withShared.ok) expect.fail(withShared.error.message);
    return withShared.value;
  };
  it("puts the kit's rules first in each section, then the project's own", () => {
    const r = merged().rules;
    expect(r.indexOf("A shared role rule.")).toBeLessThan(r.indexOf("Each fact has one home."));
    expect(r).toContain("**This project's own:**");
    expect(r).not.toContain("The kit's.");
  });
  it("gives every role both, the kit's first", () => {
    const e = merged().everyRole;
    expect(e.indexOf("A shared role rule.")).toBeLessThan(e.indexOf("Each fact has one home."));
  });
  it("keeps a section only the kit has, after the project's", () => {
    expect(merged().rules).toContain("## Only the kit's\n\n- A rule of a section the project lacks.");
  });
  it("refuses a project rule the kit already has, word for word", () => {
    const r = readSpec({
      ...files,
      shared: { ...shared, text: `${shared.text}\n- Each fact has one home.\n` },
    });
    expect(r.ok ? "" : r.error.message).toContain("rules the kit already has");
  });
  it("refuses it wrapped otherwise: a rule is its whole item", () => {
    const r = readSpec({
      ...files,
      shared: { ...shared, text: `${shared.text}\n- Each fact\n  has one home.\n` },
    });
    expect(r.ok ? "" : r.error.message).toContain("rules the kit already has");
  });
  it("takes a rule whose first line only is the kit's as the project's own", () => {
    const r = readSpec({
      ...files,
      shared: { ...shared, text: `${shared.text}\n- Each fact has one home.\n  And one more.\n` },
    });
    expect(r.ok).toBe(true);
  });
  it("without the kit's rules, the project's as they are", () => {
    expect(spec().rules).not.toContain("Shared by every project");
  });
});

describe("the spec", () => {
  it("decodes the fixture, Every role taken from the rules", () => {
    expect(spec().roles.map((r) => r.front.name)).toEqual(["reader"]);
    expect(spec().everyRole).toContain("Each fact has one home.");
    expect(spec().everyRole).not.toContain("Read `README.md` first.");
  });
  it("refuses a role with an unknown model class, naming the field", () => {
    const r = readRole(
      "agents/roles/x.md",
      "---\nname: x\nfor: y\nmodel: opus\neffort: high\ncan: [read]\nwrites: none\nbuilds: false\n---\nbody",
    );
    expect(r.ok ? "" : r.error.message).toContain("model");
  });
  it("refuses a role whose name is not its file's", () => {
    const r = readRole("agents/roles/y.md", at("agents/roles/reader.md").text);
    expect(r.ok ? "" : r.error.message).toContain("not the file's name");
  });
  it("refuses a field the format does not have", () => {
    const r = readRole(
      "agents/roles/reader.md",
      at("agents/roles/reader.md").text.replace("builds: false", "builds: false\ntools: Read"),
    );
    expect(r.ok).toBe(false);
  });
  it("refuses a stage condition outside the named ones, and an order naming no stage", () => {
    const text = at("agents/stages/demo.json").text;
    expect(readProcess("d.json", text.replace('"run failed"', '"it failed"')).ok).toBe(false);
    expect(readProcess("d.json", text.replace('"order": ["count",', '"order": ["counts",')).ok).toBe(false);
  });
});

describe("Claude Code's files", () => {
  const out = () => claudeCode(spec());
  it("a role with the model's alias, the tools mapped, the brief and Every role", () => {
    const t = fileOf(out(), ".claude/agents/reader.md");
    expect(t).toMatch(
      /^---\nname: "reader"\ndescription: "reads the files named and reports: one line a finding"\nmodel: "opus"\neffort: "high"\ntools: "Read, Grep, Glob"\n---\n/,
    );
    expect(t).toContain("- **Reads**: the files the brief names.");
    expect(t).toContain("## Every role (agents/rules.md)\n\n- Each fact has one home.");
  });
  it("the rules as AGENTS.md, CLAUDE.md bringing them in", () => {
    expect(fileOf(out(), "AGENTS.md")).toContain("## The session");
    expect(fileOf(out(), "CLAUDE.md")).toContain("\n@AGENTS.md\n");
  });
});

describe("Copilot's files", () => {
  it("names the developer's model, or none", () => {
    const withModel = fileOf(copilot(spec(), { strongest: "gpt-5.4" }), ".github/agents/reader.agent.md");
    expect(withModel).toContain('model: "gpt-5.4"');
    expect(withModel).toContain('tools: ["read","view","search","grep","glob"]');
    expect(withModel).toContain("include-custom-instructions: false");
    expect(fileOf(copilot(spec(), {}), ".github/agents/reader.agent.md")).not.toContain("model:");
    const hooks = JSON.parse(fileOf(copilot(spec(), {}), ".github/hooks/kit.json"));
    expect(hooks.version).toBe(1);
    expect(hooks.hooks.subagentStart[0].bash).toBe("dev/agents/bin/kit hook start --root .");
    expect(hooks.hooks.subagentStop[0].bash).toBe("dev/agents/bin/kit hook stop --root .");
  });
});

// the generated script against a stand-in for the Workflow tool's globals
type Call = { prompt?: string; label?: string; model?: string; phase?: string; log?: string };
const runWorkflow = async (args: unknown, count: number | null, nullFor: RegExp = /^$/) => {
  const script = fileOf(claudeCode(spec()), ".claude/workflows/demo.js").replace(
    "export const meta =",
    "const meta =",
  );
  const calls: Call[] = [];
  const agent = async (
    prompt: string,
    o: { label: string; model?: string; schema: { properties: object } },
  ) => {
    calls.push({ prompt, label: o.label, ...(o.model ? { model: o.model } : {}) });
    if ("pass" in o.schema.properties)
      return count === null ? { lines: "x", pass: false, count: 0 } : { lines: "x", pass: true, count };
    return nullFor.test(prompt) ? null : { read: 1 };
  };
  const pipeline = (xs: unknown[], f: (x: unknown) => Promise<unknown>) => Promise.all(xs.map(f));
  const run = new Function(
    "args",
    "agent",
    "pipeline",
    "phase",
    "log",
    `return (async () => {${script}\n})()`,
  );
  const record = await run(
    args,
    agent,
    pipeline,
    (t: string) => calls.push({ phase: t }),
    (l: string) => calls.push({ log: l }),
  );
  return { calls, record };
};

describe("the generated workflow", () => {
  it("goes over ranges of the count, with the param's model, padded labels, then the session's model", async () => {
    const { calls } = await runWorkflow({}, 10);
    const tasks = calls.filter((c) => c.prompt?.startsWith("Read items"));
    expect(tasks.map((c) => c.prompt)).toEqual([
      "Read items 1–4 of part 01.",
      "Read items 5–8 of part 02.",
      "Read items 9–10 of part 03.",
    ]);
    expect(tasks.map((c) => [c.label, c.model])).toEqual([
      ["read 1–4", "opus"],
      ["read 5–8", "opus"],
      ["read 9–10", "opus"],
    ]);
    expect(calls.find((c) => c.prompt === "Sum the reads.")).toEqual({
      prompt: "Sum the reads.",
      label: "sum",
    });
  });
  it("takes a model from args by alias or class", async () => {
    const { calls } = await runWorkflow({ readModel: "other", stages: ["count", "read"] }, 4);
    expect(calls.filter((c) => c.prompt?.startsWith("Read")).map((c) => c.model)).toEqual(["fable"]);
  });
  it("skips on a count of 0, stops on a failed run, logs an unknown stage and missing returns", async () => {
    const zero = await runWorkflow({}, 0);
    expect(zero.record.stages[1]).toEqual({ stage: "read", result: "nothing to read" });
    const failed = await runWorkflow({}, null);
    expect(failed.calls.at(-1)).toEqual({ log: "Count failed; stopping" });
    expect(failed.record.stages).toHaveLength(1);
    const odd = await runWorkflow({ stages: ["count", "read", "nope"] }, 8, /items 5/);
    expect(odd.calls.map((c) => c.log).filter(Boolean)).toEqual([
      "Read: 1 ranges returned nothing",
      "unknown stage nope; skipped",
    ]);
  });
});

// a process built from the fixture's, changed by f, decoded
const demo = JSON.parse(at("agents/stages/demo.json").text) as Record<string, unknown> & {
  stages: Record<string, unknown>[];
};
const variant = (f: (p: typeof demo) => unknown) =>
  readProcess("agents/stages/demo.json", JSON.stringify(f(structuredClone(demo))));
const problem = (f: (p: typeof demo) => unknown): string => {
  const r = variant(f);
  return r.ok ? "" : r.error.message;
};
// the process with one stage's fields set, a new value
const set =
  (n: string, fields: Record<string, unknown>) =>
  (p: typeof demo): typeof demo => ({
    ...p,
    stages: p.stages.map((x) => (x.name === n ? { ...x, ...fields } : x)),
  });

describe("what a process may not say", () => {
  it("a run's shape other than lines, pass, count", () => {
    expect(
      problem((p) => ({
        ...p,
        results: { ...(p.results as object), run: { out: { type: "string", for: "x" } } },
      })),
    ).toContain("results.run.lines");
  });
  it("a condition with nothing to read, or read before it exists", () => {
    expect(problem(set("read", { "stop-if": { when: "run failed", log: "x" } }))).toContain(
      "run failed, but no run",
    );
    expect(problem(set("count", { "skip-if": { when: "then failed", record: "x" } }))).toContain(
      "then failed",
    );
    expect(problem(set("read", { "skip-if": { when: "count of sum is 0", record: "x" } }))).toContain(
      "counts sum",
    );
    expect(problem(set("read", { "stop-if": { when: "no parts", log: "x" } }))).toContain(
      "no parts, but no parts",
    );
  });
  it("an unbound placeholder, an each over no list, a model param that is not one, a stage twice, a name not the file's", () => {
    expect(problem(set("read", { task: "Read {a} to {z}." }))).toContain("{z}");
    expect(problem(set("read", { over: { each: "readModel", as: "n" } }))).toContain(
      "not a param whose default is a list",
    );
    expect(problem(set("read", { model: "parts" }))).toContain("{model: a model class}");
    expect(problem((p) => ({ ...p, stages: [...p.stages, p.stages[0]] }))).toContain("named twice");
    expect(problem((p) => ({ ...p, name: "other" }))).toContain("not the file's name");
  });
  it("a role beside a model, and a role no role file names", () => {
    expect(problem(set("sum", { role: "reader" }))).toContain("a role in place of");
    const withRole = {
      ...files,
      processes: [
        {
          file: "agents/stages/demo.json",
          text: JSON.stringify({
            ...demo,
            stages: demo.stages.map((s) =>
              s.name === "sum" ? { ...s, model: undefined, role: "writer" } : s,
            ),
          }),
        },
      ],
    };
    const r = readSpec(withRole);
    expect(r.ok ? "" : r.error.message).toContain("role writer is not in agents/roles/");
  });
});

// the generated runner on a variant of the fixture's process
const runVariant = async (
  f: (p: typeof demo) => unknown,
  args: unknown,
  sc: (cmd: string) => unknown,
  nullFor = /^$/,
) => {
  const p = variant(f);
  if (!p.ok) expect.fail(p.error.message);
  const script = fileOf(claudeCode({ ...spec(), processes: [p.value] }), ".claude/workflows/demo.js").replace(
    "export const meta =",
    "const meta =",
  );
  const calls: Call[] = [];
  const agent = async (
    prompt: string,
    o: { label: string; model?: string; schema: { properties: object } },
  ) => {
    calls.push({ prompt, label: o.label, ...(o.model ? { model: o.model } : {}) });
    return "pass" in o.schema.properties
      ? sc(prompt.split("\n")[1] ?? "")
      : nullFor.test(prompt)
        ? null
        : { read: 1 };
  };
  const pipeline = (xs: unknown[], g: (x: unknown) => Promise<unknown>) => Promise.all(xs.map(g));
  const run = new Function(
    "args",
    "agent",
    "pipeline",
    "phase",
    "log",
    `return (async () => {${script}\n})()`,
  );
  const record = await run(
    args,
    agent,
    pipeline,
    (t: string) => calls.push({ phase: t }),
    (l: string) => calls.push({ log: l }),
  );
  return { calls, record };
};
const passing =
  (count: number, lines = "x") =>
  () => ({ lines, pass: true, count });

describe("the generated workflow, each branch", () => {
  it("each over a param, sequential, one at a time in order", async () => {
    const { calls } = await runVariant(
      set("read", {
        task: "Read part {n:02}.",
        over: { each: "parts", as: "n" },
        mode: "sequential",
        "why-sequential": "one file",
      }),
      { parts: [7, 8] },
      passing(1),
    );
    expect(calls.filter((c) => c.prompt?.startsWith("Read part")).map((c) => [c.prompt, c.label])).toEqual([
      ["Read part 07.", "read 07"],
      ["Read part 08.", "read 08"],
    ]);
  });
  it("parts read from the run's lines, in the stage that has them; no parts skips", async () => {
    const withParts = set("count", {
      parts: "parts (\\d+)-(\\d+)",
      task: "Read part {k}.",
      over: { parts: "count", as: "k" },
      result: "done",
      model: "readModel",
      "skip-if": { when: "no parts", record: "none" },
    });
    const some = await runVariant(withParts, { stages: ["count"] }, passing(3, "listed: parts 2-4"));
    expect(some.calls.filter((c) => c.prompt?.startsWith("Read part")).map((c) => c.prompt)).toEqual([
      "Read part 2.",
      "Read part 3.",
      "Read part 4.",
    ]);
    const none = await runVariant(withParts, { stages: ["count"] }, passing(3, "nothing"));
    expect(none.record.stages[0].result).toBe("none");
    expect(none.calls.some((c) => c.prompt?.startsWith("Read part"))).toBe(false);
  });
  it("then runs after the agents, and stop-if then failed stops after it", async () => {
    const r = await runVariant(
      set("read", {
        // biome-ignore lint/suspicious/noThenProperty: the format's field name, a plain key of data
        then: { run: ["make verify"], count: "lines" },
        "stop-if": { when: "then failed", log: "Read: verify failed" },
      }),
      {},
      (cmd) =>
        cmd === "make verify" ? { lines: "x", pass: false, count: 0 } : { lines: "x", pass: true, count: 2 },
    );
    const prompts = r.calls.map((c) => c.prompt?.split("\n")[1] ?? c.prompt ?? c.log);
    expect(prompts.slice(-3)).toEqual(["Read items 1–2 of part 01.", "make verify", "Read: verify failed"]);
    expect(r.calls.some((c) => c.prompt === "Sum the reads.")).toBe(false);
  });
  it("a stop on a count of 0 stops before any agent", async () => {
    const r = await runVariant(
      set("count", { "stop-if": { when: "count of count is 0", log: "nothing" } }),
      {},
      passing(0),
    );
    expect(r.calls.filter((c) => c.prompt !== undefined)).toHaveLength(1);
    expect(r.calls.at(-1)).toEqual({ log: "nothing" });
  });
});
