# qi-v2-nix: the common flakes of the qi-v2 projects

Two flakes, each a directory, each taken by a project as an input of its own flake and pinned by that
project's `flake.lock`:

| Flake | What it gives | Input |
|---|---|---|
| `qi-v2/` | one pinned `nixpkgs` for every project; `lib.mkPureShell`, a project's pure shell; `lib.releaseImage`, a released product as an image; the presets `tex`, `haskell`, `haskellLsp`, `go`, `rust`, `cpp`, `lean` (`qi-v2/README.md`) | `inputs.qi-v2.url = "github:zhifengzhang-sz/qi-v2-nix?dir=qi-v2&ref=qi-v2-1.0.0";` (a release, by its tag) and `inputs.nixpkgs.follows = "qi-v2/nixpkgs";` |
| `kit/` | the kit: a project's spec of its agents (`agents/`) into each kind's files, Claude Code and Copilot (`kit/README.md`); built with `qi-v2`'s `nixpkgs` | `inputs.kit.url = "github:zhifengzhang-sz/qi-v2-nix?dir=kit&ref=kit-0.5.0";` (a release, by its tag) and `inputs.kit.inputs.qi-v2.follows = "qi-v2";` |

A project at one release of `qi-v2` has the same tools as every other project at that release; a newer one is taken
by its tag in the project's `flake.nix` (`&ref=qi-v2-<version>`), then `nix flake update qi-v2`. A newer kit is taken
by its tag (`&ref=kit-<version>`), then `nix flake update kit` and `make install`, which relinks `dev/agents` and
runs `make agents`. A project's `make locks-check` (`kit locks`) names each newer release, and an input still
following `main`, with the change that takes it. Needs Nix 2.26 or later (the kit's input `../qi-v2` is a relative
path within this repository).

Setting up a new machine from nothing, by hand: `SETUP.md`.

How every project takes its inputs and publishes its code and data (inputs, locks, releases, private data on
GHCR, the binary cache, docs and decisions, what a project states about itself): `practices.md`. The rules behind
them are the kit's shared rules, `kit/src/rules.md`.

What this repository owns, gives and takes: `PRODUCTS.md`.

The kit's own checks, in a shell with Bun: `cd kit && bun install --frozen-lockfile && bun run check && bun run
typecheck && bun run test`.
