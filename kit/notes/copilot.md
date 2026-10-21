# GitHub Copilot agent features, as of 2026-10-16

Tags: [READ] a page I read in full or in the relevant part (WebFetch result or a local text dump of the page); [SUMMARY] a search summary only; [INFER] my inference.
WebFetch answers come through a small model, so quotations marked "quote" are as that tool returned them, not guaranteed character for character, except the CLI reference, which I downloaded and grepped (the text dump of the page, 176k characters, all of it searched).

Surfaces: CLI = Copilot CLI (`copilot`), Cloud = the coding agent (cloud agent) on GitHub, VSC = Copilot agent mode in VS Code.

## Sources

- CLI reference: https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference [READ, downloaded and grepped]
- Custom agents configuration: https://docs.github.com/en/copilot/reference/custom-agents-configuration [READ]
- Custom agents for CLI: https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli [READ]
- Custom agents for cloud agent: https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/create-custom-agents [READ]; concept page https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-custom-agents [READ]
- Repository instructions: https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions [READ]
- CLI programmatic reference: https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference [READ]
- Hooks reference: https://docs.github.com/en/copilot/reference/hooks-reference [READ]
- Dynamic workflows (concept): https://docs.github.com/en/copilot/concepts/agents/dynamic-workflows [READ]; how-to https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-dynamic-workflows [SUMMARY]; changelog https://github.blog/changelog/2026-10-01-dynamic-workflows-in-copilot-cli-and-the-copilot-app [SUMMARY]
- /fleet: https://docs.github.com/en/copilot/concepts/agents/copilot-cli/fleet [SUMMARY]
- VS Code custom agents https://code.visualstudio.com/docs/copilot/customization/custom-agents [READ]; subagents https://code.visualstudio.com/docs/copilot/agents/subagents [READ]; instructions https://code.visualstudio.com/docs/copilot/customization/custom-instructions [READ]; skills https://code.visualstudio.com/docs/copilot/customization/agent-skills [READ]
- Cloud agent overview: https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent [READ]
- Failure report with Claude aliases: https://github.com/kangig94/coral/issues/427 (third-party repo, Copilot CLI 1.0.95-3) [READ via gh]
- Copilot CLI README https://github.com/github/copilot-cli [READ, thin: model default, MCP, LSP, autopilot only; it is stale, says Sonnet 4.5 default]

## 1. Instructions

