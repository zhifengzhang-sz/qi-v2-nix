# Taking and publishing: the practices of every qi-v2 project

How a project takes what it needs and publishes what it makes. The rules behind them are the kit's shared rules
(`kit/src/rules.md`), which `make agents` puts into every project's `AGENTS.md`; this file is how to do it, with
the reasons.

## 1. Everything from outside is a flake input

- Every Nix package, tool, or other project's product is an input in `flake.nix`; `flake.lock` is the one record
  of which version is used, written by Nix. A language's own dependencies keep the language's lock (`bun.lock`,
  `lean-toolchain` and `lake-manifest.json`), committed beside it; Nix gives the tools that read them.
- A newer version: `nix flake update NAME`, then commit `flake.lock`.
- Another of our projects (they are private) is pinned by SSH:
  `inputs.example.url = "git+ssh://git@github.com/zhifengzhang-sz/example";`
- Its packages are run at the project's own pin: `nix run --inputs-from . example#NAME`, never `github:…#NAME`
  (that takes the default branch, not the pin).
- `nix build --inputs-from .` drops an input's `?dir=`, so an input taken from a folder, such as the kit, is built
  from the reference in `flake.lock`, as the `KIT` variable in a project's Makefile does:
  `github:<owner>/<repo>/<rev>?dir=<dir>`, each part read from the input's `locked`.

Why: one lock for what Nix gives, so every machine and every person builds the same thing.

## 2. A lock is outdated when its source has moved past it

- At the start of every session `make locks-check` asks each lock's source (`kit locks` for `flake.lock`, the
  project's own locks by its own check); each outdated lock is reported with what
  updates it, and none is updated without the owner's say.
- An input taken from a folder of a repository (`?dir=…`) is judged by that folder: the repository moving does not
  count unless the folder changed. Once the folder's product has a release branch (`release/<folder>`, as `qi-v2`
  and `kit` have), an input that follows `main` or a tag is outdated whatever the folder did, and `kit locks` names
  the change: `&ref=release/<folder>` in `flake.nix`, then `nix flake update NAME`. An input on the release branch is
  outdated where a release moved it (`nix flake update NAME`; a major marked), and is not taken where the branch is at
  a commit no release's tag names.

Why: a lock pins a version, and nothing else says when the source has gone on.

## 3. Publishing code: a flake package or a library, one number

- The product is a package of the project's `flake.nix`; a taker pins the project and takes the package.
- One number a product: a product with a design of versions takes its design's (a design's version 1.8 is the
  package's 1.8.0), written alike in the design, `package.json` and the flake package, changed together.
- Every release has its entry under Changes in the product's README.
- The checks pass before the tag; the tag is `<product>-<version>`. Then the release branch, `release/<product>`, is
  moved to it (`git push origin <product>-<version>^{commit}:refs/heads/release/<product>`), a fast forward.
- A taker follows the release branch (`…?ref=release/example`), so each release comes by `nix flake update`, and its
  `flake.nix` changes only to start following it; never `main`, whose commits are not all releases, nor a tag, which
  does not move. An exact pin is `?rev=`.
