# The rules shared by every project

The kit's own rules, about how the work is done, true of any project that takes the kit. `make agents` puts them
into every project's `AGENTS.md`, each section's shared rules before the project's own, and Every role into each
role's file. A project's `agents/rules.md` holds only what is its own; a rule here is changed here, for every
project.

## The session

Whoever drives the work, of any kind.

- **What goes to the owner is evidence to discuss**, with the session's reading of it.
- **A task for the other model is narrow**: the files and lines to check, never the whole context.
- **Agents are chosen for cost**: a role of `agents/roles/`, at its model, never a general agent for the project's work and no copy of the whole session for a large task. One review round per coherent change, at most one recheck of its confirmed findings, wording not rechecked. Parallel agents only for independent work; reports short.
- **Checks run in the role `checker`**, one builder at a time. Before the first build of a session, ask the owner.
- **Commits** are by explicit paths, after the checks pass, by the session only; the pre-commit hook runs `make verify` on what is staged, whoever commits (once `make install` has set it; `--no-verify` skips it).
- **A role's run is checked on its output.** In the Copilot CLI, in a trusted folder, its hooks check each role's run and append a line to `agents.run/log`: after a run, the session reads its line, and a `FAIL` or `ERROR` means the run is not taken; a `writer` or `researcher` run is only `LISTED` there, and the session checks its files against the brief. By hand, `make run-start ROLE=<role>` before a run and `make run-check ROLE=<role>` after (`FILES=` the brief's files for a role that writes them). Roles run one at a time where their output is checked: two at once mix their changes.
- **Long reports** go to `.reports/` (ignored by `git`): output only, made again by its target or role; a document a later session relies on goes to `docs/designs/` (tracked). A role whose `writes` is `none` gives its findings in its message: ask for them there.
- **The state of the work is in git**: `docs/opening.md` (rewritten by each session at its end for the next), `docs/milestones.md`, `docs/designs/`, `docs/decisions.md`. No agent's own memory is used. Every session, of any kind, ends by writing where it stopped in `docs/opening.md`, and commits it.
- **Docs are docs, decisions are decisions.** A document states what stands and how it works, as plain fact: no one named, no date of a decision, no one quoted. A decision is recorded once, in `docs/decisions.md`: its date, who decided (the owner, or the session as a proposal until the owner decides), the decision and its reason in a line each, and the documents it shapes; a decision still open is there too, under Open, with the proposal.
- **A lock is outdated when its source has moved past what it names**: at the start of a session `make locks-check` asks each lock's source (`flake.lock`'s inputs, a folder input by its folder, and the project's own locks); each outdated lock is reported to the owner with what updates it, and none is updated without the owner's say.
- **A release** has one number, its design's where it has one, written alike in the design, the package's files and the flake package; an entry under Changes in its README; the checker's pass before it is tagged `<product>-<version>` and pushed.
- **Answers are short**, on the key point; once a step is agreed, the agreed steps are carried through without stopping to report or ask; the owner is not asked what the record can answer; no fallbacks: a missing tool or input stops the run with its name; a proposal is for work about to be done.

## Every role

Every agent a role runs as, and the session too.

- **An answer comes from investigation**: the conclusion is what the evidence and the reasoning establish, and the other model tries to refute it. Nobody's say-so is an answer, the owner's included.
- **A question is answered as a question**: "why do we need X?" gets X's reason, from its record and its code, with the evidence. A change is proposed only where the reason no longer holds, and as a step of its own.
- **A design is replaced only once what it gives is known**: before proposing to replace one, list what it guarantees (its design's "What this design guarantees", else its record and its code), and show for each how the new design keeps it, or say plainly that it is lost. An old decision may be overturned; what it was doing is known first. A fundamental change goes to the other model first, its one task to find what the current design does that the new one does not.
- **Each fact has one home** among the working files; other files point to it. A document holds what stands now; its history is in `git`.
- **A check covers everything it checks**: every item it is given; nothing is sampled. What it could not cover, it names.
- **A report gives each finding in its plainest form first**, in one line.
- **One build at a time**: a role that builds is the only one building while it runs; a role that does not build runs no build.
- **Nothing is committed or pushed** but by the session.
- **A secret** (a key, a token, a credentials file) is never read, printed or committed; each project names its own.
