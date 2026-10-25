---
name: review-dependency-pr
description: Review a Dependabot PR by mapping every changed package onto the parts of the app it reaches, then getting evidence for each part — a test, a probe, a build, a preview, or a named check after merge. Reports what CI does not prove, where each missing piece of evidence can come from, and the repo's own test gaps. Never merges. Use before landing any dependency bump.
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Edit, WebFetch, WebSearch, AskUserQuestion
argument-hint: <pr-number>
---

# Review a dependency PR

Review Dependabot PR `$ARGUMENTS`.

**Core principle: the question is not "is CI green" but "which parts of the app does this change reach, and what evidence do we have for each part".** A green run proves a lot for an ESLint bump and nothing for a library no test imports. List the parts first, then go get the evidence CI does not give you, then say plainly what is still unproven and where it will be proven.

The reader of your verdict will treat "merge-ready" as "we checked the changes". Only write it when the coverage table says so.

**You never merge.** Produce a verdict with evidence and hand it back.

## Phase 0 — Preconditions

Each of these has burned someone. Check all four before doing any work — and check
2 and 3 **again after any `@dependabot rebase`**. The request is a state-changing
action: Dependabot re-resolves the update, and it may close the PR and open a
replacement instead of rebasing it. A gate you pass once is checking the wrong moment.

```bash
gh pr view <PR> --json author,state,headRefOid,title,files
git fetch upstream && git fetch upstream refs/pull/<PR>/head
git rev-list --count FETCH_HEAD..upstream/main    # staleness
```

1. **Is it a Dependabot PR?** If not, stop — wrong skill.
2. **Is it still open?** Dependabot closes and replaces PRs when it re-resolves. Reviewing a corpse, or commenting `@dependabot rebase` on one, wastes a cycle.
3. **Is it stale?** If it is behind main, **stop and request a rebase**. Every verdict below is computed against the wrong baseline otherwise.

   Re-read `state` and `headRefOid` within a few minutes of the request. Instead of rebasing, Dependabot may close the PR ("Looks like these dependencies are updatable in another way") and open a replacement carrying the same bumps plus more. Find the successor and check which of your work transfers before redoing any of it. Dependabot rebases on its own only when a PR has a conflict; a stale PR without one stays stale.
4. **Is this change already in flight?** Scope the search to the **dependency**, not the file — every npm bump touches `package.json`:

```bash
gh api repos/<owner>/<repo>/pulls/<n>/files \
  --jq '.[] | select(.filename=="package.json") | .patch' | grep -E '^[+-].*"<dependency>"'
```

Then **read the repo's shape and its environments from the source, not from memory.** Notes and memory about environments go stale, and two people can both remember them wrong.

- What is the CI gate, and what does each job run? (read `.github/workflows/` and the commands they call: a `flake check` may run lint, types and unit tests but no app build)
- Which jobs skip bot PRs? A preview or build job often does, so a bot PR is never built before main.
- Which **build targets** exist besides the app — Nix bundles, scripts, workers, a separately built service — and which of them CI builds?
- What does each deployed environment actually have? Read the deployment spec and the logs (for example `doctl apps spec get`, `doctl apps logs --type build|run`): which integrations are configured (cache, analytics, storage, calendar), which run at build time, and where staging differs from production.
- What versions are pinned **outside** the package manager? (`flake.nix`, Dockerfiles, `engines`, CI setup actions)

## Phase 1 — Surface inventory

Build the list from the **lockfile diff**, never from the PR title or body: a group PR's description omits transitive changes, and a summary of it can be wrong. Cover the root **and every workspace** (`packages/*`, `services/*`): a dependency of a workspace package changes in the same lockfile but is not in the root `package.json`.

```bash
git diff <base> <head> -- package-lock.json      # or `npm ls --all` on both sides
```

Fill this table. It goes in the report as it is, and every later phase adds to it.

| Package (from → to) | Kind | Where we use it (`file:line`) | What it reaches | Build targets that load it | Evidence | Result |
|---|---|---|---|---|---|---|

- **Kind** is one of: runtime (server/client), build-time (bundler plugins, config wrappers, postinstall), deploy-time (steps that run during the platform build, such as a source-map upload), dev tooling, types only, unused.
- **What it reaches** is the user flow or integration: uploads, email rendering, calendar sync, the cache, a page, a CLI. "Nothing" is a valid answer and is how you find a dependency to remove.
- **Build targets**: the app bundle, each Nix bundle, scripts, tests. A package can load one way in Jest and another way in a bundle (CJS vs ESM).
- **Evidence** starts as "CI" or "none" and is upgraded in Phase 3: test name, probe, build, preview, staging check.

