# The kit (README.md): a project's agents/ spec into each kind's files (Claude Code, Copilot). A flake of its
# own, self-contained: a project takes it as an input of its flake, pinned by its lock, and links the package
# (bin/kit, README.md, notes/) at dev/agents. The package bundles src/ with Bun; its two packages (zod, yaml)
# come from bun.lock in a fixed-output derivation, the production ones only: pure JavaScript, so its hash is
# expected the same on every system (built so far on x86_64-linux only). Its nixpkgs is qi-v2's, the flake beside
# it in this repository (../qi-v2), so the kit is built with the same tools as the shells.
{
  description = "The kit: a project's spec of its agents (agents/), and each kind's files from it";

  inputs.qi-v2.url = "path:../qi-v2";
  inputs.nixpkgs.follows = "qi-v2/nixpkgs";

  outputs = { self, nixpkgs, qi-v2 }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAll = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
      src = nixpkgs.lib.fileset.toSource {
        root = ./.;
        fileset = nixpkgs.lib.fileset.unions [ ./package.json ./bun.lock ./src ./README.md ./notes ];
      };
      # the packages' derivation sees only what decides them, so an edit of the code does not fetch them again
      lockOnly = nixpkgs.lib.fileset.toSource {
        root = ./.;
        fileset = nixpkgs.lib.fileset.unions [ ./package.json ./bun.lock ];
      };
    in {
      packages = forAll (pkgs:
        let
          modules = pkgs.stdenvNoCC.mkDerivation {
            pname = "kit-modules";
            version = "0.1.0";
            src = lockOnly;
            nativeBuildInputs = [ pkgs.bun ];
            dontConfigure = true;
            buildPhase = ''
              export HOME=$TMPDIR
              bun install --production --frozen-lockfile --ignore-scripts --no-progress
            '';
            installPhase = "mkdir -p $out && cp -r node_modules $out/";
            dontFixup = true;
            outputHashMode = "recursive";
            outputHashAlgo = "sha256";
            outputHash = "sha256-0oAD/Bgmqmnfi657dpqBxs3HJ6bwd06VPTMZ6g/bmWY=";
          };
          kit = pkgs.stdenvNoCC.mkDerivation {
            pname = "kit";
            version = "0.3.2";
            inherit src;
            nativeBuildInputs = [ pkgs.bun pkgs.makeWrapper ];
            dontConfigure = true;
            buildPhase = ''
              export HOME=$TMPDIR
              ln -s ${modules}/node_modules node_modules
              bun build src/edge/main.ts --target=bun --outfile=kit.js
            '';
            installPhase = ''
              mkdir -p $out/bin $out/lib
              cp kit.js $out/lib/
              cp -r README.md notes $out/
              cp src/rules.md $out/rules.md
              makeWrapper ${pkgs.bun}/bin/bun $out/bin/kit --add-flags $out/lib/kit.js
            '';
          };
        in { default = kit; inherit kit; });
    };
}
