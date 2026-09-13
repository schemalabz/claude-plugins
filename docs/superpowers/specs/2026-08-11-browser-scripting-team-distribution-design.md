# Distributing browser-scripting to the team

**Date:** 2026-08-11
**Status:** Design approved, not yet implemented

## Problem

The `browser-scripting` skill lives in `~/.claude/skills/` on one NixOS machine and is used heavily for PR reviews and general web access. Teammates — on macOS Apple Silicon — have no way to get it.

Distribution of the *skill* is already a solved problem: `schemalabz/claude-plugins` is a public plugin marketplace with `autoUpdate`, and the skill itself is portable markdown plus three ESM scripts. The unsolved problem is the *runtime*. The skill is a thin wrapper over two commands, `page-read` and `playwright-run`, which exist only as NixOS `systemPackages` built from a sub-flake at `nix-openclaw/tools/`. A teammate installing the plugin today would get a skill that confidently instructs them to run two commands that do not exist.

Two concrete blockers sit underneath that. The sub-flake has never been pushed — `nix-openclaw` main is 13 commits ahead of origin, and the entire tools extraction is among the unpushed work, so `github:schemalabz/nix-openclaw?dir=tools` does not resolve. And `tools/flake.nix` hardcodes `system = "x86_64-linux"`, so even once pushed it would expose no outputs for `aarch64-darwin`.

## Constraints

Teammates run macOS on Apple Silicon. They need full parity — `page-read`, `playwright-run`, and the GitHub media-upload recipe — not a reduced subset. Requiring Nix on their machines is acceptable, since `nix run` executes a flake without installing anything, provided onboarding is easy. Setup should auto-detect the runtime and prompt with an exact command when it is missing; it must never silently download hundreds of megabytes, and it must never let a teammate hit a bare "command not found".

## What was verified

The `nix run` path holds on Apple Silicon, and this was checked rather than assumed. Both `playwright-test` and `playwright-driver` evaluate for `aarch64-darwin` against the pinned nixpkgs revision `ac62194c`. The `playwright-browsers` output and all five of its browser payloads — roughly 240 MB in total — are present on `cache.nixos.org`, so teammates download prebuilt binaries and compile nothing. `page-read`'s dependencies (`defuddle`, `linkedom`) are pure JavaScript with no native modules, so `buildNpmPackage` is a fast local build.

The Nix layer turns out to be thin. Both wrappers set `PLAYWRIGHT`, `PLAYWRIGHT_BROWSERS_PATH`, and `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS`, unset `LD_LIBRARY_PATH`, and exec `node`. Every one of those workarounds addresses a NixOS-only problem — NixOS cannot run the dynamically linked binaries Playwright downloads. On macOS that constraint does not exist, and `unset LD_LIBRARY_PATH` is a harmless no-op.

`schemalabz/toolkit` is a viable home. It is described as a collection of CLI tools for Schema Labs operations, is already a flake covering all four systems including `aarch64-darwin` via a `forAllSystems` helper, and already has a `tools/<name>/` convention. Its tracked tree is 43 files totalling a 90 KB archive — the `firmware/` and `data/` directories visible on disk are untracked — so taking it as a flake input costs essentially nothing. It also already runs CI on a `macos-latest` (Apple Silicon) runner and already has a CalVer release skill producing `v*` tags.

## Decisions

The runtime lives in `schemalabz/toolkit` rather than a new repository or inside `claude-plugins`. Hosting the flake in `claude-plugins` was considered seriously and rejected. It would have worked, and it would have dissolved the version-pinning question entirely: plugins install as frozen copies and a skill's base directory is surfaced to the agent at invocation time, so the skill could run `nix run "path:<its-own-dir>/tools#page-read"` and be guaranteed the runtime that shipped with it. The reason not to is that the runtime already has three consumers — the NixOS system configuration, nix-openclaw's agent workspaces, and now the plugin — and a dependency shared by three things should not live inside one of them. It would also mean teammates contributing skills share a repository with a Nix build they can break. The atomic-versioning benefit is real but small, because the interface is two commands and one environment variable and changes rarely.

