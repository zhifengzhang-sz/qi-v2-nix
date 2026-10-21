// The kit's command: `kit generate [--kind claude-code|copilot|all] [--root DIR]` writes each kind's files from
// the project's agents/; `kit check [--root DIR]` decodes the spec and writes nothing; `kit run-start --role R`
// and `kit run-check --role R [--files a,b]` check a role's run on its output (run.ts); `kit hook start|stop`
// does it from the Copilot CLI's subagent hooks. The effects (files, git,
// the process's exit) are here; what is written and judged is decided by the pure part (read.ts, kinds/, run.ts).
import { readFileSync } from "node:fs";
import { appendFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { claudeCode } from "../kinds/claude-code.ts";
import type { Generated } from "../kinds/common.ts";
import { type CopilotModels, copilot } from "../kinds/copilot.ts";
import { readSpec, type SpecFiles } from "../read.ts";
import { all, err, type KitError, kitError, ok, type Result } from "../result.ts";
import { changed, type Snapshot, type Status, verdict } from "../run.ts";
import { ModelClass, type Role, RunRecord, type Spec } from "../spec.ts";
import { tryAsync, tryCatch } from "./catch.ts";
import { snapshot } from "./git.ts";

// the generated files of the last run, so that a file no longer generated is removed (a role renamed)
const MANIFEST = "agents.generated";
// the developer's own choices (ignored by git): Copilot's model IDs, which depend on the plan
const LOCAL = "agents.local.json";
// a role's run in progress: the work tree before it (ignored by git)
const RUNS = "agents.run";

const KINDS = ["claude-code", "copilot", "all"] as const;
const Args = z.union([
  z.tuple([z.literal("generate")]).rest(z.string()),
  z.tuple([z.literal("check")]).rest(z.string()),
  z.tuple([z.literal("run-start")]).rest(z.string()),
  z.tuple([z.literal("run-check")]).rest(z.string()),
  z.tuple([z.literal("hook"), z.enum(["start", "stop"])]).rest(z.string()),
]);
// what the Copilot CLI hands a subagentStart or subagentStop hook on its input (notes/copilot.md, Tried in the
// CLI, the payload): the subagent's name, which is the role's, and its run's id; the other fields are not read
const Before = z.record(z.string(), z.string());
const Local = z.strictObject({
  copilot: z.strictObject({ models: z.partialRecord(ModelClass, z.string()) }).optional(),
});

const FLAGS = ["--kind", "--root", "--role", "--files"] as const;
// the flags after the command: each known, each with a value, none twice
const flags = (rest: readonly string[]): Result<Readonly<Record<string, string>>> => {
  const pairs = rest.filter((_, i) => i % 2 === 0).map((f, i) => [f, rest[2 * i + 1]] as const);
  const bad = pairs.filter(
    ([f, v], i) =>
      !FLAGS.some((x) => x === f) ||
      v === undefined ||
      v.startsWith("--") ||
      pairs.findIndex(([g]) => g === f) !== i,
  );
  return bad.length === 0
    ? ok(Object.fromEntries(pairs.map(([k, v]) => [k, v ?? ""])))
    : err(
        kitError(
          "ARGS_INVALID",
          "argv",
          `${bad.map(([f]) => f).join(", ")}: unknown, twice or with no value`,
        ),
      );
};

const text = (root: string, file: string): Promise<Result<{ file: string; text: string }>> =>
  tryAsync("FILE_UNREADABLE", file, async () => ({ file, text: await readFile(join(root, file), "utf8") }));

const listed = async (root: string, dir: string, ext: string): Promise<Result<readonly string[]>> => {
  const r = await tryAsync("FILE_UNREADABLE", dir, () => readdir(join(root, dir)));
  return r.ok
    ? ok(
        r.value
          .filter((f) => f.endsWith(ext))
          .toSorted()
          .map((f) => `${dir}/${f}`),
      )
    : dir === "agents/stages"
      ? ok([])
      : r;
};

const readFiles = async (root: string): Promise<Result<SpecFiles>> => {
  const [rules, roleNames, processNames] = await Promise.all([
    text(root, "agents/rules.md"),
    listed(root, "agents/roles", ".md"),
    listed(root, "agents/stages", ".json"),
  ]);
  if (!rules.ok) return rules;
  if (!roleNames.ok) return roleNames;
  if (!processNames.ok) return processNames;
  const [roles, processes] = await Promise.all([
    Promise.all(roleNames.value.map((f) => text(root, f))).then(all),
    Promise.all(processNames.value.map((f) => text(root, f))).then(all),
  ]);
  if (!roles.ok) return roles;
  if (!processes.ok) return processes;
  return ok({ rules: rules.value, roles: roles.value, processes: processes.value });
};

const localModels = async (root: string): Promise<Result<CopilotModels>> => {
  const r = await tryAsync("FILE_UNREADABLE", LOCAL, () => readFile(join(root, LOCAL), "utf8"));
  if (!r.ok) return ok({});
  const parsed = tryCatch("SPEC_INVALID", LOCAL, () => JSON.parse(r.value) as unknown);
  if (!parsed.ok) return parsed;
  const d = Local.safeParse(parsed.value);
  return d.success
    ? ok(d.data.copilot?.models ?? {})
    : err(kitError("SPEC_INVALID", LOCAL, d.error.issues.map((i) => i.message).join("; ")));
};

const generated = (kind: (typeof KINDS)[number], spec: Spec, models: CopilotModels): readonly Generated[] => {
  const files = [
    ...(kind === "copilot" ? [] : claudeCode(spec)),
    ...(kind === "claude-code" ? [] : copilot(spec, models)),
  ];
  // the rules' files are common to both kinds: each path once
  return files.filter((f, i) => files.findIndex((g) => g.path === f.path) === i);
};

// the kind a generated path belongs to; the rules' files belong to every kind
const kindOf = (path: string): "claude-code" | "copilot" | "rules" =>
  path.startsWith(".github/") ? "copilot" : path.startsWith(".claude/") ? "claude-code" : "rules";

const write = async (
  root: string,
  kind: (typeof KINDS)[number],
  files: readonly Generated[],
): Promise<Result<readonly string[]>> => {
  const old = await tryAsync("FILE_UNREADABLE", MANIFEST, () => readFile(join(root, MANIFEST), "utf8"));
  const now = files.map((f) => f.path);
  const before = old.ok ? old.value.split("\n").filter((p) => p !== "" && !now.includes(p)) : [];
  // stale: a file of a kind this run writes that it wrote no more; another kind's files are kept
  const ours = (p: string) => kind === "all" || kindOf(p) === "rules" || kindOf(p) === kind;
  const stale = before.filter(ours);
  const kept = before.filter((p) => !ours(p));
  const done = await Promise.all([
    ...stale.map((p) => tryAsync("FILE_UNWRITABLE", p, () => rm(join(root, p), { force: true }))),
    ...files.map((f) =>
      tryAsync("FILE_UNWRITABLE", f.path, async () => {
        await mkdir(dirname(join(root, f.path)), { recursive: true });
        await writeFile(join(root, f.path), f.text);
      }),
    ),
  ]).then(all);
  if (!done.ok) return done;
  const m = await tryAsync("FILE_UNWRITABLE", MANIFEST, () =>
    writeFile(join(root, MANIFEST), `${[...now, ...kept].join("\n")}\n`),
  );
  return m.ok ? ok([...now.map((p) => `wrote ${p}`), ...stale.map((p) => `removed ${p}`)]) : m;
};

type Step = {
  readonly status: "RECORDED" | "SKIPPED" | Status;
  readonly lines: readonly string[];
  readonly changed: readonly string[];
};

// a role's run recorded (run-start) or judged (run-check); hookId, where a hook gives the run's id, keys the
// record so two runs at once keep their own records (their changes still mix: the work tree is one)
const runStep = async (
  step: "run-start" | "run-check",
  root: string,
  spec: Spec,
  name: string | undefined,
  files: string | undefined,
  hookId?: string,
): Promise<Result<Step>> => {
  const role = spec.roles.find((r) => r.front.name === name);
  if (role === undefined)
    return err(
      kitError(
        "ARGS_INVALID",
        "--role",
        `${name ?? "(none)"}: one of ${spec.roles.map((r) => r.front.name).join(", ")}`,
      ),
    );
  const at = join(root, RUNS, `${hookId ?? role.front.name}.json`);
  const now = snapshot(root);
  if (!now.ok) return now;
  if (step === "run-start") {
    const w = await tryAsync("FILE_UNWRITABLE", at, async () => {
      await mkdir(dirname(at), { recursive: true });
      await writeFile(at, JSON.stringify(now.value));
    });
    return w.ok
      ? ok({
          status: "RECORDED",
          lines: [
            `${role.front.name}: the work tree recorded, ${Object.keys(now.value).filter((p) => !p.startsWith("(")).length} files differ from HEAD`,
          ],
          changed: [],
        })
      : w;
  }
  const text = await tryAsync("FILE_UNREADABLE", at, () => readFile(at, "utf8"));
  if (!text.ok) return err(kitError("FILE_UNREADABLE", at, `no run-start for ${role.front.name}`));
  const parsed = tryCatch("SPEC_INVALID", at, () => Before.parse(JSON.parse(text.value)) as Snapshot);
  if (!parsed.ok) return parsed;
  // by hand the brief's files are named; a hook does not know them, and the changes are listed
  if (role.front.writes === "brief-files" && files === undefined && hookId === undefined)
    return err(kitError("ARGS_INVALID", "--files", `${role.front.name} writes the brief's files: name them`));
  const v = verdict(role.front, changed(parsed.value, now.value), files?.split(","));
  // the record is used once; one left behind is named, so the next run-check does not read it
  const removed = await tryAsync("FILE_UNWRITABLE", at, () => rm(at, { force: true }));
  return ok({
    status: v.status,
    lines: removed.ok ? v.lines : [...v.lines, `(${at} not removed: ${removed.error.message})`],
    changed: changed(parsed.value, now.value),
  });
};

// a run's id as the CLI gives it, used as a file's name: letters, digits, dot, underscore, hyphen
const HookInput = z.object({
  agentName: z.string(),
  agentId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  response: z.string().optional(),
});

// The hook gives a role, run id, and response, but not a resolved model or usage. Keep that absence explicit in
// a validated staging record; the session replaces it from /usage or OpenTelemetry before it enters a ledger run.
const stageHookRecord = async (
  root: string,
  id: string,
  role: Role,
  response: string | undefined,
  moved: readonly string[],
): Promise<Result<string>> => {
  const report = `${RUNS}/${id}.report.md`;
  const record = RunRecord.parse({
    role: role.front.name,
    kind: "copilot",
    model: "not reported",
    family: "not reported",
    effort: role.front.effort,
    tokens: "not reported",
    tokens_why: "Copilot's hook payload does not provide usage; obtain it from /usage or OpenTelemetry.",
    brief: `agents/roles/${role.front.name}.md`,
    report,
    changed: moved,
  });
  return tryAsync("FILE_UNWRITABLE", `${RUNS}/${id}.run.json`, async () => {
    await writeFile(join(root, report), response ?? "");
    await writeFile(join(root, RUNS, `${id}.run.json`), `${JSON.stringify(record, null, 2)}\n`);
    return `staged ${RUNS}/${id}.run.json`;
  });
};

// a hook of the Copilot CLI: the subagent resolved to its role by agentName, the run recorded on start and judged
// on stop. Total: every outcome, an error included, is a log entry in agents.run/log, its status a word
// (RECORDED, PASS, FAIL, LISTED, SKIPPED, ERROR), and the hook exits 0, so it never stops the CLI. A subagent that is no
// role is let be.
const hookStep = async (
  step: "start" | "stop",
  rest: readonly string[],
): Promise<Result<readonly string[]>> => {
  const f = flags(rest);
  const root = f.ok ? (f.value["--root"] ?? ".") : ".";
  const input = tryCatch("ARGS_INVALID", "the hook's input", () =>
    HookInput.parse(JSON.parse(readFileSync(0, "utf8"))),
  );
  const id = input.ok ? input.value.agentId : "?";
  const outcome = async (): Promise<Result<Step>> => {
    if (!f.ok) return f;
    if (!input.ok) return input;
    const files = await readFiles(root);
    if (!files.ok) return files;
    const spec = readSpec(files.value);
    if (!spec.ok) return spec;
    const name = input.value.agentName;
    const role = spec.value.roles.find((r) => r.front.name === name);
    if (role === undefined)
      return ok({
        status: "SKIPPED",
        lines: [`${name}: not a role of agents/roles; nothing recorded`],
        changed: [],
      });
    const run = await runStep(
      step === "start" ? "run-start" : "run-check",
      root,
      spec.value,
      name,
      undefined,
      id,
    );
    if (!run.ok || step === "start") return run;
    const staged = await stageHookRecord(root, id, role, input.value.response, run.value.changed);
    return ok({
      ...run.value,
      lines: staged.ok
        ? [...run.value.lines, staged.value]
        : [...run.value.lines, `(${staged.error.code} ${staged.error.where}: ${staged.error.message})`],
    });
  };
  const r = await outcome();
  const { status, lines } = r.ok
    ? r.value
    : { status: "ERROR", lines: [`${r.error.code} ${r.error.where}: ${r.error.message}`] };
  const log = join(root, RUNS, "log");
  const time = new Date().toISOString();
  const entry = lines.map((l) => `${time} ${id} ${step} ${status} ${l}`).join("\n");
  const w = await tryAsync("FILE_UNWRITABLE", log, async () => {
    await mkdir(dirname(log), { recursive: true });
    await appendFile(log, `${entry}\n`);
  });
  return ok(w.ok ? lines : [...lines, `(not logged: ${w.error.message})`]);
};

const run = async (argv: readonly string[]): Promise<Result<readonly string[]>> => {
  const a = Args.safeParse(argv);
  if (!a.success)
    return err(
      kitError(
        "ARGS_INVALID",
        "argv",
        "usage: kit generate|check [--kind K] [--root DIR] | kit run-start|run-check --role R [--files a,b] [--root DIR] | kit hook start|stop [--root DIR] (the hook's JSON on stdin)",
      ),
    );
  if (a.data[0] === "hook") return hookStep(a.data[1] === "start" ? "start" : "stop", argv.slice(2));
  const f = flags(argv.slice(1));
  if (!f.ok) return f;
  const root = f.value["--root"] ?? ".";
  const kind = f.value["--kind"] ?? "all";
  const k = KINDS.find((x) => x === kind);
  if (k === undefined) return err(kitError("KIND_UNKNOWN", "--kind", `${kind}: one of ${KINDS.join(", ")}`));
  const files = await readFiles(root);
  if (!files.ok) return files;
  const spec = readSpec(files.value);
  if (!spec.ok) return spec;
  if (a.data[0] === "check")
    return ok([`spec: ${spec.value.roles.length} roles, ${spec.value.processes.length} processes, valid`]);
  if (a.data[0] === "run-start" || a.data[0] === "run-check") {
    const r = await runStep(a.data[0], root, spec.value, f.value["--role"], f.value["--files"]);
    if (!r.ok) return r;
    return r.value.status === "FAIL"
      ? err(kitError("RUN_OUTSIDE", f.value["--role"] ?? "", `\n${r.value.lines.join("\n")}`))
      : ok(r.value.lines);
  }
  const models = await localModels(root);
  if (!models.ok) return models;
  return write(root, k, generated(k, spec.value, models.value));
};

const report = (r: Result<readonly string[], KitError>): number => {
  if (r.ok) {
    process.stdout.write(`${r.value.join("\n")}\n`);
    return 0;
  }
  process.stderr.write(`kit: ${r.error.code} ${r.error.where}: ${r.error.message}\n`);
  return 1;
};

process.exitCode = report(await run(process.argv.slice(2)));
