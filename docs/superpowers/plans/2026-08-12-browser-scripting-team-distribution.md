# Browser-Scripting Team Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `browser-scripting` skill usable by teammates on macOS Apple Silicon by relocating its runtime into `schemalabz/toolkit` and shipping the skill through the `workflow` plugin in `schemalabz/claude-plugins`.

**Architecture:** The `page-read` / `playwright-run` Nix packages move from `nix-openclaw/tools/` (never pushed, `x86_64-linux`-only) into `schemalabz/toolkit`, which already builds for all four systems and already has a CalVer release process. Consumers — `nix-openclaw`, the personal NixOS config, and the new plugin skill — pin a toolkit release tag. The skill resolves its runtime at use time: `PATH` first, then `nix run`, then stop and prompt.

**Tech Stack:** Nix flakes, `buildNpmPackage`, GitHub Actions (`macos-latest` = Apple Silicon), Claude Code plugin marketplace.

## Global Constraints

- **Playwright pin is load-bearing.** `playwright-test` and `playwright-driver.browsers` must come from the *same* nixpkgs revision or the browser fails to launch. Use `github:NixOS/nixpkgs/nixos-25.05` (verified rev `ac62194c3917d5f474c1a844b6fd6da2db95077d`). Never source them from `nixpkgs-unstable`.
- **`npmDepsHash` for page-read is `sha256-BxWa0D8G2yArFewejieof0ykj0nnrOC0Ikrndan91Ak=`.** It derives from `package-lock.json` alone, so it does not change when the surrounding directory layout changes.
- **`tools/page-read/` keeps its own `package.json` and `package-lock.json`.** Do not merge its deps into toolkit's root `package.json`.
- **Only two repos get pushed: `toolkit` and `claude-plugins`.** They are the entire teammate-facing path — `nix run` resolves against toolkit, and the plugin ships from claude-plugins. `nix-openclaw` (Task 4) and `dotfiles` (Task 5) are commit-only; **never push them**, as their backlogs are the user's to publish on their own schedule.
- **Public actions require explicit user confirmation before running:** the two pushes above, the tag push, and the GitHub release in Task 3. Draft and show, then wait.
- **Never add `Co-Authored-By` lines to commits.**
- **Do not commit** anything under `docs/superpowers/` — that directory is untracked in `claude-plugins` by convention.
- **The `<TAG>` produced in Task 3** is consumed verbatim by Tasks 4, 5 and 6. It is a real value, not a placeholder — read it from Task 3's output.

## File Structure

**`schemalabz/toolkit`** (new home for the runtime)
- `nix/page-read.nix` — derivation for the URL→markdown reader. Kept out of `tools/` so `tools/` stays pure source, matching the existing `tools/<name>/` convention.
- `nix/playwright-run.nix` — derivation for the Playwright script runner.
- `tools/page-read/` — the Node package moved verbatim from `nix-openclaw/tools/page-read/`.
- `flake.nix` — gains a second pinned input and a `packages` output.
- `.github/smoke/playwright-smoke.mjs` — CI smoke script; proves Chromium *executes*.
- `.github/workflows/nix.yml` — builds and smoke-tests on Linux and Apple Silicon.
- `.gitignore` — gains `tools/page-read/node_modules/`.

**`schemalabz/nix-openclaw`**
- `flake.nix` — swaps the `path:./tools` input for the toolkit release tag.
- `tools/` — deleted.

**`dotfiles/nixos`**
- `flake.nix`, `configuration.nix` — swap `nix-openclaw-tools` for `toolkit`.

**`schemalabz/claude-plugins`**
- `plugins/workflow/skills/browser-scripting/{SKILL.md,references/,scripts/}` — the skill.
- `README.md` — onboarding section.

---

### Task 1: Move the runtime into toolkit

**Files:**
- Create: `~/schema-labs/projects/toolkit/nix/page-read.nix`
- Create: `~/schema-labs/projects/toolkit/nix/playwright-run.nix`
- Create: `~/schema-labs/projects/toolkit/tools/page-read/` (copied sources)
- Create: `~/schema-labs/projects/toolkit/.github/smoke/playwright-smoke.mjs`
- Modify: `~/schema-labs/projects/toolkit/flake.nix`
- Modify: `~/schema-labs/projects/toolkit/.gitignore`

