// The spec's format as schemas: a role's front matter, a process's stages, a run's record. The format in words
// is README.md; this file is its one schema, and every file of a project's agents/ is decoded through it.
import { z } from "zod";

export const MODEL_CLASSES = ["small", "middle", "strongest", "other"] as const;
export const ModelClass = z.enum(MODEL_CLASSES);
export type ModelClass = z.infer<typeof ModelClass>;

export const Effort = z.enum(["low", "medium", "high"]);
export const CAN = ["read", "search", "edit", "execute", "web"] as const;
export const Can = z.enum(CAN);
export type Can = z.infer<typeof Can>;
export const Writes = z.enum(["none", "brief-files", "the-change"]);

const name = z.string().regex(/^[a-z][a-z0-9-]*$/, "a lower-case name: letters, digits, hyphens");

export const RoleFront = z.strictObject({
  name,
  for: z.string().min(1),
  model: ModelClass,
  effort: Effort,
  can: z.array(Can).min(1),
  writes: Writes,
  builds: z.boolean(),
});
export type RoleFront = z.infer<typeof RoleFront>;

export type Role = { readonly front: RoleFront; readonly body: string };

// the conditions a stage may stop or skip on
const Condition = z
  .string()
  .regex(/^(run failed|then failed|no parts|count of [a-z][a-z0-9-]* is 0)$/, "one of the named conditions");

const Field = z.strictObject({ type: z.enum(["string", "integer", "boolean"]), for: z.string() });

// a param's name (camelCase, as the process names it), {model: a model class}, or session
const StageModel = z.union([z.literal("session"), z.string().min(1), z.strictObject({ model: ModelClass })]);

const Over = z.union([
  z.strictObject({ each: z.string(), as: z.string() }),
  z.strictObject({
    ranges: z.strictObject({ count: name, size: z.number().int().positive() }),
    as: z.tuple([z.string(), z.string()]),
    index: z.string().optional(),
  }),
  z.strictObject({ parts: name, as: z.string() }),
]);

export const Stage = z
  .strictObject({
    name,
    title: z.string(),
    detail: z.string(),
    run: z.array(z.string()).min(1).optional(),
    count: z.string().optional(),
    parts: z.string().optional(),
    task: z.string().optional(),
    role: name.optional(),
    model: StageModel.optional(),
    can: z.array(Can).optional(),
    writes: Writes.optional(),
    result: z.string().optional(),
    over: Over.optional(),
    mode: z.enum(["parallel", "sequential"]).optional(),
    "why-sequential": z.string().optional(),
    // biome-ignore lint/suspicious/noThenProperty: the format's field name (README.md), a plain key of data
    then: z.strictObject({ run: z.array(z.string()).min(1), count: z.string() }).optional(),
    "stop-if": z.strictObject({ when: Condition, log: z.string() }).optional(),
    "skip-if": z.strictObject({ when: Condition, record: z.string() }).optional(),
    missing: z.string().optional(),
  })
  .refine((s) => s.run !== undefined || s.task !== undefined, "a stage has a run, a task, or both")
  .refine((s) => s.run === undefined || s.count !== undefined, "a run has a count")
  .refine((s) => s.task === undefined || s.result !== undefined, "a task has a result")
  .refine(
    (s) => s.task === undefined || s.role !== undefined || s.model !== undefined,
    "a task has a role or a model",
  )
  .refine((s) => s.mode !== "sequential" || s["why-sequential"] !== undefined, "sequential says why")
  .refine((s) => s.over === undefined || s.task !== undefined, "over goes with a task")
  .refine(
    (s) => s.role === undefined || (s.model === undefined && s.can === undefined && s.writes === undefined),
    "a role in place of model, can and writes",
  );
export type Stage = z.infer<typeof Stage>;

const RUN_SHAPE = { lines: "string", pass: "boolean", count: "integer" } as const;

const placeholders = (t: string): readonly string[] =>
  [...t.matchAll(/\{(\w+)(?::\d+)?\}/g)].map((m) => m[1] ?? "");

// what binds a task's placeholders: the names its over gives
const bound = (s: Stage): readonly string[] =>
  s.over === undefined
    ? []
    : "each" in s.over
      ? [s.over.as]
      : "ranges" in s.over
        ? [...s.over.as, ...(s.over.index === undefined ? [] : [s.over.index])]
        : [s.over.as];

type ProcessIn = {
  readonly params: Readonly<Record<string, { readonly default?: unknown }>>;
  readonly order: readonly string[];
  readonly results: Readonly<Record<string, Readonly<Record<string, { readonly type: string }>>>>;
  readonly stages: readonly Stage[];
};

