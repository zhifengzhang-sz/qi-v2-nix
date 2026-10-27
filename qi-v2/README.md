# qi-v2: one nixpkgs for every project, a pure shell, and its presets

A flake of its own (`flake.nix`). It pins one `nixpkgs`; a project follows it, so every project at the same qi-v2
version has the same tools, and a newer qi-v2 is taken by bumping the project's own lock.

```nix
inputs.qi-v2.url = "github:zhifengzhang-sz/qi-v2-nix?dir=qi-v2";
inputs.nixpkgs.follows = "qi-v2/nixpkgs";      # the one nixpkgs

devShells.x86_64-linux.default = qi-v2.lib.mkPureShell pkgs {
  name      = "myproject";                     # the prompt, the messages, ~/.cache/<name>/
  uses      = [ (qi-v2.lib.go pkgs) (qi-v2.lib.rust pkgs) ];   # presets
  packages  = [ pkgs.jq ];                     # the project's other tools
  hostTools = [ "nix" "systemd-run" ];         # the only host commands let in
  needs     = [ { tool = "systemd-run"; by = "make test"; } ];  # on = "wsl" or "other" for one of them
  env       = { };                             # the shell's variables
  greeting  = "";  closing = "";               # shell lines said on entry, before and after the needs
};
```

- **`lib.mkPureShell pkgs { … }`**: the shell's path holds the flake's tools and, of the host, only `hostTools`; any
  other command is not found, and the run stops. On entry it says what it is, names each of `needs` the machine
  lacks with what needs it, and marks the prompt with the name. Every shell also has what the person at it types
  in any project: `clear` (ncurses), and of the host `sudo` (setuid, which the Nix store cannot hold), `code`,
  `claude` and `wslpath` (which `code`'s WSL launcher needs). The host's tools are found on the host's path as
  the first entry found it, so a shell entered from inside another (`nix develop` in `nix develop`, one project's
  shell from another's) finds them too; each link is replaced by a rename, so a shell already open never loses one.
- **The presets**, each `pkgs` → `{ packages; env; hook; }`, for `uses`; their caches go under `~/.cache/<name>/`:

  | Preset | Tools | Caches |
  |---|---|---|
  | `tex` | TeX Live with the Chinese collection, luatexja, Erewhon and its maths, Fourier, latexmk, biber; Source Han Serif SC and Sans SC, JuliaMono (`OSFONTDIR`, `FONTCONFIG_FILE`) | — |
  | `haskell` | GHC, cabal | `CABAL_DIR` |
  | `haskellLsp` | haskell-language-server (large; for an editor) | — |
  | `go` | go, gopls; `GOTOOLCHAIN=local` (go never fetches another toolchain) | `GOPATH`, `GOMODCACHE`, `GOCACHE` |
  | `rust` | rustc, cargo, clippy, rustfmt, rust-analyzer | `CARGO_HOME` |
  | `cpp` | cmake, ninja, pkg-config (the compiler is the shell's own, gcc) | — |
  | `lean` | Lean 4's release 4.35.0-rc3, `lean` and `lake`, from Lean's own archive by its hash, in place of elan (which fetched it into `~/.elan` at a first build, outside the store and the lock); linking with the store's C compiler (`LEAN_CC`), as nixpkgs' elan does; x86_64-linux only, any other system stopping with its name. A Lake project's `lean-toolchain` names the same version, which the project checks | `LAKE_CACHE_DIR` |

A version other than the one nixpkgs a project needs is its own explicit input, in its own flake.

A newer qi-v2 is taken by `nix flake update qi-v2` in the project; its lock then names the new commit.