**Interfaces:**
- Produces: flake outputs `packages.<system>.page-read` and `packages.<system>.playwright-run` for `x86_64-linux`, `aarch64-linux`, `x86_64-darwin`, `aarch64-darwin`. `page-read` exposes `bin/page-read`, invoked as `page-read <url> [--json]`. `playwright-run` exposes `bin/playwright-run`, invoked as `playwright-run script.mjs [args...]`, and sets `PLAYWRIGHT`, `PLAYWRIGHT_BROWSERS_PATH`, `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` in the script's environment.

- [ ] **Step 1: Write the smoke test that proves Chromium launches**

Create `.github/smoke/playwright-smoke.mjs`:

```javascript
// Usage: playwright-run .github/smoke/playwright-smoke.mjs
// Proves the nix-provided Chromium actually launches and renders on this platform.
const pw = await import(process.env.PLAYWRIGHT);
const { chromium } = pw.default ?? pw;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
const title = await page.title();
await browser.close();

if (title !== 'Example Domain') {
  console.error(`FAIL: expected "Example Domain", got "${title}"`);
  process.exit(1);
}
console.log('OK: chromium launched and rendered');
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd ~/schema-labs/projects/toolkit
nix run .#playwright-run -- .github/smoke/playwright-smoke.mjs
```

Expected: FAIL — `error: flake 'git+file:///...toolkit' does not provide attribute 'packages.x86_64-linux.playwright-run'` (the `packages` output does not exist yet).

- [ ] **Step 3: Copy the sources across**

```bash
cd ~/schema-labs/projects/toolkit
mkdir -p nix tools/page-read
cp -r ~/schema-labs/projects/nix-openclaw/tools/page-read/{cli.mjs,core.mjs,extract.mjs,fetch.mjs,package.json,package-lock.json,test} tools/page-read/
echo 'tools/page-read/node_modules/' >> .gitignore
```

Verify `node_modules` was not copied:

```bash
ls tools/page-read/
```

Expected: `cli.mjs core.mjs extract.mjs fetch.mjs package-lock.json package.json test` — and no `node_modules`.

- [ ] **Step 4: Create `nix/page-read.nix`**

```nix
{ pkgs }:
# page-read: URL->markdown reader. `pkgs` MUST come from the `nixpkgs-playwright`
# input — it provides the matched playwright module + Chromium, imported at
# runtime via $PLAYWRIGHT (same contract as playwright-run).
let
  playwrightModule = "${pkgs.playwright-test}/lib/node_modules/playwright/index.js";
  browsers = pkgs.playwright-driver.browsers;
in
pkgs.buildNpmPackage {
  pname = "page-read";
  version = "0.1.0";
  src = ../tools/page-read;
  npmDepsHash = "sha256-BxWa0D8G2yArFewejieof0ykj0nnrOC0Ikrndan91Ak=";
  dontNpmBuild = true;
  nativeBuildInputs = [ pkgs.makeWrapper ];
  postInstall = ''
    wrapProgram $out/bin/page-read \
      --set PLAYWRIGHT "${playwrightModule}" \
      --set PLAYWRIGHT_BROWSERS_PATH "${browsers}" \
      --set PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS 1 \
      --unset LD_LIBRARY_PATH
  '';
  meta.mainProgram = "page-read";
}
```

- [ ] **Step 5: Create `nix/playwright-run.nix`**

```nix
{ pkgs }:
# Raw Playwright scripting runner. `pkgs` MUST come from the `nixpkgs-playwright`
# input (nixos-25.05): its `playwright-test` node module and
# `playwright-driver.browsers` are a MATCHED pair, so no slot-shim is needed.
let
  playwrightModule = "${pkgs.playwright-test}/lib/node_modules/playwright/index.js";
  browsers = pkgs.playwright-driver.browsers;
in
pkgs.writeShellScriptBin "playwright-run" ''
  # Usage: playwright-run script.mjs [args...]
  # In the script (ESM ignores NODE_PATH, so import via the env var):
  #   const pw = await import(process.env.PLAYWRIGHT);
  #   const { chromium } = pw.default ?? pw;
  export PLAYWRIGHT="${playwrightModule}"
  export PLAYWRIGHT_BROWSERS_PATH="${browsers}"
  export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
  # The nix Chromium is rpath-patched and self-contained; a caller's dev-shell
  # LD_LIBRARY_PATH (e.g. older util-linux) breaks its glib. Drop it.
  # No-op on darwin, harmless.
  unset LD_LIBRARY_PATH
  exec ${pkgs.nodejs}/bin/node "$@"
''
```