// a condition holds only where it can: what it reads exists before it is read (README.md, A process's stages)
const conditionProblems = (p: ProcessIn, s: Stage): readonly string[] => {
  const check = (when: string, kind: "stop-if" | "skip-if"): readonly string[] => {
    const counted = /^count of (\S+) is 0$/.exec(when)?.[1];
    return [
      ...(when === "run failed" && s.run === undefined ? [`${s.name}: ${kind} run failed, but no run`] : []),
      ...(when === "then failed" && s.then === undefined
        ? [`${s.name}: ${kind} then failed, but no then`]
        : []),
      ...(when === "then failed" && kind === "skip-if"
        ? [`${s.name}: skip-if then failed: then runs after`]
        : []),
      ...(when === "no parts" && s.parts === undefined ? [`${s.name}: ${kind} no parts, but no parts`] : []),
      ...(counted !== undefined && !p.stages.some((x) => x.name === counted && x.run !== undefined)
        ? [`${s.name}: ${kind} counts ${counted}, no stage with a run`]
        : []),
    ];
  };
  return [
    ...(s["stop-if"] === undefined ? [] : check(s["stop-if"].when, "stop-if")),
    ...(s["skip-if"] === undefined ? [] : check(s["skip-if"].when, "skip-if")),
  ];
};

const stageProblems = (p: ProcessIn, s: Stage): readonly string[] => {
  const model = s.model;
  const param = typeof model === "string" && model !== "session" ? p.params[model] : undefined;
  const over = s.over;
  return [
    ...(s.result !== undefined && p.results[s.result] === undefined
      ? [`${s.name}: result ${s.result} is not in results`]
      : []),
    ...(typeof model === "string" && model !== "session" && !ModelRef.safeParse(param?.default).success
      ? [`${s.name}: model ${model} is not a param whose default is {model: a model class}`]
      : []),
    ...(over !== undefined && "each" in over && !Array.isArray(p.params[over.each]?.default)
      ? [`${s.name}: over each ${over.each} is not a param whose default is a list`]
      : []),
    ...(over !== undefined &&
    "ranges" in over &&
    !p.stages.some((x) => x.name === over.ranges.count && x.run !== undefined)
      ? [`${s.name}: ranges over the count of ${over.ranges.count}, no stage with a run`]
      : []),
    ...(over !== undefined &&
    "parts" in over &&
    !p.stages.some((x) => x.name === over.parts && x.parts !== undefined)
      ? [`${s.name}: over the parts of ${over.parts}, no stage with parts`]
      : []),
    ...(s.task === undefined ? [] : placeholders(s.task).filter((n) => !bound(s).includes(n))).map(
      (n) => `${s.name}: {${n}} in the task is bound by no over`,
    ),
    ...(s.missing === undefined ? [] : placeholders(s.missing).filter((n) => n !== "m")).map(
      (n) => `${s.name}: {${n}} in missing: only {m}`,
    ),
    ...conditionProblems(p, s),
  ];
};

// what the schema of one field cannot say: the process's references to itself
export const processProblems = (p: ProcessIn): readonly string[] => [
  ...Object.entries(RUN_SHAPE)
    .filter(([k, t]) => p.results.run?.[k]?.type !== t)
    .map(([k, t]) => `results.run.${k} is not of type ${t}`),
  ...Object.entries(p.params)
    .filter(([, v]) => v.default === undefined)
    .map(([k]) => `params.${k} has no default`),
  ...p.stages
    .map((s) => s.name)
    .filter((n, i, all) => all.indexOf(n) !== i)
    .map((n) => `stage ${n} named twice`),
  ...p.order.filter((n) => !p.stages.some((s) => s.name === n)).map((n) => `order names ${n}, no stage`),
  ...p.stages.flatMap((s) => stageProblems(p, s)),
];

const ModelRef = z.strictObject({ model: ModelClass });

export const Process = z
  .strictObject({
    name,
    for: z.string(),
    when: z.string(),
    doc: z.string(),
    params: z.record(z.string(), z.strictObject({ default: z.unknown(), for: z.string() })),
    order: z.array(name).min(1),
    results: z.record(z.string(), z.record(z.string(), Field)),
    stages: z.array(Stage).min(1),
  })
  .superRefine((p, ctx) => {
    processProblems(p).map((message) => ctx.addIssue({ code: "custom", message }));
  });
export type Process = z.infer<typeof Process>;

export const RunRecord = z.strictObject({
  role: z.string(),
  kind: z.string(),
  model: z.string(),
  family: z.string(),
  effort: Effort,
  tokens: z.union([z.number().int().nonnegative(), z.literal("not reported")]),
  tokens_why: z.string(),
  brief: z.string(),
  report: z.string(),
  changed: z.array(z.string()),
});
export type RunRecord = z.infer<typeof RunRecord>;

// a project's whole spec, decoded
export type Spec = {
  readonly rules: string;
  readonly everyRole: string;
  readonly roles: readonly Role[];
  readonly processes: readonly Process[];
};
