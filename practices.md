# Taking and publishing: the practices of every qi-v2 project

How a project takes what it needs and publishes what it makes. The rules behind them are the kit's shared rules
(`kit/src/rules.md`), which `make agents` puts into every project's `AGENTS.md`; this file is how to do it, with
the reasons.

## 1. Everything from outside is a flake input

- Every library, tool, or other project's product is an input in `flake.nix`; `flake.lock` is the one record of
  which version is used, written by Nix.
- A newer version: `nix flake update NAME`, then commit `flake.lock`.
- Another of our projects (they are private) is pinned by SSH:
  `inputs.materials.url = "git+ssh://git@github.com/zhifengzhang-sz/qi-v2-chanlun-materials";`
- Its packages are run at the project's own pin: `nix run --inputs-from . materials#NAME`, never `github:…#NAME`
  (that takes the default branch, not the pin).

Why: one lock, so every machine and every person builds the same thing.

## 2. A lock is outdated when its source has moved past it

- At the start of every session `make locks-check` asks each lock's source; each outdated lock is reported with what
  updates it, and none is updated without the owner's say.
- An input taken from a folder of a repository (`?dir=…`) is judged by that folder: the repository moving does not
  count unless the folder changed.

Why: a lock pins a version, and nothing else says when the source has gone on.

## 3. Publishing code: a flake package, one number

- The product is a package of the project's `flake.nix`; a taker pins the project and takes the package.
- One number a product: a product with a design of versions takes its design's (a design's version 1.8 is the
  package's 1.8.0), written alike in the design, `package.json` and the flake package, changed together.
- Every release has its entry under Changes in the product's README.
- The checks pass before the tag; the tag is `<product>-<version>`, which a taker can pin (`…?ref=qi-chart-1.8.0`).

## 4. Publishing private data: a GHCR image, pinned by its own lock

- No data in git, nor on GitHub by another door (Git LFS is that).
- The data is a private image on GHCR, one layer an asset; a lock file in git names the image's tag and every
  file's sha256.
- "Lock" means pinned, not frozen: a new version rewrites it, and committing it is the release.
- Installing takes the files out with crane, as the person, adds them to the Nix store, and the flake's package
  finds each by its hash. An asset already in the store is not fetched again, so a new version costs only the
  assets that changed: data that changes often (market data) has assets of its own.

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

## Taking them

A project takes the kit (`inputs.kit.url = "github:zhifengzhang-sz/qi-v2-nix?dir=kit";`), then `nix flake update
kit` and `make agents` whenever the kit moves: the shared rules come with it. The rest is the project's to do, as
above; `qi-v2-chanlun-materials` does it all, and is the example to read.