- [ ] **Step 6: Add the pinned input to `flake.nix`**

Replace the `inputs` block:

```nix
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    # Pinned separately from `nixpkgs`: playwright-test and
    # playwright-driver.browsers must come from the SAME revision or Chromium
    # fails to launch. Used ONLY by the page-read / playwright-run packages —
    # the dev shell stays on unstable.
    nixpkgs-playwright.url = "github:NixOS/nixpkgs/nixos-25.05";
  };
```

- [ ] **Step 7: Add the `packages` output to `flake.nix`**

Change the outputs signature from `outputs = { self, nixpkgs }:` to:

```nix
  outputs = { self, nixpkgs, nixpkgs-playwright }:
```

Then add this `packages` attribute immediately before the existing `devShells = forAllSystems (...)` line, inside the same attribute set:

```nix
      # Web-access CLIs (see the browser-scripting skill). page-read = URL->markdown
      # reader; playwright-run = raw Playwright scripting (screenshots, interaction).
      # These use `nixpkgs-playwright`, NOT the unstable `nixpkgs` above.
      packages = nixpkgs.lib.genAttrs systems (system:
        let pwPkgs = import nixpkgs-playwright { inherit system; };
        in {
          page-read = import ./nix/page-read.nix { pkgs = pwPkgs; };
          playwright-run = import ./nix/playwright-run.nix { pkgs = pwPkgs; };
        });
```

Leave `devShells` and the `systems` / `forAllSystems` bindings exactly as they are.

- [ ] **Step 8: Stage the new files, then build**

**This `git add` is required, not tidiness.** In a git repository, a flake only sees *tracked* files. `nix/page-read.nix` and everything under `tools/page-read/` are brand new, so without staging them `nix build` fails with a confusing `path '/nix/store/...-source/nix/page-read.nix' does not exist` — even though the files are sitting right there on disk.

```bash
cd ~/schema-labs/projects/toolkit
git add nix/ tools/page-read/ .github/smoke/ .gitignore
nix flake lock
nix build .#page-read
```

Expected: builds successfully; `flake.lock` now contains a `nixpkgs-playwright` node.

If `nix build` reports a hash mismatch on `npmDepsHash`, the lockfile was copied incorrectly — re-copy `tools/page-read/package-lock.json` rather than editing the hash.

- [ ] **Step 9: Run both smoke checks and verify they now pass**

Assert against `--json`'s `title` field, **not** the markdown body. `page-read` extracts *main content*, so defuddle strips the boilerplate `<h1>` and the string "Example Domain" never appears in the body output. Body prose is also a brittle assertion — example.com's wording has changed before now.

```bash
cd ~/schema-labs/projects/toolkit
./result/bin/page-read https://example.com --json | grep -q '"title":"Example Domain"' && echo "page-read OK"
nix run .#playwright-run -- .github/smoke/playwright-smoke.mjs
```

Expected: `page-read OK`, then `OK: chromium launched and rendered`.

- [ ] **Step 10: Commit**

```bash
cd ~/schema-labs/projects/toolkit
git add nix/ tools/page-read/ .github/smoke/ flake.nix flake.lock .gitignore
git commit -m "feat(nix): add page-read and playwright-run packages

Web-access CLIs relocated from nix-openclaw/tools so they have a single
home shared by the NixOS config, nix-openclaw's agent workspaces, and the
browser-scripting skill. Pinned to nixos-25.05 because playwright-test and
playwright-driver.browsers must be a matched pair."
```

---

### Task 2: Prove the Apple Silicon path in CI

**Files:**
- Create: `~/schema-labs/projects/toolkit/.github/workflows/nix.yml`

**Interfaces:**
- Consumes: `packages.<system>.page-read` and `packages.<system>.playwright-run` from Task 1; `.github/smoke/playwright-smoke.mjs` from Task 1 Step 1.
- Produces: a green CI run on `macos-latest` that is the evidence gate for Task 3.

