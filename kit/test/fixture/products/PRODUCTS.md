# A project's products

## Responsibility

It owns the tool and its data. It does not own the tools it takes.

## Products

| Product | What | Form | Version | Release | Doc |
|---|---|---|---|---|---|
| `tool` | what the project makes | flake package | 1.0.0 | tag `tool-1.0.0` | `docs/tool.md` |

## Takes

| Product | From | Pinned by |
|---|---|---|
| `kit` | `github:o/r?dir=kit` | `flake.lock` |
| `nixpkgs` | `kit`'s | `flake.lock` |
| the data | a registry | `data.lock` |
