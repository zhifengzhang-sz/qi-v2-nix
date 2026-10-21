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
  lacks with what needs it, and marks the prompt with the name.
- **The presets**, each `pkgs` → `{ packages; env; hook; }`, for `uses`; their caches go under `~/.cache/<name>/`:

  | Preset | Tools | Caches |
  |---|---|---|
  | `tex` | TeX Live with the Chinese collection, luatexja, Erewhon and its maths, Fourier, latexmk, biber; Source Han Serif SC and Sans SC, JuliaMono (`OSFONTDIR`, `FONTCONFIG_FILE`) | — |
  | `haskell` | GHC, cabal | `CABAL_DIR` |
  | `haskellLsp` | haskell-language-server (large; for an editor) | — |
  | `go` | go, gopls; `GOTOOLCHAIN=local` (go never fetches another toolchain) | `GOPATH`, `GOMODCACHE`, `GOCACHE` |
  | `rust` | rustc, cargo, clippy, rustfmt, rust-analyzer | `CARGO_HOME` |
  | `cpp` | cmake, ninja, pkg-config (the compiler is the shell's own, gcc) | — |

A version other than the one nixpkgs a project needs is its own explicit input, in its own flake.

A newer qi-v2 is taken by `nix flake update qi-v2` in the project; its lock then names the new commit.
