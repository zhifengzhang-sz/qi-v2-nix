# Copilot in VS Code: Local harness, as of 2026-10-16

Scope: Copilot in VS Code's Local harness only. This note does not assess Copilot CLI, Copilot cloud agent, or VS Code's Claude harness.

Tags: [READ] an official VS Code page read; [OBSERVED] a probe in this session's Copilot SDK host; [INFER] a conclusion from cited behavior; [GAP] not established.

## Sources

- VS Code custom instructions: https://code.visualstudio.com/docs/copilot/customization/custom-instructions [READ]
- VS Code custom agents: https://code.visualstudio.com/docs/agent-customization/custom-agents [READ]
- VS Code subagents: https://code.visualstudio.com/docs/agents/run/subagents [READ]
- VS Code skills: https://code.visualstudio.com/docs/copilot/customization/agent-skills [READ]

## 1. Instructions

VS Code documents these instruction sources:

- `.github/copilot-instructions.md`.
- `AGENTS.md` at the workspace root. Nested `AGENTS.md` support is experimental and off by default (`chat.useNestedAgentsMdFiles`).
- `CLAUDE.md` when `chat.useClaudeMdFile` is enabled; the documented sources include `.claude/CLAUDE.md`, `~/.claude/CLAUDE.md`, and `CLAUDE.local.md`.
- `.claude/rules/` files, using `paths` frontmatter.
- `.github/instructions/*.instructions.md`, using `applyTo` or `description`.

Applicable instruction sources are additive; VS Code advises not relying on precedence. [READ]

## 2. Custom agents and tool access

- Workspace agents can be stored in `.github/agents/` or `.claude/agents/`; user agents have separate Copilot and Claude locations. VS Code supports `.agent.md` files and documents Claude-format files under `.claude/agents/`. [READ]
- Agent frontmatter can define tools. The VS Code custom-agent reference supports a list of tool or tool-set names; the Claude-format compatibility section documents `tools` and `disallowedTools`. A read-and-search-only custom agent is expressible by giving it only those tools. [READ]
- An agent can also declare which agents it may invoke using `agents`; an empty list prevents subagent use. [READ]
- The agent's `model` can be one model name or an ordered list. Availability depends on the models available in that VS Code session. [READ]

## 3. Subagents

- The Local harness uses the `runSubagent` tool. A custom agent can be selected as the subagent and can override the tools and model; a coordinator can constrain which agents it may invoke. [READ]
- The model-selection order is: an explicit model supplied to `runSubagent`, the custom agent's `model`, Auto when `chat.subagents.defaultToAuto` applies, then the main conversation's model. An explicit or agent-configured model above the main model's cost tier prevents the subagent from running and reports available models. [READ]
- Local subagents do not inherit the conversation history, cannot receive follow-up messages on the same invocation, and do not have the built-in ask-user or todo tools. Nested subagents are off by default and have a maximum depth of five when enabled. [READ]
- The Local subagents page does not establish whether Local subagents can be launched in parallel. [GAP]

## 4. What this session established

- An attempted reviewer dispatch using `model: opus` was rejected before a worker ran: `Model 'opus' is not available`. The runtime listed available model choices but did not expose the exact model selected in the chat picker. [OBSERVED]
- That rejection does not establish whether the workspace's `.claude/agents/` was discovered: the task interface did not report the source of the reviewer definition. [GAP]
- VS Code documents restricting a custom agent's tools, but this session did not successfully run a Local subagent with a restricted tool set. [READ] [GAP]

## 4a. Tried by the owner (2026-10-16, the agent picker)

Added by the material's session from the owner's report; [TRIED] the owner's own observation.

- The picker lists the seven agents the kit generated (`checker`, `reviewer`, `writer`, `editor`, `prover`, `lessons`, `researcher`), though `.github/agents/` and `.claude/agents/` are both ignored by git; the hover shows each role's `for` line. It does not show which of the two files it took. [TRIED]
- With `reviewer` selected, asked to list its tools, the agent listed `apply_patch`, `bash`, `web_fetch`, `task` among twenty: the read-and-search restriction of either file (`tools: ["read","search"]`; `Read, Grep, Glob`) did not hold, or the selection did not switch the agent. Either way, a role's `writes: none` is not enforced in this harness; it is checked on the output. [TRIED]
- The workspace search of a Copilot session does not find the generated files: they are ignored by git, and `dev/agents` is a link into the Nix store. [TRIED]

## 5. Not established

- The exact model selected in the VS Code picker for this session.
- Whether a particular model name or alias is available to a given developer's VS Code session; this depends on that session's available models.
- Whether a Local subagent runs in parallel with other Local subagents.
- Whether the observed `opus` rejection came from workspace agent discovery or from the task host's own model validation.
