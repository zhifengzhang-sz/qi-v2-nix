// From the files' text to the spec: pure, every input decoded through spec.ts (dev/ts/STYLE.md, decode at the
// boundary). The edge reads the files and hands their text here.
import { parseDocument } from "yaml";
import type { z } from "zod";
import { all, chain, err, type KitError, kitError, ok, type Result } from "./result.ts";
import { Process, type Role, RoleFront, type Spec } from "./spec.ts";

// YAML (and JSON, which YAML reads) parsed with its errors as values: no exception crosses here
const parseText = (where: string, text: string): Result<unknown> => {
  const doc = parseDocument(text);
  return doc.errors.length === 0
    ? ok(doc.toJS() as unknown)
    : err(kitError("SPEC_INVALID", where, doc.errors.map((e) => e.message).join("; ")));
};

const decode =
  <S extends z.ZodType>(schema: S, where: string) =>
  (x: unknown): Result<z.infer<S>> => {
    const r = schema.safeParse(x);
    return r.success
      ? ok(r.data)
      : err(
          kitError(
            "SPEC_INVALID",
            where,
            r.error.issues.map((i) => `${i.path.join(".") || "(top)"}: ${i.message}`).join("; "),
          ),
        );
  };

const FRONT = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export const readRole = (file: string, text: string): Result<Role> => {
  const m = FRONT.exec(text);
  return m === null || m[1] === undefined || m[2] === undefined
    ? err(kitError("SPEC_INVALID", file, "no front matter between --- lines"))
    : chain((front: RoleFront) =>
        `${front.name}.md` === file.split("/").at(-1)
          ? ok({ front, body: (m[2] ?? "").trim() })
          : err(kitError("SPEC_INVALID", file, `name ${front.name} is not the file's name`)),
      )(chain(decode(RoleFront, file))(parseText(file, m[1] ?? "")));
};

export const readProcess = (file: string, text: string): Result<Process> =>
  chain((p: Process) =>
    `${p.name}.json` === file.split("/").at(-1)
      ? ok(p)
      : err(kitError("SPEC_INVALID", file, `name ${p.name} is not the file's name`)),
  )(chain(decode(Process, file))(parseText(file, text)));

// a stage's role is one of the spec's roles
const roleProblems = (roles: readonly Role[], processes: readonly Process[]): Result<null> => {
  const missing = processes.flatMap((p) =>
    p.stages
      .filter((s) => s.role !== undefined && !roles.some((r) => r.front.name === s.role))
      .map((s) => `${p.name}.${s.name}: role ${s.role} is not in agents/roles/`),
  );
  return missing.length === 0 ? ok(null) : err(kitError("SPEC_INVALID", "agents/stages", missing.join("; ")));
};

// the section Every role of rules.md: from its heading to the next of its level, or the end
export const everyRole = (file: string, rules: string): Result<string> => {
  const m = /^## Every role\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(rules);
  return m?.[1] === undefined || m[1].trim() === ""
    ? err(kitError("SPEC_INVALID", file, "no section ## Every role"))
    : ok(m[1].trim());
};

export type SpecFiles = {
  readonly rules: { readonly file: string; readonly text: string };
  readonly roles: readonly { readonly file: string; readonly text: string }[];
  readonly processes: readonly { readonly file: string; readonly text: string }[];
};

export const readSpec = (files: SpecFiles): Result<Spec, KitError> =>
  chain((every: string) =>
    chain((roles: readonly Role[]) =>
      chain(
        (processes: readonly Process[]): Result<Spec> =>
          chain(
            (): Result<Spec> => ok({ rules: files.rules.text.trim(), everyRole: every, roles, processes }),
          )(roleProblems(roles, processes)),
      )(all(files.processes.map((f) => readProcess(f.file, f.text)))),
    )(all(files.roles.map((f) => readRole(f.file, f.text)))),
  )(everyRole(files.rules.file, files.rules.text));
