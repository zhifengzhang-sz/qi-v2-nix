# qi-v2-nix: what it owns, gives and takes

## Responsibility

This repository owns what the qi-v2 projects share: one pinned `nixpkgs` with its pure shell, presets and release
image, the kit with its shared rules, how a project takes and publishes, and how a new machine is set up. It does not
own any project's code, data, releases or own rules: each project holds those, and pins what it takes from here in its
own flake.

## Products

| Product | What | Form | Version | Release | Doc |
|---|---|---|---|---|---|
| `qi-v2` | the flake of one pinned `nixpkgs`, `lib.mkPureShell`, the presets and `releaseImage` | library | none | `main`, pinned by commit | `qi-v2/README.md` |
| `kit` | the flake of the kit: a project's `agents/` into each kind's files, `kit locks`, `kit products`, the shared rules | flake package | 0.4.0 | tag `kit-<version>` | `kit/README.md` |
| `practices.md` | how every project takes what it needs and publishes what it makes | file | none | `main` | `practices.md` |
| `SETUP.md` | setting up a new machine by hand | file | none | `main` | `SETUP.md` |

## Takes

| Product | From | Pinned by |
|---|---|---|

The root is no flake and has no lock file, so it has no row. Each flake pins what it takes in its own folder:
`qi-v2/flake.lock` and `qi-v2/flake.nix`, `kit/flake.lock` and `kit/bun.lock`.
