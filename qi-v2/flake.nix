# qi-v2 (README.md): one pinned nixpkgs for every project, a pure shell (mkPureShell), and presets of tools a
# shell uses: the TeX of the material's books, the toolchains of Haskell, Go, Rust and C++, and Lean. A project takes it
# as an input pinned by its own lock and follows its nixpkgs (inputs.nixpkgs.follows = "qi-v2/nixpkgs"), so every
# project at the same qi-v2 version has the same tools; a newer qi-v2 is taken by bumping that lock.
{
  description = "qi-v2: one nixpkgs for every project, a pure shell (lib.mkPureShell), and its presets (tex, haskell, go, rust, cpp, lean)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs = { self, nixpkgs }:
    let
      lib = nixpkgs.lib;

      # A pure shell for any project, by its name and its tools. Its path holds the flake's tools and, of the host,
      # only `hostTools` (each linked in ~/.cache/<name>/host-tools); any other command is not found, and the run
      # stops (the owner, 2026-10-19: no fallback). The variables that would load the host's libraries or Python
      # packages are unset. `uses`: presets (below), whose packages, variables and hooks join the shell's. On entry
      # it says what it is, runs `greeting`, names each of `needs` the machine lacks (`on`: "any", "wsl" or
      # "other"), runs `closing`, and marks the prompt with the name. `env`: the shell's variables. Every shell
      # also has what the person at it types in any project: clear (ncurses), and of the host `personTools`.
      # The host's tools are found on the host's path as the first entry found it (QI_HOST_PATH), so a shell
      # entered from inside another finds them too; each link is replaced by a rename, so a shell already open
      # never finds one missing. A pure shell's own links are never searched, so a shell entered from one that
      # predates QI_HOST_PATH links no tool to itself; a tool it cannot find there keeps its link while the link
      # still reaches the host.
      # Its path is its own: the path it inherited (nix_saved_PATH) is cut off, so a shell entered from inside another
      # keeps none of the other's tools.
      mkPureShell = pkgs: { name, packages ? [ ], uses ? [ ], hostTools ? [ ], needs ? [ ], env ? { }, greeting ? "", closing ? "" }:
        let
          # sudo (setuid, which the Nix store cannot hold), the editor and the agent, wslpath, which the editor's
          # WSL launcher needs, and docker, the client of the machine's own Docker engine, which runs a product's
          # released image (releaseImage)
          personTools = [ "sudo" "code" "claude" "wslpath" "docker" ];
          allHostTools = lib.unique (hostTools ++ personTools);
          need = n:
            let line = ''__pure_need ${lib.escapeShellArg n.tool} ${lib.escapeShellArg n.by}'';
            in if (n.on or "any") == "wsl" then ''if [ -n "''${WSL_DISTRO_NAME-}" ]; then ${line}; fi''
            else if (n.on or "any") == "other" then ''if [ -z "''${WSL_DISTRO_NAME-}" ]; then ${line}; fi''
            else line;
          presetEnv = lib.foldl' (a: u: a // (u.env or { })) { } uses;
        in pkgs.mkShell (presetEnv // env // {
          packages = [ pkgs.ncurses ] ++ packages ++ lib.concatMap (u: u.packages or [ ]) uses;
          shellHook = ''
            export QI_SHELL_NAME=${lib.escapeShellArg name}
            if [ -z "''${QI_HOST_PATH-}" ]; then export QI_HOST_PATH="$PATH"; fi
            host="$HOME/.cache/${name}/host-tools"
            mkdir -p "$host"
            hp=$(printf '%s' "$QI_HOST_PATH" | tr ':' '\n' | grep -vx "$HOME/\.cache/[^/]*/host-tools" | paste -sd: -)
            for t in ${lib.escapeShellArgs allHostTools}; do
              p=$(PATH="$hp"; command -v "$t") || p=
              case $p in
                /*) ln -s "$p" "$host/.$t.$$" && mv -fT "$host/.$t.$$" "$host/$t" ;;
                *) case $(readlink "$host/$t" 2>/dev/null) in
                     "$HOME"/.cache/*/host-tools/*|"") rm -f "$host/$t" ;;
                     *) [ -e "$host/$t" ] || rm -f "$host/$t" ;;
                   esac ;;
              esac
            done
            for l in "$host"/*; do
              case " ${lib.concatStringsSep " " allHostTools} " in
                *" ''${l##*/} "*) ;;
                *) rm -f "$l" ;;
              esac
            done
            # the shell's own entries only: nix develop (and nix-direnv) put the path it inherited, nix_saved_PATH,
            # after the shell's, so a shell entered from inside another would otherwise keep the other's tools
            own="$PATH"
            if [ -n "''${nix_saved_PATH-}" ]; then
              case "$PATH" in
                *":$nix_saved_PATH") own="''${PATH%":$nix_saved_PATH"}" ;;
                *) echo "${name}: the inherited path is not at the end of PATH: this shell may hold another shell's tools" >&2 ;;
              esac
            fi
            PATH="$(printf '%s' "$own" | tr ':' '\n' | grep '^/nix/store/' | paste -sd: -):$host"
            export PATH
            unset PYTHONPATH PYTHONHOME LD_LIBRARY_PATH LD_PRELOAD
            ${lib.concatMapStrings (u: u.hook or "") uses}
            echo "${name}: this project's shell: every tool from the flake; of the host only:"
            echo "${name}:   ${lib.concatStringsSep " " allHostTools}; exit leaves it"
            ${greeting}
            __pure_need() {
              if [ ! -e "$host/$1" ]; then echo "${name}: $1 is not on this machine: needed by $2"; fi
            }
            ${lib.concatMapStringsSep "\n" need needs}
            unset -f __pure_need
            ${closing}
            export PS1="(${name}) \w \$ "
          '';
        });

      # The presets: each a function of pkgs giving { packages; env; hook; }, for `uses`. A hook runs in the shell
      # after its path is made pure; QI_SHELL_NAME is the shell's name, so each tool's caches go under
      # ~/.cache/<name>/, never to the host's defaults.

      # The TeX of the material's books, set as the book's editions are: ctex on LuaTeX (luatexja), TeX Gyre,
      # Erewhon with its maths, Fourier, latexmk, biber (biblatex's backend); and the fonts it sets (Source Han
      # Serif SC and Sans SC, JuliaMono), with the two variables by which TeX and fontconfig find them. `package`,
      # `fonts`: the parts.
      tex = pkgs:
        let
          fonts = pkgs.symlinkJoin {
            name = "qi-v2-tex-fonts";
            paths = with pkgs; [ source-han-serif source-han-sans julia-mono ];
          };
          package = pkgs.texliveMedium.withPackages (ps: with ps; [
            collection-latexextra collection-langchinese luatexja erewhon erewhon-math fourier latexmk biber
          ]);
        in {
          inherit package fonts;
          packages = [ package ];
          env = {
            OSFONTDIR = "${fonts}/share/fonts";
            FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ fonts ]; };
          };
        };

      # Haskell: GHC and cabal; cabal's store under ~/.cache/<name>/cabal.
      haskell = pkgs: {
        packages = with pkgs; [ ghc cabal-install ];
        hook = ''export CABAL_DIR="$HOME/.cache/$QI_SHELL_NAME/cabal"
'';
      };

      # Haskell's language server, for an editor (large; apart from `haskell`).
      haskellLsp = pkgs: { packages = [ pkgs.haskell-language-server ]; };

      # Go: go and gopls; its path, module cache and build cache under ~/.cache/<name>/go; GOTOOLCHAIN=local, so go
      # never fetches another toolchain of its own.
      go = pkgs: {
        packages = [ pkgs.go pkgs.gopls ];   # pkgs.go by name: `go` here is this preset
        env = { GOTOOLCHAIN = "local"; };
        hook = ''export GOPATH="$HOME/.cache/$QI_SHELL_NAME/go"
export GOMODCACHE="$GOPATH/pkg/mod" GOCACHE="$HOME/.cache/$QI_SHELL_NAME/go-build"
'';
      };

      # Rust: rustc, cargo, clippy, rustfmt, rust-analyzer; cargo's home under ~/.cache/<name>/cargo.
      rust = pkgs: {
        packages = with pkgs; [ rustc cargo clippy rustfmt rust-analyzer ];
        hook = ''export CARGO_HOME="$HOME/.cache/$QI_SHELL_NAME/cargo"
'';
      };

      # C and C++: the compiler is the shell's own (mkShell's stdenv: gcc); cmake, ninja, pkg-config.
      cpp = pkgs: { packages = with pkgs; [ cmake ninja pkg-config ]; };

      # Lean 4: one pinned release for every project, Lean's own release archive fetched by its hash, so that this
      # flake and a project's lock record it; no download at a first build (elan's way, into ~/.elan, outside the
      # store). `lean` and `lake` on the path; a Lake project's lean-toolchain names the same version, which the
      # project checks (Lake reads it only with elan). Its ELF files are patched to the store's libraries; Lake and
      # leanc link with the store's C compiler and Lean's own libraries (`cc` beside them, LEAN_CC), as nixpkgs' elan
      # patches a toolchain, so an executable Lean links runs on any Linux, NixOS and a Nix build among them, not
      # with the bundled clang and sysroot, which would give it the host's loader. Lake's cache under
      # ~/.cache/<name>/lake. A system with no hash here stops with its name. `package`, `version`: the parts.
      lean = pkgs:
        let
          version = "4.35.0-rc3";
          assets = {
            x86_64-linux = { file = "linux"; hash = "sha256-FSbeFsBJbxa0ahaPJsmQr043llBSc8M0L+wX1y12OZc="; };
          };
          system = pkgs.stdenv.hostPlatform.system;
          asset = assets.${system} or (throw "qi-v2 lean: no Lean ${version} for ${system} (qi-v2/flake.nix, lean)");
          package = pkgs.stdenv.mkDerivation {
            pname = "lean4";
            inherit version;
            src = pkgs.fetchurl {
              url = "https://github.com/leanprover/lean4/releases/download/v${version}/lean-${version}-${asset.file}.tar.zst";
              inherit (asset) hash;
            };
            nativeBuildInputs = [ pkgs.zstd pkgs.autoPatchelfHook pkgs.makeWrapper ];
            buildInputs = [ pkgs.stdenv.cc.cc.lib pkgs.zlib ];
            dontConfigure = true;
            dontBuild = true;
            dontStrip = true;
            unpackPhase = "tar --zstd -xf $src";
            installPhase = ''
              mkdir -p $out && cp -r lean-${version}-${asset.file}/. $out/
              printf '#!%s\nexec %s "$@" -L%s\n' ${pkgs.runtimeShell} ${pkgs.stdenv.cc}/bin/cc $out/lib > $out/bin/cc
              chmod +x $out/bin/cc
              wrapProgram $out/bin/lake --set-default LEAN_CC $out/bin/cc
              wrapProgram $out/bin/leanc --set-default LEAN_CC ${pkgs.stdenv.cc}/bin/cc --append-flags "-L$out/lib"
            '';
          };
        in {
          inherit package version;
          packages = [ package ];
          hook = ''export LAKE_CACHE_DIR="$HOME/.cache/$QI_SHELL_NAME/lake"
'';
        };
      # A released product as an image: the operating system under it, the same for every project, is Ubuntu 24.04
      # pinned by its digest (x86_64-linux), so every release starts from the same system; the product, built by
      # Nix, comes in with its run-time closure as the image's entrypoint (not as `contents`, whose own /bin and /lib
      # would hide Ubuntu's). It runs as Ubuntu's ordinary user (1000) in /work, made in the image and owned by it
      # (a taker mounts its folder there). The label org.opencontainers.image.source connects the package on GHCR to
      # its repository; whether it inherits the repository's access is the package's own setting on GitHub.
      # `docker load < result`; then, with a token that can write packages (`docker login ghcr.io`),
      # `docker push ghcr.io/zhifengzhang-sz/<name>:<version>`. A system other than x86_64-linux stops; a package
      # that names no program (meta.mainProgram) stops, unless `entrypoint` is given.
      ubuntuBase = pkgs:
        if pkgs.stdenv.hostPlatform.system != "x86_64-linux"
        then throw "qi-v2 releaseImage: Ubuntu's base is pinned for x86_64-linux only (qi-v2/flake.nix, ubuntuBase)"
        else pkgs.dockerTools.pullImage {
          imageName = "ubuntu";
          imageDigest = "sha256:24737cef17f4e22b1977df7d9a05e77c4e28b7da5b8911f8d8ccda136bf3573c";
          hash = "sha256-iG4eCyKIXExf/F4n0jBsHMazCsJeZCS3VtSGxFrR1yo=";
          finalImageName = "ubuntu";
          finalImageTag = "24.04";
        };
      releaseImage = pkgs: { name, version, package, source, entrypoint ? null }:
        let
          entry =
            if entrypoint != null then entrypoint
            else if package.meta ? mainProgram then [ (lib.getExe package) ]
            else throw "qi-v2 releaseImage: ${name}'s package names no program (meta.mainProgram): give entrypoint";
        in pkgs.dockerTools.buildLayeredImage {
          name = "ghcr.io/zhifengzhang-sz/${name}";
          tag = version;
          fromImage = ubuntuBase pkgs;
          fakeRootCommands = "mkdir -p work && chown 1000:1000 work";
          config = {
            User = "1000:1000";
            WorkingDir = "/work";
            Entrypoint = entry;
            Labels = {
              "org.opencontainers.image.source" = source;
              "org.opencontainers.image.version" = version;
            };
          };
        };

    in {
      lib = { inherit mkPureShell tex haskell haskellLsp go rust cpp lean releaseImage; };
    };
}