This is the task that closes the one assumption verified only by evaluation and binary-cache lookup, never by execution: that nixpkgs' Playwright Chromium actually runs on `aarch64-darwin`.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/nix.yml`:

```yaml
name: Nix packages

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest]  # macos-latest is Apple Silicon
    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Install Nix
        uses: DeterminateSystems/nix-installer-action@main

      - name: Build page-read
        run: nix build .#page-read

      - name: Smoke-test page-read
        run: ./result/bin/page-read https://example.com --json | grep -q '"title":"Example Domain"'

      - name: Smoke-test playwright-run (proves Chromium launches)
        run: nix run .#playwright-run -- .github/smoke/playwright-smoke.mjs
```

- [ ] **Step 2: Commit**

```bash
cd ~/schema-labs/projects/toolkit
git add .github/workflows/nix.yml
git commit -m "ci: build and smoke-test the nix packages on linux and apple silicon"
```

- [ ] **Step 3: Confirm with the user, then push**

This is a public action. Show the user the two commits from Tasks 1–2 (`git log --oneline -2`) and wait for approval before running:

```bash
cd ~/schema-labs/projects/toolkit && git push origin main
```

- [ ] **Step 4: Watch the run and verify both platforms pass**

```bash
cd ~/schema-labs/projects/toolkit
gh run watch "$(gh run list --workflow=nix.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
```

Expected: both `build (ubuntu-latest)` and `build (macos-latest)` succeed, with `OK: chromium launched and rendered` in the macOS log.

**If the macOS job fails**, stop the plan and report. Do not proceed to Task 3 — the whole design rests on this working, and a failure here means the runtime needs a darwin-specific fix before anything is distributed to teammates.

---

### Task 3: Cut a toolkit release

**Files:**
- No file changes. Produces a git tag and a GitHub release.

**Interfaces:**
- Consumes: green CI from Task 2.
- Produces: `<TAG>` — a CalVer tag such as `v2026.8.1`. Tasks 4, 5 and 6 all pin this exact string.

- [ ] **Step 1: Run the repo's existing release skill**

```bash
cd ~/schema-labs/projects/toolkit
```

Invoke the repo-local `release` skill at `.claude/skills/release/SKILL.md`. It handles pre-flight checks, CalVer computation (`YYYY.M.N`, `v`-prefixed), release-note generation, tagging and publishing. Do not hand-roll the tag.

- [ ] **Step 2: Confirm the tag before it is pushed**

The release skill already requires confirmation before pushing the tag and creating the release. Honour it — this is a public action.

Note: pushing a `v*` tag also triggers the existing `build-app.yml` desktop-app build. That is expected and accepted; it is unrelated to this work and can be ignored.

- [ ] **Step 3: Record the tag**

```bash
cd ~/schema-labs/projects/toolkit
git tag --list 'v*' --sort=-version:refname | head -1
```

Expected: the newly created tag. **Write it down — it is `<TAG>` for the rest of this plan.**

- [ ] **Step 4: Verify the published ref resolves from outside the repo**

```bash
cd /tmp && nix run "github:schemalabz/toolkit/<TAG>#page-read" -- https://example.com | head -5
```

Expected: markdown containing "Example Domain". This is exactly the command a teammate will run, so it must work before proceeding.

---

### Task 4: Point nix-openclaw at toolkit

**Files:**
- Modify: `~/schema-labs/projects/nix-openclaw/flake.nix:7-10` (input), `:24` (outputs signature), `:45-48` (re-export)
- Delete: `~/schema-labs/projects/nix-openclaw/tools/`

**Interfaces:**
- Consumes: `<TAG>` from Task 3.
- Produces: `packages.x86_64-linux.{page-read,playwright-run}` unchanged in name and behaviour, so `hosts/preview/configuration.nix:59-62` needs no edit.

**This task is local-only. Do NOT push nix-openclaw.** The repo has 13 unpushed commits carrying unrelated gateway, noosphere and workspace work, and the user has not decided to publish them yet. This task's commit simply joins that backlog and goes upstream later, on the user's schedule.

Nothing in the teammate-facing path depends on this task — it is housekeeping that removes a directory now duplicated in toolkit. It is done anyway (rather than skipped) because Task 5 repoints the NixOS config at toolkit, after which `nix-openclaw/tools/` would linger as a stale second copy of the `page-read` source that a future session could easily edit by mistake.