CLI [READ, CLI reference, table "Location / Notes"]: reads, "In Git root and cwd": `CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, `.github/instructions/**/*.instructions.md`, `.claude/rules/**/*.md`, `.github/copilot-instructions.md`. User level: `$HOME/.copilot/copilot-instructions.md`, `$HOME/.copilot/instructions/**/*.instructions.md`. Extra directories through env `COPILOT_CUSTOM_INSTRUCTIONS_DIRS`. `.claude/rules` files are read like `.instructions.md`, scoped by a `paths` (or `applyTo`) frontmatter key. `@path` imports inside `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md` are inlined recursively (depth, cycle and size guards). `--no-custom-instructions` turns all off. `copilot init` creates instructions; `copilot instruction list` shows what is discovered.
The CLI page gives no precedence order among these files. [READ: absent]
- Subagents: a custom agent spawned as a subagent does NOT get `copilot-instructions.md`, `AGENTS.md`, `CLAUDE.md` unless its frontmatter has `include-custom-instructions: true` (default false). The session agent and `general-purpose` get them; built-in `explore`, `task`, `code-review` do not. [READ] [INFER] A "standing rules" file reaches a read-only reviewer subagent only if the agent file opts in.

Cloud and code review [READ, repository-instructions page]: `.github/copilot-instructions.md`; path-specific `NAME.instructions.md` under `.github/instructions` with `applyTo` glob (frontmatter `excludeAgent: "code-review"|"cloud-agent"`); agent instructions `AGENTS.md` "anywhere within the repository", or one `CLAUDE.md` or `GEMINI.md` "in the root". Precedence: personal > repository > organization, all provided; path-specific and repo-wide both used; "the nearest `AGENTS.md` file in the directory tree will take precedence". The page says path-specific instructions on GitHub.com are supported only by cloud agent and code review. It does not give a per-surface matrix (what Cloud reads exactly is as above, from this page's statements).

VSC [READ, VS Code instructions page]: `.github/copilot-instructions.md`; `AGENTS.md` (root; nested files experimental, `chat.useNestedAgentsMdFiles`, off by default); `CLAUDE.md` (Local harness also `.claude/CLAUDE.md`, `~/.claude/CLAUDE.md`, `CLAUDE.local.md`, when `chat.useClaudeMdFile` enabled); `.claude/rules` (`paths` instead of `applyTo`); `.github/instructions/*.instructions.md` with `applyTo` or `description`. Precedence: none; "Applicable instruction sources are additive", the page advises not to rely on order.

[INFER] For this project: a root `CLAUDE.md` and an `AGENTS.md` are both read by all three surfaces; `AGENTS.md` is the safest common file. Nested CLAUDE.md files are read only in Git root and cwd by the CLI (so the materials folder CLAUDE.md is read only if cwd is there or it is the repo root).

## 2. Custom agents

Exist on all three. [READ]
- Format: Markdown with YAML frontmatter, extension `.agent.md` (CLI doc: "Each custom agent is defined by a Markdown file with an `.agent.md` extension"); the CLI also accepts plain `.md` ("removes the `.agent.md` or `.md` extension"). Agent ID = path relative to the agents dir, extension removed, separators replaced by `--`.
- Locations, CLI [READ, CLI reference "Custom agent locations"], priority high to low: 1 `~/.copilot/agents/`; 2 `.github/agents/` from cwd up to the Git root; 3 `.claude/agents/` from cwd up to the Git root; 4 `.github/agents/` of a directory added by `--add-dir`; 5 plugin `<plugin>/agents/`; 6 organization or enterprise agents. Same ID: first loaded wins. All project `.github/agents/` load before any project `.claude/agents/`. `name` does not dedupe.
- So the CLI DOES read `.claude/agents/*.md`. [READ] VSC also: `.claude/agents` "Claude format" and `~/.claude/agents`; plain `.md`, fields `name`, `description`, `tools` (comma-separated string), `disallowedTools`; "maps Claude-specific tool names to the corresponding VS Code tools". [READ, VS Code custom-agents page]
- Cloud: `.github/agents/NAME.md` in the repository; org/enterprise `/agents/NAME.md` in `.github` or `.github-private`. The cloud page does not mention `.claude/agents`. Prompt up to 30,000 characters; file names only `.-_a-zA-Z0-9`. [READ]
- Frontmatter, CLI [READ, CLI reference table]: `description` (required), `name`, `tools` (string[], default `["*"]`), `model`, `models` (string[], priority order), `modelPolicy` ("preferred" default or "required"), `reasoningEffort`, `infer` (allow auto-delegation; default true), `mcp-servers`, `include-custom-instructions`.
- Frontmatter, general page [READ, custom-agents-configuration]: `name`, `description` (required), `target` (`vscode`|`github-copilot`), `tools` (comma string or YAML list), `model`, `disable-model-invocation`, `user-invocable`, `infer` (retired), `mcp-servers` (not in VS Code), `metadata`. `handoffs`: not supported on GitHub.com (ignored). VSC adds `agents` (allowed subagents; needs `agent` tool), `handoffs`, `argument-hint`, `hooks` (preview). `model` there may be a prioritized list.
- The page says "Some properties may function differently or be ignored between environments". The cloud page lists `model` as honored only in VS Code, JetBrains, Eclipse, Xcode; it does not say whether Cloud on GitHub.com honors `model`. [READ]

Why the project's reviewer failed with "default model aliases were unavailable" [no source found for that exact phrase; searched twice]:
- Explanation supported by evidence: Claude Code agent files carry `model: opus|sonnet|haiku`. Copilot reads `.claude/agents/` and treats the value as a Copilot model ID; the aliases are not in its catalogue. The kangig94/coral issue #427 [READ] reproduces it on CLI 1.0.95-3: `Model 'opus' is not available. Available models: claude-sonnet-5.5, ...`; `copilot --model opus|sonnet|haiku|inherit` each exit 1 with `Model "<x>" from --model flag is not available.` The reporter's cause: "no handling that converts the alias to Copilot's model selection". The same issue notes one `.claude/agents` file with `model: sonnet` ran fine without an explicit model, so not every file with an alias fails (the reporter could not tell why). [READ, third-party issue, open, no maintainer answer]
- Contradiction: the CLI reference says a declared model "that can't be honored falls back to the session's value instead of failing the dispatch—unless the agent declares `modelPolicy: "required"`". The issue (v1.0.95-3) shows failure. [INFER] either the fallback is newer than 1.0.95-3, or applies to `model` resolved by plan not to unknown names, or the failure is in a different path (the `--model` flag, or the `task` tool's per-call model). Not settled; test on the installed version.
- The exact string "default model aliases were unavailable" was not found; [INFER] it is the project's or the Copilot runtime's message for the same condition.
- Workaround options [INFER]: omit `model` from agents Copilot will read (inherit session model); or use a full Copilot ID (e.g. `claude-opus-5.5`) in a `.github/agents/` file that shadows... but note `.github/agents` loads first, so a same-ID file there wins over `.claude/agents` in the CLI; or set `models: [...]` list. Claude Code would then reject Copilot IDs in its own files (not checked), so two separate agent directories are needed.

## 3. Models

- Naming: full Copilot model IDs, case-insensitive: the CLI reference lists (picker) `claude-sonnet-5.5` (default), `gpt-5.4`, `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6-luna`, `claude-opus-5.5`, `claude-haiku-5.5`, `claude-haiku-4.5`, `gpt-5.3-codex`, `gemini-3.7-flash`, `gemini-3.8-flash`; plus `auto`, and `/model auto TIER` (efficiency, balance, intelligence). [READ] Availability depends on plan and org policy (issues #3705, #4390 on copilot-cli [SUMMARY]). Note a copilot-cli-related issue reports `claude-sonnet-5-5` (hyphen form, Claude Code's ID style) rejected where `claude-sonnet-5.5` is the form [SUMMARY, hivecommons/hive#9927].
- `opus`, `haiku`, `sonnet` are NOT accepted aliases: evidence is the issue above [READ, third-party]; the official docs list no aliases [READ: absent].
- Several families offered: Anthropic, OpenAI (gpt-*), Google (gemini-*) in the same list. [READ] VSC: model picker; the model name format in handoffs is `Model Name (vendor)`, e.g. `Claude Sonnet 4.5 (copilot)` [READ], so VSC names differ from CLI IDs. [INFER] one `model:` string cannot be shared between CLI and VSC and Claude Code.
- Precedence of model, CLI [READ]: explicit per-call value > `subagents` override in `~/.copilot/settings.json` > agent file `model`/`models`/`reasoningEffort` > parent session. With `--agent`, the agent's model overrides `--model`, `COPILOT_MODEL` and config [READ, programmatic reference]. If session model is Auto, subagents inherit the resolved session model whatever the field says.
- Built-in CLI agents and their default models [READ]: code-review (claude-sonnet-4.6), explore (gpt-5.4-mini), general-purpose (claude-sonnet-4.6), research (claude-haiku-4.5), rubber-duck (a complementary model), security-review (claude-sonnet-4.6), task (gpt-5.6-luna, falling back to gpt-5.4-mini then claude-haiku-4.5). `task` = "Command execution (tests, builds, lints)": the closest built-in to the project's `checker`. [INFER]
- VSC subagent model order [READ]: model the main agent passes to `runSubagent`; the custom agent's `model`; Auto if `chat.subagents.defaultToAuto`; the main model. A model above the main model's cost tier makes the subagent refuse to run.
- Cloud: model choices depend on how the task is started and on plan; no per-agent model statement. [READ]

## 4. Tool permissions

- Tool restriction in an agent file: `tools:` list; unset or `*` = all. Aliases (case-insensitive) [READ, config page]: `execute` (shell, Bash, powershell), `read` (Read, NotebookRead), `edit` (Edit, MultiEdit, Write, NotebookEdit), `search` (Grep, Glob), `agent` (custom-agent, Task), `web` (WebSearch, WebFetch; not Cloud), `todo` (TodoWrite; not Cloud). MCP tools `server/tool` or `server/*`. So Claude tool names appear accepted as aliases. [INFER from alias table; the CLI doc does not describe parsing of Claude `tools: Read, Grep` strings in `.claude/agents`; untested]
- Read-only reviewer: `tools: [read, search]` (no `edit`, no `execute`). Shell-only: `tools: [execute]`. [INFER from aliases; documented as capability, not tested]. Quote of the CLI list: "Include `*` anywhere in the list to grant full tool access—for example, `["view", "*"]` grants every tool".
- Limits: a path-limited writer ("writer limited to named files") is not expressible in agent frontmatter. CLI session-level flags can: `--deny-tool='write(secret.txt)'` (exact or trailing-segment match, "no glob support yet"), `--allow-tool='shell(git:*)'`; kinds `memory`, `read`, `shell`, `url`, `write`, MCP server; "Deny rules always take precedence over allow rules, even when `--allow-all` is set". `--available-tools`, `--excluded-tools` list tool names (`bash/powershell`, `create`, `edit`, `view`, `apply_patch`, `glob`, `grep`, `task`, `list_agents`, `read_agent`, `write_agent`, `skill`, `web_fetch`, `ask_user`). [READ] These are session-wide, not per-agent. [INFER] To limit a "makes-only" checker to `make` targets: `--allow-tool='shell(make:*)'` for the session, but all agents of that session share it; per-agent shell patterns are not in the frontmatter.
- Known bug report: tool filtering ignored when an agent is started with `--agent` (copilot-cli issue #556, in the search summary) [SUMMARY]; I did not read the issue nor see whether fixed. Treat per-agent `tools` enforcement as unverified.
- Non-interactive: `--allow-all`/`--yolo`, `COPILOT_ALLOW_ALL=true`, `--no-ask-user`, `--trust-folder`. Policy can disable bypass (`permissions.disableBypassPermissionsMode`). [READ]
- Cloud: `tools` property in the agent file; default all. [READ]

## 5. Subagents and orchestration

- CLI: `task` tool runs subagents (built-in or custom); `/tasks` views them; subagents can be steered (`write_agent`); `list_agents`/`read_agent`/`write_agent` tools; nested subagents shown as an indented tree; "Safe to run in parallel" is stated for `explore`; background mode exists (the `task` call in the coral issue has `"mode": "background"`). [READ]
- `/fleet` (and `--fleet` with `-i`/`-p`/piped input): "Enable parallel subagent execution of parts of a task"; the orchestrator decides the split; each subagent has its own context window. [READ one line in the reference; details SUMMARY] [INFER] This is the model deciding the batches, not a scripted batch list; the project's own brief-per-batch would be given as prose to the orchestrator.
- `/delegate`: hands changes to the cloud agent to open a PR. [READ one line]
- Dynamic workflows (public preview, announced 2026-10-01; needs `--experimental`): "A dynamic workflow is a program that defines how a task is carried out"; "Everything is defined in code: the steps, when to involve agents, and how to use their results"; steps sequential, parallel or mixed; agents may be asked "to return results in a specified format so that later steps can use them"; resumable with saved step results; caps on concurrent agents, total agents, runtime, AI-credit use; `/workflows` lists current and past runs; run from a script with `copilot workflow run NAME --args JSON|@PATH --result-file PATH --output-format json -s`. Workflows come from Copilot extensions (personal, project, plugin). [READ concept page + CLI reference] Not stated: per-agent model or tool lists in a workflow, and the extension file layout (third party says `.github/extensions/<name>/extension.mjs` [SUMMARY, unconfirmed]). Requires "a token-based-billing plan". [READ]
  [INFER] This is the nearest thing to "process stages: several agents in parallel over batches under a brief, results collected".
- VSC [READ, subagents page]: `runSubagent`; a custom agent can be a subagent, overrides tools and model; coordinator's `agents:` list restricts which; subagents do not inherit conversation history, cannot send follow-ups, cannot ask the user or use todos; nesting off by default (`chat.subagents.allowInvocationsFromSubagents`, max depth 5); each Local invocation stateless; results returned to the main agent. The page does not describe parallel runs for the Local harness (it does for the Codex harness). [READ: absent]
- Cloud: one task, one branch, one PR; 59-minute session maximum; no subagent mention on the cloud pages. Several cloud sessions can exist but the page does not say how many in parallel. [READ: absent]
- Hooks: events include `subagentStart`, `subagentStop`, `preToolUse`, `postToolUse`, `sessionStart`, `sessionEnd`, `agentStop`.

## 6. Skills, prompt files, hooks, MCP

- Skills: directory with `SKILL.md`; frontmatter `name`, `description`, (VSC) `argument-hint`, `user-invocable`, `disable-model-invocation`, `context: fork` (experimental, runs in a subagent). Locations project `.github/skills/`, `.claude/skills/`, `.agents/skills/`; personal `~/.copilot/skills/`, `~/.claude/skills/`, `~/.agents/skills/`. CLI also reads `.claude/commands/*.md` (lower priority than skills; fields `description`, `argument-hint`, `allowed-tools`, `disable-model-invocation`). `copilot skill` manages them. [READ]
- Prompt files (`.prompt.md`) in VSC: not covered by the pages I read; locations and fields not verified. [GAP]
- Hooks [READ]: supported on CLI and Cloud (not listed for VSC in that page though VSC's agent file has `hooks` preview). Config: CLI `.github/hooks/*.json`, `~/.copilot/hooks/`, `.github/copilot/settings.json`, and "Cross-tool `.claude/settings.json` and `.claude/settings.local.json`" are also read; Cloud only `.github/hooks/*.json`. PascalCase event names such as `PreToolUse` get Claude-style matchers and tool names; full Claude Code hook compatibility is not claimed.
- MCP: `~/.copilot/mcp-config.json`, `--additional-mcp-config`, workspace `.mcp.json`; `copilot mcp`; per-agent `mcp-servers`. [READ] Cloud: repository MCP settings. [READ]
- Plugins: `copilot plugin`, marketplaces; plugins can carry agents, hooks. [READ one line]
- Settings in repository: `.github/copilot/settings.json` (and `.local.json`) pin e.g. the default model (`/model --repo`). [READ]

## 7. Run records

- CLI [READ]: `/usage` "Display session usage metrics and statistics, including per-model token totals" (interactive); `/session info|checkpoints|files|plan`; `/context` token usage; `--share=PATH` exports a transcript to markdown after a `-p` run (`--share-gist`); `--log-dir` (default `~/.copilot/logs/`); `--output-format json` gives JSONL; `/collect-debug-logs`. The programmatic page says the model "is shown in the response output" unless `-s`; it does not say token usage appears in `-p` output. [READ]
- OpenTelemetry [READ, CLI reference]: traces and metrics, GenAI semantic conventions; attributes `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, cache read/creation tokens, per agent turn and total; metric `gen_ai.client.token.usage`; model names and durations; by default no prompt content captured (`OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true` to capture). [INFER] This is the way to a per-run record of model and tokens, including subagents (spans per agent were listed; I did not read the span schema in detail).
- Billing: token-based billing plans show AI credits per model in `/usage`. [READ]
- Workflows: `/workflows` history of runs, phases, agents; `--result-file` JSON. [READ]
- Cloud: session logs show work and tools used; whether model and tokens are recorded is not stated. [READ: absent]
- VSC: not found. [GAP]

## 8. Other things a project must know

- The CLI is a fast-moving product (versions 1.0.9x; model names changed between docs pages and README). Pin the CLI version in setup and re-test.
- Per-agent `model` in files read by both Claude Code and Copilot is the main conflict (section 2). `.github/agents/` shadows `.claude/agents/` in the CLI by ID, which permits a Copilot-specific copy. [INFER]
- Dedupe: a project agent in `.claude/agents/` named like a user agent in `~/.copilot/agents/` is shadowed by the user one. [READ]
- Custom agent trust: agents under `--add-dir` are "trusted configuration"; `--trust-folder` for hooks and workspace MCP in non-interactive runs. [READ]
- Built-in `code-review`, `security-review` "will not modify code" (read-only by design), `explore` is read-only fast search. [READ]
- Cloud agent tool aliases `web` and `todo` do not apply. Limits: 59 minutes, one repo, one branch, one PR. [READ]
- Cloud and CLI session start does not read the `.claude/agents` of cloud (not mentioned).

## What Copilot can and cannot do for the project's design [INFER]

| Need | CLI | Cloud | VSC |
|---|---|---|---|
| Reads CLAUDE.md / AGENTS.md | yes (git root, cwd) | AGENTS.md anywhere; CLAUDE.md at root | yes, CLAUDE.md behind a setting |
| Reads `.claude/agents/*.md` | yes | not documented | yes |
| Read-only reviewer | `tools: [read, search]` (unverified, bug report #556) | `tools` | `tools` |
| Checker limited to `make` | session `--allow-tool 'shell(make:*)'`, not per agent | no | not found |
| Writer limited to named files | session `--deny-tool write(...)`, no glob | no | no |
| Per-agent model by family | full IDs (`claude-opus-5.5`, `gpt-5.4`, `gemini-3.7-flash`), not `opus` | not documented | `Name (vendor)` style |
| Parallel agents with briefs | `/fleet` (model decides), `task` background, dynamic workflows (code, preview) | no | subagents, parallel not documented |
| Run record with model and tokens | `/usage`, OTel, `--share`, `/workflows` | session logs only | not found |

## Tried in the CLI (2026-10-16, Copilot CLI 1.0.98, WSL's Ubuntu, by the owner)

- `copilot --agent reviewer -p "List every tool you have…"`, the file `.github/agents/reviewer.agent.md` with `tools: ["read","search"]`: `view`, `skill`, `sql`; no grep or glob, no edit, create or bash. With `tools: ["read","view","search","grep","glob"]`: `view`, `grep`, `glob`, `skill`, `sql`. [TRIED] A role's tools hold in the CLI; the alias `search` alone gives no search, the CLI's own names do.
- A subagent: `copilot -p "Use the custom agent reviewer as a subagent…"` ran it (`Reviewer (model: claude-sonnet-5.5)`: the file names no model, the session's was used). [TRIED]
- Hooks in `.github/hooks/*.json` (`{"version": 1, "hooks": {"<event>": [{"type": "command", "bash": …, "cwd": ".", "timeoutSec": …}]}}`) fire only in a trusted folder: with `--allow-all-tools` alone, none; with `COPILOT_ALLOW_ALL=true` (exactly `true`, which also trusts the working directory, `copilot help environment`), `sessionStart` on each run and `subagentStart`, `subagentStop` around the subagent. [TRIED]

- The payload, a JSON object on the hook's input (captured 11:58, run from the owner's terminal and from Copilot in VS Code, both through the CLI): `subagentStart` {`sessionId`, `timestamp` (ms), `cwd`, `transcriptPath` (the session's `events.jsonl`), `agentName`, `agentDisplayName`, `agentDescription`, `agentId` (a UUID, e.g. `c30221bf-b2ec-48cd-922b-4eed54a5e70d`), `agentType`, `parentAgentId`}; `subagentStop` the same less `agentDescription`, plus `response` (the subagent's answer), `stopReason` (`end_turn`), `stop_hook_active` (false). For the custom agent `reviewer`, `agentName` and `agentType` were both `reviewer`. [TRIED]

## Tried (2026-10-16, VS Code, agent mode)

Copilot in the owner's VS Code, with this project as the workspace, given `agents/` to walk and four probes (its reply is in the session's report to the owner; its model is not known: it could not name the model its picker showed).
- Its task interface offered the project's `reviewer` (read from `.claude/agents/`); starting it failed before a worker ran: `Model 'opus' is not available`, with no fallback. [TRIED] The alias failure of section 2 holds in VS Code too; the fallback the CLI reference describes did not happen here.
- `claude-opus-5.5` was not among the models its runtime reported as available. [TRIED] So a full ID in a generated file is not enough: the IDs a developer can use depend on the plan.
- A search for 中枢 with the path `lessons` found 405 matches in 75 files; with no path, 5,471 matches in 282 files, none in `lessons/`. [TRIED] Its search does not follow the link into the Nix store unless given the path, as `agents/roles/lessons.md` says.
- Whether a subagent's tools can be restricted to read and search: not established (the task interface has no per-call tool parameter, and the reviewer did not start).

## Not found / not read

- The exact phrase "default model aliases were unavailable": no hit. Explanation above is from a third-party issue plus the docs.
- No official statement that `opus`/`sonnet`/`haiku` are unsupported, nor a plan for alias mapping; no maintainer answer on issue #427.
- Whether per-agent `tools` is enforced when the agent is started by `--agent` or as a subagent (issue #556 not read).
- How the CLI parses Claude-style `tools: Read, Grep` strings and `disallowedTools` in `.claude/agents`: documented only for VS Code.
- Whether Cloud honors `model` in a `.github/agents` file; whether Cloud reads `.claude/agents`.
- Prompt files (`.prompt.md`) format and locations; VS Code run records; whether VSC runs subagents in parallel.
- Dynamic-workflow extension layout and API (SDK reference not read); /fleet how-to page and the "Allowing and denying tool use" page not read; the span schema of the OTel section only skimmed through grep.
- Precedence between `AGENTS.md`, `CLAUDE.md` and `copilot-instructions.md` in the CLI: not stated.
- Not tested on an installed Copilot CLI; VS Code: only what Tried names.