- A library (a flake's `lib`, no package) is released the same way: its number in `lib.version` and its README,
  its entry under Changes, its tag and its release branch; a taker follows the branch (`qi-v2`:
  `…?dir=qi-v2&ref=release/qi-v2`), and a change not released reaches no taker.

## 4. Publishing private data: a GHCR image, pinned by its own lock

- No data in git, nor on GitHub by another door (Git LFS is that).
- The data is a private image on GHCR, one layer an asset; a lock file in git names the image's tag and every
  file's sha256.
- "Lock" means pinned, not frozen: a new version rewrites it, and committing it is the release.
- Installing takes the files out with crane, as the person, adds them to the Nix store, and the flake's package
  finds each by its hash. An asset already in the store is not fetched again, so a new version costs only the
  assets that changed. So data that changes often (market data) has assets of its own.

Why: GHCR gives access by each person's own GitHub login, with no key to hand out. Nix cannot fetch from GHCR
itself, since its downloads run as its daemon, without the person's login: so crane fetches, and the lock tells Nix
what to expect.

## 5. For the owner's machines only: a Nix binary cache

- An S3-style bucket (Cloudflare R2) holding Nix store paths, read and written by `nix copy`.
- Each reader needs a key of its own, so it suits what is the owner's alone across the owner's machines (build
  outputs, a program only the owner may run), not data many people read.
- Its key is in `~/.aws/credentials`, never in git.

## 6. Docs are docs, decisions are decisions

- A document states what stands and how it works, as plain fact: no one named, no one quoted, no date of a decision.
- Every decision is recorded once, in `docs/decisions.md`: its date, who decided, the decision and its reason, and
  the documents it shapes; open questions there too, with the proposal.
- Before a design is replaced, what it guarantees is listed, and the new design shows how it keeps each, or says
  it is lost. A question ("why do we need X?") gets X's reason, not a redesign.

## 7. What a project states about itself

Every project has `PRODUCTS.md` at its root, with exactly these sections:

- `## Responsibility`: a few sentences on what the project owns and what it does not.
- `## Products`: a table with the columns Product, What, Form, Version, Release, Doc. Form is one of flake package,
  image, library, file. Doc is the path inside the project that holds the detail.
- `## Takes`: a table with the columns Product, From, Pinned by. Every flake input and every `*.lock` file at the
  root except `flake.lock` has a row: a flake input's row has the input's name under Product, a lock file's row
  names it under Pinned by.

`PRODUCTS.md` is an index, so detail stays in the file its row names. It lists what the project takes, never who
takes from it. It changes in the same commit as the change it describes. `make products-check` runs `kit products`,
which fails, naming the fault, where the file and the project disagree.

`make products-check` is one of the kit's targets (section 8).

- `make verify` runs it where `PRODUCTS.md`, `flake.lock` or a root `*.lock` file is staged, so the pre-commit hook
  enforces the same-commit rule.
- Where no `make install` has run (CI, a new machine), `make products-check` runs the kit from the reference in
  `flake.lock` (section 1), `nix run "$(KIT)" -- products --root .`; a project with no Makefile runs `kit products`
  directly.

## 8. The kit's part of a project: its Makefile targets and what git ignores

What the shared rules assume a project has (the kit's README, What the shared rules assume) is, for the kit's part,
the same in every project: these targets in its Makefile and these lines in its `.gitignore`. The project adds its
own checks to `verify` and its own locks to `locks-check`, after the kit's. Every target runs in the project's shell;
`make install` builds the kit with `nix`, so the shell lets in the host's `nix` (`hostTools = [ "nix" … ]`).

```make
# the kit at the commit flake.lock names (section 1), read by nix when make install needs it
KIT = $(shell nix eval --raw --impure --expr 'let l = builtins.fromJSON (builtins.readFile ./flake.lock); k = l.nodes.$${l.nodes.$${l.root}.inputs.kit}.locked; in "github:$${k.owner}/$${k.repo}/$${k.rev}?dir=$${k.dir}"')
NEEDKIT = @test -x dev/agents/bin/kit || { echo "$@: no kit at dev/agents: make install"; exit 1; }
# the kit for the checks: the one make install linked, else run from KIT (CI, or a machine before make install)
KITRUN = $(if $(wildcard dev/agents/bin/kit),dev/agents/bin/kit,nix run "$(KIT)" --)

.PHONY: install agents run-start run-check locks-check products-check verify

install: ## the kit at dev/agents, the pre-commit hook that runs make verify, then make agents
	mkdir -p dev && nix build "$(KIT)" -o dev/agents
	hook=$$(git rev-parse --git-path hooks/pre-commit) && printf '#!/bin/sh\nexec make verify\n' > "$$hook" && chmod +x "$$hook"
	$(MAKE) agents

agents: ## each kind's files from agents/ (kit generate)
	$(NEEDKIT)
	dev/agents/bin/kit generate

run-start: ## before a role's run, ROLE=<role> (kit run-start)
	$(NEEDKIT)
	dev/agents/bin/kit run-start --role "$(ROLE)"

run-check: ## after it, ROLE=<role>, FILES=<a,b> for a role that writes them (kit run-check)
	$(NEEDKIT)
	dev/agents/bin/kit run-check --role "$(ROLE)" $(if $(FILES),--files "$(FILES)")

locks-check: ## whether each lock's source has moved past it (kit locks; then the project's own locks)
	$(KITRUN) locks --root .

products-check: ## whether PRODUCTS.md states what the project has (kit products)
	$(KITRUN) products --root .

verify: ## the checks for what is staged, run by the pre-commit hook (then the project's own checks)
	@if git diff --cached --name-only | grep -qE '^(PRODUCTS\.md|[^/]+\.lock)$$'; then $(MAKE) products-check; fi
```

```gitignore
# the kit's: its link, the files make agents generates, a developer's own choices, a role's run in progress
/dev/agents
/AGENTS.md
/CLAUDE.md
/.claude/agents/
/.claude/workflows/
/.github/agents/
/.github/hooks/kit.json
/agents.generated
/agents.local.json
/agents.run/
/.reports/
```

- `make install` replaces the project's pre-commit hook with the one that runs `make verify`; a project with a hook of
  its own puts it in `verify`.
- `agents/` is the project's own (its rules, roles and stages: the kit's README, What `agents/` holds), and so are
  `docs/opening.md`, `docs/milestones.md`, `docs/designs/` and `docs/decisions.md`.

## Taking them

A project takes the kit by its release branch (`inputs.kit.url =
"github:zhifengzhang-sz/qi-v2-nix?dir=kit&ref=release/kit";`), and a newer kit by `nix flake update kit` and `make
install`: `make install` relinks `dev/agents`, then runs `make agents`, so the shared rules come with it. `kit locks`
says when a newer kit is released. The rest is the project's to do, as above: section 8 is the kit's part of it.