Note that `origin/main` never contained `tools/` — those commits are among the unpushed ones — so the published flake is already self-consistent without it.

- [ ] **Step 1: Swap the input in `flake.nix`**

Replace these four lines:

```nix
    # Self-contained web-access tools (page-read + playwright), kept as a
    # sub-flake so its input (nixpkgs-playwright only) doesn't leak to consumers
    # and it can be lifted into its own repo unchanged. See tools/README.md.
    tools.url = "path:./tools";
```

with:

```nix
    # Web-access tools (page-read + playwright-run), shared with the team's
    # local Claude Code setup via the browser-scripting skill.
    toolkit.url = "github:schemalabz/toolkit/<TAG>";
```

- [ ] **Step 2: Update the outputs signature**

Change:

```nix
  outputs = { self, nixpkgs, tools, nix-openclaw, claude-code-nix, opencouncil, opencouncil-tasks }:
```

to:

```nix
  outputs = { self, nixpkgs, toolkit, nix-openclaw, claude-code-nix, opencouncil, opencouncil-tasks }:
```

- [ ] **Step 3: Update the re-export**

Change:

```nix
      # Web-access tools — re-exported from the self-contained tools/ sub-flake
      # (see tools/README.md). Consumers who want ONLY these should depend on
      # `github:schemalabz/nix-openclaw?dir=tools` to avoid this flake's inputs.
      inherit (tools.packages.${system}) playwright-run page-read;
```

to:

```nix
      # Web-access tools — re-exported from schemalabz/toolkit, which is where
      # they now live. Consumers who want ONLY these should depend on toolkit
      # directly rather than on this flake.
      inherit (toolkit.packages.${system}) playwright-run page-read;
```

- [ ] **Step 4: Delete the old sub-flake**

```bash
cd ~/schema-labs/projects/nix-openclaw
git rm -r tools/
```

- [ ] **Step 5: Verify the packages still resolve**

```bash
cd ~/schema-labs/projects/nix-openclaw
nix flake lock
nix build .#page-read
./result/bin/page-read https://example.com --json | grep -q '"title":"Example Domain"' && echo "OK"
```

Expected: `OK`. The `flake.lock` should now list `toolkit` and no longer list `tools`.

- [ ] **Step 6: Commit — and stop there**

```bash
cd ~/schema-labs/projects/nix-openclaw
git add flake.nix flake.lock
git commit -m "refactor: consume web-access tools from schemalabz/toolkit

The tools sub-flake moves to toolkit, which already builds for darwin and
has a release process. Consumers now pin a toolkit tag instead of a path."
```

Do **not** push. Confirm the commit landed on top of the existing backlog and leave it there:

```bash
git log --oneline origin/main..main | head -3
```

Expected: your new commit at the top, above the pre-existing unpushed work.

---

### Task 5: Point the NixOS config at toolkit

**Files:**
- Modify: `~/personal_projects/dotfiles/nixos/flake.nix:11-17`
- Modify: `~/personal_projects/dotfiles/nixos/configuration.nix:212-215`

**Interfaces:**
- Consumes: `<TAG>` from Task 3.
- Produces: `page-read` and `playwright-run` still on `PATH` at `/run/current-system/sw/bin/`, which keeps the skill's resolution step 1 working on this machine.

- [ ] **Step 1: Swap the flake input**

In `nixos/flake.nix`, replace:

```nix
      # Web-access CLIs (page-read, playwright-run). Consumes ONLY the tools
      # sub-flake, so it inherits just nixpkgs-playwright — none of nix-openclaw's
      # server-deployment inputs. Switch to github:schemalabz/nix-openclaw?dir=tools
      # once it's pushed upstream.
      nix-openclaw-tools = {
        url = "path:/home/kouloumos/schema-labs/projects/nix-openclaw/tools";
      };
```

with:

```nix
      # Web-access CLIs (page-read, playwright-run) — see the browser-scripting
      # skill. Same packages the team gets via `nix run`, pinned to a release.
      toolkit = {
        url = "github:schemalabz/toolkit/<TAG>";
      };
```

- [ ] **Step 2: Update the package references**

In `nixos/configuration.nix`, replace:

```nix
    inputs.nix-openclaw-tools.packages.${pkgs.system}.page-read
    inputs.nix-openclaw-tools.packages.${pkgs.system}.playwright-run
```

with:

```nix
    inputs.toolkit.packages.${pkgs.system}.page-read
    inputs.toolkit.packages.${pkgs.system}.playwright-run
```

- [ ] **Step 3: Rebuild**

```bash
cd ~/personal_projects/dotfiles/nixos
nix flake lock
sudo nixos-rebuild switch --flake .#
```

- [ ] **Step 4: Verify both commands still work from a clean shell**

```bash
which page-read playwright-run
page-read https://example.com --json | grep -q '"title":"Example Domain"' && echo "page-read OK"
```

Expected: both resolve under `/run/current-system/sw/bin/`, and `page-read OK`.

- [ ] **Step 5: Commit**

```bash
cd ~/personal_projects/dotfiles
git add nixos/flake.nix nixos/flake.lock nixos/configuration.nix
git commit -m "nixos: get web-access CLIs from schemalabz/toolkit

Replaces the local path: input now that the tools live in toolkit and are
released. Keeps them on PATH so the browser-scripting skill short-circuits
its nix run fallback."
```

---

### Task 6: Ship the skill in the workflow plugin

**Files:**
- Create: `~/schema-labs/projects/claude-plugins/plugins/workflow/skills/browser-scripting/SKILL.md`
- Create: `~/schema-labs/projects/claude-plugins/plugins/workflow/skills/browser-scripting/references/github-image-upload.md`
- Create: `~/schema-labs/projects/claude-plugins/plugins/workflow/skills/browser-scripting/scripts/{gh-login.mjs,gh-upload.mjs,gh-verify.mjs}`
- Modify: `~/schema-labs/projects/claude-plugins/README.md`

**Interfaces:**
- Consumes: `<TAG>` from Task 3.
- Produces: skill `browser-scripting` inside plugin `workflow@schemalabz`. No `marketplace.json` change is needed — `workflow` is already registered.

- [ ] **Step 1: Copy the skill across unchanged**

```bash
cd ~/schema-labs/projects/claude-plugins
mkdir -p plugins/workflow/skills/browser-scripting
cp -r ~/.claude/skills/browser-scripting/{SKILL.md,references,scripts} \
      plugins/workflow/skills/browser-scripting/
```

The three `gh-*.mjs` scripts need **no edits** — they already import via `process.env.PLAYWRIGHT`, which both the `PATH` and `nix run` providers set identically.

- [ ] **Step 2: Add the Runtime section to `SKILL.md`**

Insert this immediately after the `# Web access: read vs operate` intro paragraph and before the `## playwright-run` heading, substituting the real tag for `<TAG>`:

```markdown
## Runtime

Both commands come from the team toolkit flake. Resolve them in this order:

1. **Already on `PATH`** (`command -v page-read`) — use directly. NixOS machines
   install them into the system profile, so there is no per-call overhead.
2. **Otherwise via nix** — prefix every invocation:
   `nix run github:schemalabz/toolkit/<TAG>#page-read -- <url>`
   `nix run github:schemalabz/toolkit/<TAG>#playwright-run -- script.mjs`
3. **No nix at all** — stop and tell the user to install it, then retry:
   `curl -fsSL https://install.determinate.systems/nix | sh -s -- install`
   Do NOT install Playwright yourself, and do NOT run `npx playwright install`.

The first `nix run` downloads ~240 MB of prebuilt browsers, once; afterwards it
is store-cached. To skip flake resolution entirely:
`nix profile install github:schemalabz/toolkit/<TAG>#page-read` — which promotes
you to case 1.
```

- [ ] **Step 3: Add the macOS note to the GitHub upload reference**

In `references/github-image-upload.md`, the login step is documented as:

```
DISPLAY=:0 playwright-run <skill-dir>/scripts/gh-login.mjs .scratch/gh-session.json
```

`DISPLAY=:0` is Linux-only. Add this line directly beneath that command:

```markdown
On macOS, drop the `DISPLAY=:0` prefix — the headed browser opens without it.
```

- [ ] **Step 4: Add onboarding to the README**

Append this section to `README.md`:

```markdown
## browser-scripting: one-time setup

