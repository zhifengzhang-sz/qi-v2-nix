// Copilot's files from a spec: .github/agents/<role>.agent.md and the rules (common.ts). Its model IDs depend
// on the developer's plan (README.md; notes/copilot.md, Tried), so they come from the developer's own choice
// at setup; with none, the file names no model and the session's is used: an alias such as opus fails.
import type { Can, ModelClass, Role, Spec } from "../spec.ts";
import { brief, frontMatter, type Generated, rulesFiles } from "./common.ts";

export type CopilotModels = Readonly<Partial<Record<ModelClass, string>>>;

// Copilot's aliases with the CLI's own tool names beside them: tried with CLI 1.0.98 (notes/copilot.md, Tried),
// `tools: ["read", "search"]` gave `view` and no grep or glob, so the alias alone does not carry search
const TOOLS: Readonly<Record<Can, readonly string[]>> = {
  read: ["read", "view"],
  search: ["search", "grep", "glob"],
  edit: ["edit", "create"],
  execute: ["execute", "bash"],
  web: ["web", "web_fetch"],
};

const roleFile = (role: Role, everyRole: string, models: CopilotModels): Generated => {
  const model = models[role.front.model];
  return {
    path: `.github/agents/${role.front.name}.agent.md`,
    text: `${frontMatter([
      ["name", role.front.name],
      ["description", role.front.for],
      ["tools", role.front.can.flatMap((c) => TOOLS[c])],
      ...(model === undefined ? [] : [["model", model] as const]),
      ["reasoningEffort", role.front.effort],
      ["include-custom-instructions", false],
    ])}\n${brief(role, everyRole)}`,
  };
};

// the CLI's hooks on a subagent's start and stop: the kit checks the run on its output (README.md, The kit).
// They load only where the folder is trusted (notes/copilot.md, Tried in the CLI).
const hook = (step: "start" | "stop") => [
  { type: "command", bash: `dev/agents/bin/kit hook ${step} --root .`, cwd: ".", timeoutSec: 60 },
];
const hooksFile: Generated = {
  path: ".github/hooks/kit.json",
  text: `${JSON.stringify({ version: 1, hooks: { subagentStart: hook("start"), subagentStop: hook("stop") } }, null, 2)}\n`,
};

export const copilot = (spec: Spec, models: CopilotModels): readonly Generated[] => [
  ...rulesFiles(spec),
  ...spec.roles.map((r) => roleFile(r, spec.everyRole, models)),
  hooksFile,
];