Group packages only when they share a surface (for example all Radix primitives), and say how many rows the group holds.

Then classify each row. The archetype decides what evidence you need:

| Archetype | What green CI proves | What you must add |
|---|---|---|
| GitHub Action bump | Only if the workflow is `pull_request`-triggered | Diff the action's inputs across majors |
| Runtime lib, tested | A great deal | Often nothing |
| Runtime lib, **untested** | Typecheck and lint. Nothing about behaviour | **Write the test** (Phase 3) |
| Dev tooling (lint/types/test runner) | A great deal — the tooling *is* the test | Plugin and peer compatibility; for lint configs, whether the resolved rule set shrank |
| Type-only (`@types/*`) | That it typechecks | Whether it describes the runtime you actually run |
| Framework major | Types only | Migration guide mapped to your files; visual/runtime risk |
| Build/deploy-time | Nothing — CI does not run the platform build | The package's own diff for that code path, and the environment where it runs |
| Externally coupled | Nothing useful | Whether the external pin can move too |
| Grouped batch | Aggregate pass/fail | Which member caused what |

## Phase 2 — Establish what CI actually proved

Never write "CI is green" as evidence. For each row:

**Workflow changes.** A `pull_request_target` workflow **runs from the base branch**, so a change to it is *not exercised by its own PR*.

**Library changes.** Grep the package across test files:

```bash
git grep -ln "<package>" -- 'tests/**' '**/__tests__/**'
```

Zero hits — or hits that are only `jest.mock('<package>')` — means no test executes it.

**Config packages.** A green lint run cannot show that a rule was switched off. Compare the resolved configuration on both versions (for ESLint: `npx eslint --print-config <file>` on a few file kinds) before you count lint as evidence.

**Build targets.** For each target in the inventory, does any CI job build it? A target that no job builds has no evidence from CI, whatever the unit tests say.

## Phase 3 — Close the gap

Ordered by value. Prefer the earliest that applies, and record the result in the inventory.

**1. Write the missing test.** If the dependency is untested and a harness exists, write a real test of *your* functions over the surface you use, against the real service (a container, a local emulator such as MinIO for S3, a local server that plays a third-party API), including the degraded path. Run it on the old and the new version. Passing on both is the evidence, and the next bump of that dependency becomes self-verifying.

**2. Read the raw diff for build- and deploy-time packages.** Release notes describe features; the code that runs during your build is in the package:

```bash
npm diff --diff=<pkg>@<old> --diff=<pkg>@<new>      # or diff the installed dist/
```

Read the code path your config triggers. Note new network calls, new failure modes ("a non-zero exit now fails the build"), and files the step now deletes or writes. Then name which environments run that step (from Phase 0).

**3. Probe.** Throwaway, same shape as a test: stand the service up, run old versus new, compare. Output diffs are cheap and strong: render the same email, document or markdown on both versions and diff the bytes.

**4. Build it.** When the inventory has build-time rows or a framework bump, a production build is evidence nothing else gives. Build with every external setting overridden to local values — a local database, local storage, no analytics keys — because a build or a dev server loads the real environment file by default and may prerender against it. If local builds are not allowed, say exactly what a build must look at, under `Needs environment`.

**5. Diff the action's inputs.** For action bumps, fetch `action.yml` at both tags and confirm every input your workflows pass still exists.

**6. Map the migration onto this codebase.** For majors, locate each breaking change **in your files with line references**. Check that the tag or version you intend to use exists.

Things that need a specific environment:

- **Animations and visual changes** need a visible browser or staging. A hidden or headless browser does not run animation frames, so it cannot show an animation at all.
- **A provider or wrapper in the root layout** can throw at render before any `enabled` flag is checked. Load one page, not only the types.
- **A gate you cannot run here** (a tool that refuses to run under an agent, a job that needs credentials you do not have) is a result, not a skip: record it, and name who runs it.

## Phase 4 — Environments, migration and capabilities

**Environment ladder.** For every inventory row whose evidence is still "none" or "CI only", name the cheapest environment that can produce it, and whether that is before or after merge:

| Rung | Gives you | Note |
|---|---|---|
| Local test or probe | Behaviour of your code on both versions | Cheapest; do it here |
| Local build / local server | Build-time behaviour, rendered pages | Override every external setting first |
| Preview of the PR | The real build plus the preview's integrations | **Bot PRs usually get none.** If one is needed, propose carrying the bump in a PR a person opens |
| Staging after merge | Real build, staging integrations | Only what staging actually has (Phase 0); production stays safe until the release |
| Production only | What only production has | The verdict must say so, with the check to run right after the release |

