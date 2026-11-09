---
name: review-dependency-pr
description: Review a Dependabot PR by mapping every changed package onto the parts of the app it reaches, then getting evidence for each part — a test, a probe, a build, a preview, or a named check after merge. Decides whether a build is needed and runs it before merge, scans the release notes for what we can adopt or delete, and lands the change on the right branch once approved. Use before landing any dependency bump.
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Edit, WebFetch, WebSearch, AskUserQuestion
argument-hint: <pr-number>
---

# Review a dependency PR

Review Dependabot PR `$ARGUMENTS`.

**Core principle: the question is not "is CI green" but "which parts of the app does this change reach, and what evidence do we have for each part".** A green run proves a lot for an ESLint bump and nothing for a library no test imports. List the parts first, then get the evidence CI does not give you, then say plainly what is still unproven and where it will be proven.

The reader of your verdict will treat "merge-ready" as "we checked the changes". Only write it when the coverage says so.

The work has four stages: **review** (Phases 0–4), **verdict** (5), **land** (6) and **watch** (7). Review and verdict are yours. Landing changes shared branches, so it runs only with the user's approval, step by step.

## Phase 0 — Preconditions and the repo's shape

```bash
gh pr view <PR> --json author,state,headRefOid,title,files
git fetch <remote> && git fetch <remote> refs/pull/<PR>/head
git rev-list --count FETCH_HEAD..<remote>/main    # how far behind
```

1. **Is it a Dependabot PR, and still open?** Dependabot closes and replaces PRs when it re-resolves. If this one supersedes a PR that was already reviewed, do not start over: diff the payload against the reviewed head and review the delta (see *Carrying a review forward*).
2. **Is the change already in flight?** Scope the search to the **dependency**, not the file — every npm bump touches `package.json`:
   ```bash
   gh api repos/<owner>/<repo>/pulls/<n>/files \
     --jq '.[] | select(.filename=="package.json") | .patch' | grep -E '^[+-].*"<dependency>"'
   ```
3. **Review against current main, without touching the PR.** If the PR is behind, rebase its head **locally** onto main and review that. Record how the rebased head differs from the PR's. Do not ask Dependabot to rebase during the review: `@dependabot rebase` re-resolves, and it can change the payload or replace the PR under you.

Then **read the repo's shape and its environments from the source, not from memory**:

- What does each CI job run? (read `.github/workflows/` and the commands they call: a `flake check` may run lint, types and unit tests but no app build)
- Which jobs skip bot PRs? A preview job often does, so a bot PR is never built before main — even after a person pushes to it.
- Which **build targets** exist besides the app — Nix bundles, scripts, workers, a separately built service? For each: does CI **build** it, and does anything **run** it? A bundle can build and still crash the moment it loads.
- What does each deployed environment actually have? Read the deployment spec and the logs (`doctl apps spec get`, `doctl apps logs --type build|run`): which integrations are configured, which steps run at build time, and where staging differs from production.
- What versions are pinned **outside** the package manager? (`flake.nix`, Dockerfiles, `engines`, CI setup actions)

## Phase 1 — Surface inventory

Build the list from the **lockfile diff**, never from the PR title or body. Cover the root **and every workspace** (`packages/*`, `services/*`).

```bash
git diff <base> <head> -- package-lock.json      # or `npm ls --all` on both sides
```

Fill this table. It goes in the report as it is, and every later phase adds to it.

| Package (from → to) | Kind | Where we use it (`file:line`) | What it reaches | Build targets that load it | Build needed? | Evidence | Result |
|---|---|---|---|---|---|---|---|

- **Kind**: runtime (server/client), build-time (bundler plugins, config wrappers, postinstall), deploy-time (steps that run during the platform build, such as a source-map upload), dev tooling, types only, **unused**.
- **What it reaches**: the user flow or integration. "Nothing" is a valid answer: an unused package is a **removal**, not a bump.
- **Build targets**: the app bundle, each Nix bundle, scripts, tests. A package can load one way in Jest and another in a bundle (CJS vs ESM).
- **Build needed?** Yes for build-time and deploy-time rows, a framework bump, and any package that loads differently in a bundle than in the tests (ESM-only packages, server-bundle-only code). This decides Phase 3 step 4.
- **Evidence** starts as "CI" or "none" and is upgraded in Phase 3.

Group packages only when they share a surface, and say how many rows the group holds. Then classify each row:

| Archetype | What green CI proves | What you must add |
|---|---|---|
| GitHub Action bump | Only if the workflow is `pull_request`-triggered | Diff the action's inputs across majors |
| Runtime lib, tested | A great deal | Often nothing |
| Runtime lib, **untested** | Typecheck and lint. Nothing about behaviour | **Write the test** (Phase 3) |
| Dev tooling | A great deal — the tooling *is* the test | Plugin and peer compatibility; for lint configs, whether the resolved rule set shrank |
| Type-only (`@types/*`) | That it typechecks | Whether it describes the runtime you run; a package that now ships its own types makes it a removal |
| Framework major | Types only | Migration guide mapped to your files; a build; visual/runtime risk |
| Build/deploy-time | Nothing — CI does not run the platform build | The package's own diff for that code path, and a build |
| Externally coupled | Nothing useful | Whether the external pin can move too |
| Grouped batch | Aggregate pass/fail | Which member caused what |

