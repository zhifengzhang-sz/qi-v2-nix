# qi-v2-nix: the common flakes of the qi-v2 projects

Two flakes, each a directory, each taken by a project as an input of its own flake and pinned by that
project's `flake.lock`:

| Flake | What it gives | Input |
|---|---|---|
| `qi-v2/` | one pinned `nixpkgs` for every project; `lib.mkPureShell`, a project's pure shell; the presets `tex`, `haskell`, `haskellLsp`, `go`, `rust`, `cpp` (`qi-v2/README.md`) | `inputs.qi-v2.url = "github:zhifengzhang-sz/qi-v2-nix?dir=qi-v2";` and `inputs.nixpkgs.follows = "qi-v2/nixpkgs";` |
| `kit/` | the kit: a project's spec of its agents (`agents/`) into each kind's files, Claude Code and Copilot (`kit/README.md`); built with `qi-v2`'s `nixpkgs` | `inputs.kit.url = "github:zhifengzhang-sz/qi-v2-nix?dir=kit";` and `inputs.kit.inputs.qi-v2.follows = "qi-v2";` |

A project at one commit of this repository has the same tools as every other project at that commit; a newer
one is taken by `nix flake update qi-v2 kit` in the project. Needs Nix 2.26 or later (the kit's input `../qi-v2`
is a relative path within this repository).

How every project takes its inputs and publishes its code and data (inputs, locks, releases, private data on
GHCR, the binary cache, docs and decisions): `practices.md`. The rules behind them are the kit's shared rules,
`kit/src/rules.md`.

The kit's own checks, in a shell with Bun: `cd kit && bun install --frozen-lockfile && bun run check && bun run
typecheck && bun run test`.