- **What breaks for us**, with `file:line`. Nothing that does not apply.
- **Pushing to the branch ends Dependabot's updates.** If a fix has to live on the Dependabot branch, push last, after the PR is otherwise ready.
- **Coupled PRs.** Some bumps are only correct together. Landing one alone can be worse than landing neither.
- **What the new version lets us delete.** A new capability can remove a workaround entirely, and an unused dependency is a removal, not a bump.

## Phase 5 — Verdict

Report, do not merge. One of:

- **merge-ready** — every runtime, build-time and deploy-time row in the inventory has evidence, or a named check in `Post-merge watch` for the environment that will show it
- **needs-work** — the specific work, not "some fixes"
- **blocked-on X** — another PR, an external pin, a decision, a gate someone else must run
- **wrong — do Y instead** — the bump is not the right change (an unused package, a types package outrunning the runtime)

Fill in every field. A field you cannot fill is a step you did not do:

```
Verdict:          <one of the four above>
Base:             <sha of the base branch> -> <gate result there: pass | N failures>
Reviewed head:    <sha of the PR head you actually ran against>
Gate on PR:       <result, with a COUNT — not a sample>
Attribution:      <each failure -> the specific dependency that causes it>
Coverage:         <rows with evidence> / <rows in the inventory>; list every row without evidence
What we'd gain:   <a measurement, or code this lets us delete. "Staying current"
                   is not an answer — if that is genuinely all there is, write
                   that, because it lowers the bar for closing the PR>
Needs environment:<each unproven row -> the rung that proves it, and before/after merge>
Post-merge watch: <what to look at on staging, and on the production release, and where:
                   build log line, run log line, page, flow>
Could not verify: <what no rung here can cover, and why>
```

Then, in the report:

1. **The surface inventory** from Phase 1, with the final evidence column.
2. **Tests the repo should have** — untested surfaces of these dependencies, listed as test debt that is independent of this PR. They stay true after the merge, so they must not live only inside the verdict.
3. The evidence details, the migration notes, and any prepared commits.

`Base` and `Reviewed head` exist because a verdict is perishable: a rebase can change the PR's *payload*, not just its base.

`Gate on PR` takes a count because a truncated sample reads exactly like a complete result.

`Coverage` exists because "Could not verify" as free text hides how much is unproven. A reader cannot see five untested integrations in one line; they can see `31/45`.

`What we'd gain` exists because a blocked major with a large payoff deserves an issue; a blocked major with no payoff deserves a close.

## Acting on the verdict

Dependabot takes commands as PR comments. The closed PR then *is* the record.

| Comment | Effect |
|---|---|
| `@dependabot rebase` | Rebase. May instead supersede the PR — re-check state after (Phase 0) |
| `@dependabot ignore this major version` | Closes it, and stops PRs **for that major only** |
| `@dependabot ignore this dependency` | Closes it, stops all PRs for the dependency |
| `@dependabot reopen` | Reopens **and clears the ignore** — the undo |
| `@dependabot close` | Closes without ignoring; it returns when a new version lands |

Put the reasoning and the command in one comment.

**Check what an ignore would silence before using one.** `ignore this major version` covers the whole major, including the later minor that fixes your blocker. If the unblock condition is "upstream supports x.1", use `close`.

After the merge, run the `Post-merge watch` items and report them. A verdict that depends on staging is not finished until staging has been read.

## Worked example

A production group of 45 direct updates, CI red on one job.

- **Phase 1:** the inventory from the lockfile has 45 rows. A summary of the PR had named two packages that were not in the diff at all.
- **Phase 2:** the red job was a Nix build. A config plugin moved its CLI to a new minor while a sibling package pinned the old one, so npm nested a second copy, and the build patched only the first. Under it, one type error from an SDK that added a required field. Many rows had no evidence: the S3 client, the cache handler, email rendering, an image cropper, 18 UI primitives with one rendering test between them.
- **Phase 3:** the raw diff of the config plugin showed a new deploy-time path: a release lookup at config load that fails the build on error, and deletion of all source maps. A local MinIO test covered S3 on both versions; email, document and markdown output diffed byte-identical; a local Valkey showed the cache handler writing the keys the framework reads.
- **Phase 4:** the deployment spec showed staging had no cache configured, so the cache handler would meet real Valkey first in production. That went into `Post-merge watch` as one run-log line to read after the release.
- **Verdict:** needs-work (two fixes), then merge-ready with `Coverage` listing what only staging and production could show. Both watch items were read after the release.