Consumers pin to release tags — `github:schemalabz/toolkit/<tag>#page-read`, where `<tag>` is whatever CalVer tag toolkit's existing release skill produces (the next one would be `v2026.8.1`). No new release machinery is needed. Because the flake sits at the repository root, there is no `?dir=` in the reference. Note that `?dir=` would not have reduced download size anyway — the `github:` fetcher pulls the whole source tarball and then looks in the subdirectory; only the *build* is scoped, via `buildNpmPackage`'s `src`.

The skill goes into the existing `workflow` plugin rather than a new one, since its dominant use is PR-review verification.

The interaction between `v*` tags and the Tauri `.dmg` build is accepted as-is. Releasing a `page-read` fix will trigger an unrelated desktop-app build; a wasted macOS runner per release is cheaper than complicating the release skill.

## Design

### Runtime in toolkit

`nix-openclaw/tools/` relocates into toolkit: the `page-read/` Node package and the two `.nix` files. Toolkit's flake gains a `packages` output alongside its existing `devShells`, reusing `forAllSystems`, which resolves the hardcoded-system problem by construction.

Toolkit tracks `nixpkgs-unstable`, but `playwright-run` requires `playwright-test` and `playwright-driver.browsers` to be a matched pair — the reason the original sub-flake pins `nixos-25.05`. Toolkit therefore gains a second input, `nixpkgs-playwright`, pinned to revision `ac62194c` and used only by these two packages. The existing `nixpkgs-unstable` input continues to serve the dev shell.

`tools/page-read/` retains its own `package.json` and lockfile rather than folding into toolkit's root dependencies. This follows the precedent already set by `app/`, and keeps `npmDepsHash` from churning whenever an unrelated toolkit dependency moves.

### Existing consumers

`nix-openclaw` drops its `tools/` directory and takes `toolkit` as a flake input. The dotfiles NixOS configuration swaps its `path:` input for the same. The 13 unpushed `nix-openclaw` commits still need pushing for their unrelated gateway, noosphere, and workspace work, but `tools/` never has to be published from there.

### Skill in claude-plugins

`SKILL.md`, `references/github-image-upload.md`, and the three `gh-*.mjs` scripts move to `plugins/workflow/skills/browser-scripting/` essentially unchanged. The single addition is a Runtime section defining a resolution order, which is what lets one skill text serve both a NixOS machine and a Mac:

1. If `page-read` / `playwright-run` are on `PATH`, use them directly. This is the existing NixOS setup, with zero added overhead and no behaviour change.
2. Otherwise invoke via `nix run github:schemalabz/toolkit/<tag>#<tool> -- <args>`.
3. Otherwise — no Nix at all — stop and surface the installer command. Do not install silently.

The first `nix run` downloads roughly 240 MB of prebuilt browsers once; subsequent invocations are store-cached. Teammates who want to avoid even the flake-resolution overhead can optionally `nix profile install` the two packages, which promotes them to case 1.

Because the `PLAYWRIGHT` environment-variable indirection is preserved across both providers, scripts written against the skill are identical on every platform.

### Verification

A CI job on toolkit's existing `macos-latest` runner builds `packages.aarch64-darwin.page-read` and smoke-tests both commands against a real page. This covers the one assumption that could not be checked from a Linux machine: that nixpkgs' Playwright Chromium *executes* correctly on Apple Silicon, as distinct from merely evaluating and being cache-resident, both of which were confirmed.

### Onboarding

`claude-plugins`' README gains a short section covering the marketplace install, the `workflow` plugin install, and the Nix installation step for macOS. The Determinate Systems installer is the recommended path, as it enables flakes by default.

## Risks

The Apple Silicon execution path is unproven until the CI job runs; evaluation and cache residency were verified, execution was not. This is the reason the CI job is part of the design rather than an optional extra.

Moving the runtime out of `nix-openclaw` touches a repository with 13 unpushed commits, so the relocation should not be interleaved with pushing that backlog.

The `nix run` fallback adds latency on first use per release tag, as the flake is re-resolved and any new store paths fetched. This is expected and one-time.