## Phase 2 — Establish what CI actually proved

Never write "CI is green" as evidence. For each row:

- **Tests.** `git grep -ln "<package>" -- 'tests/**' '**/__tests__/**'`. Zero hits, or hits that are only `jest.mock('<package>')`, mean no test executes it.
- **Workflows.** A `pull_request_target` workflow runs from the base branch, so a change to it is not exercised by its own PR.
- **Config packages.** A green lint run cannot show that a rule was switched off. Compare the resolved configuration on both versions (`npx eslint --print-config <file>`).

## Phase 3 — Close the gap

Ordered by value. Prefer the earliest that applies, and record the result in the inventory.

1. **Write the missing test.** A real test of *your* functions over the surface you use, against the real service or a local stand-in (MinIO for S3, a local HTTP server that plays a third-party API), including the degraded path. Run it on the old and the new version, then break the code path on purpose once to show the test fails. The next bump of that dependency becomes self-verifying.
2. **Read the raw diff for build- and deploy-time packages.** Release notes describe features; the code that runs during your build is in the package: `npm diff --diff=<pkg>@<old> --diff=<pkg>@<new>`. Note new network calls, new failure modes ("throws when a file is missing"), and files the step now writes or deletes. Name which environments run that step.
3. **Probe.** Throwaway, same shape as a test, old versus new. Output diffs are cheap and strong: render the same email, document or markdown on both versions and diff the bytes; for a bundle, build it and run its CLI.
4. **Build it, when Phase 1 says a build is needed — before merge.** A production build is evidence nothing else gives, and staging after merge is not a substitute: a broken build there blocks every deploy until someone fixes it. Build locally with every external setting overridden (a local database, dummy keys from `.env.example`, no analytics keys), because a build loads the real environment file by default and may prerender against it. If a local build is not possible, carry the change in a PR a person opens so its preview builds it (Phase 6). Then read the build output for what the risk was about: the files a build step writes, the bundle that should contain the package, a page that should render.
5. **Animations and visual changes: A/B in headless Chromium.** Headless Chromium runs animation frames normally; a *hidden* browser pane or a backgrounded window does not, so measure the frame rate before trusting any sample. Sample computed styles on every frame inside the page, trigger the interaction inside the page (not through a test runner's click, which waits), and record which animations the library starts (`Element.prototype.animate`). Run the same script on both versions and diff the results.
6. **Map the migration onto this codebase.** For majors, locate each breaking change **in your files with line references**. Nothing that does not apply.
7. **Diff an action's inputs.** For action bumps, fetch `action.yml` at both tags and confirm every input your workflows pass still exists.

Also: a provider or wrapper in the root layout can throw at render before any `enabled` flag is checked — load one page. A gate you cannot run here (a tool that refuses to run under an agent, a job that needs credentials) is a result, not a skip: record it, and name who runs it.

**Where the rest of the evidence comes from.** For every row whose evidence is still "none" or "CI only", name the cheapest environment that can produce it:

| Rung | Gives you | Note |
|---|---|---|
| Local test, probe or build | Behaviour on both versions; build output | Do it here. Override every external setting first |
| Preview of a PR a person opens | The real build plus the preview's integrations | Bot-authored PRs get none |
| Staging after merge | Integrations that only staging has | Never for build correctness (step 4) |
| Production only | What only production has | The verdict says so, with the check to run right after the release |

## Phase 4 — Gain

`What we'd gain` decides between merging, closing and filing an issue, so it needs real work:

- **Capability scan.** Read the release notes for **every version in the range**, not only the newest. Keep only items that touch an API or feature you use, or a workaround or TODO in your code. Classify each: *adopt now* (the exact `file:line` change; prepare it if it is small and clearly better), *worth an issue* (why), *not relevant* (one line).
- **What we can delete.** A new capability can remove a workaround; a package that now ships its own types removes an `@types/*`; an unused package is a removal.
- **Coupled PRs.** Some bumps are only correct together. Landing one alone can be worse than landing neither.

## Phase 5 — Verdict

One of:

- **merge-ready** — every row with a "yes" in *Build needed?* has a build behind it, and every runtime, build-time and deploy-time row has evidence or a named check in `Post-merge watch` for an integration that only that environment has
- **needs-work** — the specific work, prepared as commits where you can
- **blocked-on X** — another PR, an external pin, a decision, a gate someone else must run
- **wrong — do Y instead** — the bump is not the right change (an unused package, a types package outrunning the runtime, a replacement the codebase already has)

Fill in every field. A field you cannot fill is a step you did not do:

```
Verdict:          <one of the four above>
Payload:          <every direct package and workspace entry, exact from -> to versions>
Base:             <sha of the base branch> -> <gate result there>
Reviewed head:    <sha you ran against; the PR head sha if you rebased it locally>
Gate on PR:       <result, with a COUNT — not a sample>
Attribution:      <each failure -> the specific dependency that causes it>
Coverage:         <rows with evidence> / <rows in the inventory>; list every row without evidence
Build:            <needed or not, and why; where it ran; what its output showed>
What we'd gain:   <a measurement, or code this lets us delete. "Staying current" is an
                   answer only when it is genuinely all there is — it lowers the bar for closing>
Needs environment:<each unproven row -> the rung that proves it, before or after merge>
Post-merge watch: <what to read on staging and on the production release, and where>
Could not verify: <what no rung here can cover, and why>
```

`Payload` and `Reviewed head` exist because a verdict is perishable: Dependabot re-resolves, and the same PR can carry different versions an hour later. `Gate on PR` takes a count because a truncated sample reads exactly like a complete result. `Coverage` exists because one free-text line can hide five untested integrations; `31/45` cannot.

Then, in the report:

1. **The surface inventory**, with the final evidence column, and the capability scan.
2. **Tests the repo should have** — untested surfaces of these dependencies. When a harness from this or an earlier review was rebuilt by hand again (an S3 emulator test, a document or email render diff), name it as a test to commit: the second rebuild is the signal.
3. **Found on the way** — problems the review exposed that predate the bump. They do not block the verdict; they are issue or PR candidates.
4. The evidence details and the prepared commits, with the branch name.

## Phase 6 — Land (with the user's approval)

**Choose where the change lands:**

| The change | Lands as |
|---|---|
| The bump alone is right | The Dependabot PR as it is |
| Fixes or tests that this bump makes necessary, and no preview is needed | Commits pushed **onto the Dependabot branch** — also when the fix would work on main today. One PR and one CI run prove the fix on the real payload. Push after the PR is otherwise ready: pushing stops Dependabot from updating it, so merge soon after |
| A change that is not this bump — a removal, a replacement, a different version | **A PR a person opens.** Dependabot closes its own PR when the dependency leaves the manifest |
| Evidence that only a preview build gives | **A PR a person opens**, because bot-authored PRs get no preview |
| Do not merge | A Dependabot command with the reasoning in the same comment (below) |

**Before the merge, every time:**

1. Re-read `state` and `headRefOid`. If the head changed or the PR was superseded, diff the payload against the one you reviewed and review the delta.
2. Bring the PR onto current main without changing its payload: `gh pr update-branch <PR> --rebase` for a bot PR you leave as is, or a local rebase pushed with `--force-with-lease=<branch>:<sha you expect>`. Then confirm the payload is byte-identical to the reviewed one.
3. Follow the repo's rule for comments after a push (a compare link and what changed).
4. Wait for CI on that exact head, and confirm the run's SHA.
5. Merge through the team's `merge-pr` skill: a squash for a bare bump, a merge commit when your commits ride on it.

**Carrying a review forward.** A superseded PR or a moved head is not a new review. Diff the lockfile entries of the reviewed head against the new one, and run the full method only on the packages that changed. Prepared commits usually transfer; check each one against the new payload.

**Dependabot commands.** The closed PR then *is* the record; put the reasoning and the command in one comment.

| Comment | Effect |
|---|---|
| `@dependabot rebase` | Rebase. May re-resolve or supersede the PR — re-read state after |
| `@dependabot ignore this major version` | Closes it, and stops PRs **for that major only** |
| `@dependabot ignore this dependency` | Closes it, stops all PRs for the dependency |
| `@dependabot reopen` | Reopens **and clears the ignore** — the undo |
| `@dependabot close` | Closes without ignoring; it returns when a new version lands |

`ignore this major version` covers the whole major, including the later minor that fixes your blocker. If the unblock condition is "upstream supports x.1", use `close`.

## Phase 7 — Watch

Run the `Post-merge watch` items and report them. Read the staging build and run logs yourself where you have access, instead of handing that to the user. A verdict that depends on staging is not finished until staging has been read.

## Worked example

A production group of 45 direct updates, CI red on one job.

- **Phase 1:** the inventory from the lockfile has 45 rows. A summary of the PR had named two packages that were not in the diff at all. Three rows needed a build: a Next minor, a config plugin, and an SDK that the server bundle loads.
- **Phase 2:** the red job was a Nix build. A config plugin moved its CLI to a new minor while a sibling package pinned the old one, so npm nested a second copy, and the build patched only the first. Under it, one type error from an SDK that added a required field.
- **Phase 3:** the raw diff of the config plugin showed a new deploy-time path: a release lookup at config load that fails the build on error, and deletion of all source maps. A local build with dummy keys confirmed it. A local MinIO test covered S3 on both versions; email, document and markdown output diffed byte-identical.
- **Phase 4:** the release notes showed one SDK had stopped sending an event that our code scrubbed, so the scrub could be deleted — with a test that proves the deletion is safe only on the new version.
- **Phase 5:** needs-work (two fixes), then merge-ready, with `Post-merge watch` naming the one integration only production has.
- **Phase 6:** both fixes and the test existed only because of the bump, so they were pushed onto the Dependabot branch and merged with a merge commit. Staging's build log was read after the merge.