The `browser-scripting` skill (in the `workflow` plugin) drives a real browser
and reads pages as markdown. It needs Nix, which supplies a matched Playwright
and Chromium:

```bash
curl -fsSL https://install.determinate.systems/nix | sh -s -- install
```

That is the whole setup — the skill invokes the tools with `nix run`, so there
is nothing to install per-tool. The first run downloads ~240 MB of prebuilt
browsers and takes a few minutes; later runs are instant.

To avoid flake resolution on every call, install them into your profile:

```bash
nix profile install github:schemalabz/toolkit#page-read
nix profile install github:schemalabz/toolkit#playwright-run
```
```

- [ ] **Step 5: Verify the skill loads locally before pushing**

Follow the dev-mode recipe already documented in the README — uninstall the marketplace copy, then symlink the working tree:

```bash
ln -s ~/schema-labs/projects/claude-plugins/plugins/workflow ~/.claude/skills/workflow
```

Start a new Claude Code session and confirm `browser-scripting` appears in the available-skills list under the `workflow` plugin. Then exit dev mode:

```bash
rm ~/.claude/skills/workflow
```

- [ ] **Step 6: Commit**

```bash
cd ~/schema-labs/projects/claude-plugins
git add plugins/workflow/skills/browser-scripting README.md
git commit -m "feat(workflow): add browser-scripting skill

Reads pages as markdown and drives a real browser. Runtime resolves in
order: PATH, then nix run against a pinned toolkit release, then stop and
prompt — so one skill text serves NixOS and macOS unchanged."
```

- [ ] **Step 7: Confirm with the user, then push**

```bash
cd ~/schema-labs/projects/claude-plugins && git push origin main
```

---

### Task 7: Verify as a teammate would

**Files:**
- No changes. Verification only.

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Verify the published skill is installable**

```bash
cd /tmp
gh api repos/schemalabz/claude-plugins/contents/plugins/workflow/skills/browser-scripting/SKILL.md \
  --jq '.name'
```

Expected: `SKILL.md`.

- [ ] **Step 2: Verify the runtime resolves from the published tag alone**

Download the smoke script to a real `.mjs` path — do not use process substitution. Node picks its module system from the file extension, so an extensionless `/dev/fd/63` is parsed as CommonJS and the script's top-level `await` fails with `SyntaxError: await is only valid in async functions`.

```bash
cd /tmp
nix run "github:schemalabz/toolkit/<TAG>#page-read" -- https://example.com --json | grep -q '"title":"Example Domain"' && echo "page-read OK"

curl -fsSL "https://raw.githubusercontent.com/schemalabz/toolkit/<TAG>/.github/smoke/playwright-smoke.mjs" -o /tmp/smoke.mjs
nix run "github:schemalabz/toolkit/<TAG>#playwright-run" -- /tmp/smoke.mjs
```

Expected: `page-read OK`, then `OK: chromium launched and rendered`.

- [ ] **Step 3: Confirm the SKILL.md tag matches the released tag**

```bash
grep -o 'toolkit/v[0-9.]*' ~/schema-labs/projects/claude-plugins/plugins/workflow/skills/browser-scripting/SKILL.md | sort -u
```

Expected: exactly one distinct value, equal to `<TAG>`. A mismatch here is the single most likely way this ships broken — the skill would point teammates at a tag that does not exist.

- [ ] **Step 4: Report to the user**

Summarise: the released tag, the CI evidence that Apple Silicon works, and the two commands a teammate runs to onboard (install Nix; install the plugin). Note that a teammate's *first* invocation is slow (~240 MB) so they are not surprised.

---

## Notes for the implementer

- **The macOS CI job in Task 2 is a hard gate.** Everything downstream assumes it passes. If it fails, stop and report rather than working around it.
- **`<TAG>` appears in four places** — `nix-openclaw/flake.nix`, `dotfiles/nixos/flake.nix`, the skill's Runtime section, and the README's optional `nix profile install` lines (which deliberately omit the tag, tracking the default branch). Task 7 Step 3 is the check that catches a mismatch.
- **Do not delete `~/.claude/skills/browser-scripting`** as part of this plan. Once the plugin is installed from the marketplace it would shadow the personal copy, but removing the original is a separate cleanup decision for the user to make after they have confirmed the plugin works.
