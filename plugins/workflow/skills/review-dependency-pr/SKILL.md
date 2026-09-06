---
name: review-dependency-pr
description: Review a Dependabot PR by working out what its green CI actually proves, then closing the gap — writing the missing test, probing the real dependency, or diffing an action's inputs. Maps breaking changes onto this codebase and reports a verdict with evidence. Never merges. Use before landing any dependency bump.
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Edit, WebFetch, WebSearch, AskUserQuestion
argument-hint: <pr-number>
---

# Review a dependency PR

Review Dependabot PR `$ARGUMENTS`.

**Core principle: "CI is green" means something different for every dependency.** A green run proves a lot for an ESLint bump and nothing at all for a library no test imports. Work out what the green actually covers, then go get the evidence it doesn't.

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
3. **Is it stale?** If it is behind main, **stop and request a rebase**. Every verdict below is computed against the wrong baseline otherwise — a run from before a toolchain change proves nothing about today.

   Then re-read `state` and `headRefOid` before you resume, within a few minutes rather
   than later — the supersession lands almost immediately. Instead of rebasing, Dependabot
   may close the PR ("Looks like these dependencies are updatable in another way") and open
   a replacement carrying the same bumps plus whatever else it re-resolved. Find the
   successor and check whether your work transfers before redoing any of it.

   Diagnostic worth knowing: a PR that still reports as **behind main after a rebase** is
   usually closed, not losing a race with incoming commits. Check `state` before theorising.
4. **Is this change already in flight?** Rebuilding work that already exists is the most expensive mistake available, and it costs one query to avoid. Scope the search to the **dependency**, not the file — every npm bump touches `package.json`, so a file-level check matches everything and tells you nothing:

```bash
# for each other open PR, does its package.json hunk mention this dependency?
gh api repos/<owner>/<repo>/pulls/<n>/files \
  --jq '.[] | select(.filename=="package.json") | .patch' | grep -E '^[+-].*"<dependency>"'
```

For a config or workflow change, compare the actual hunk rather than the filename.

Then **discover the repo's shape** rather than assuming it — this is what lets the skill work outside the repo it was written in:

- What is the CI gate? (read `.github/workflows/`: `nix flake check`, `npm test`, something else)
- Is there an integration harness, and does it run in CI?
- How do you stand a real service up here? (a flake → `nix run nixpkgs#<pkg>`; else docker-compose or testcontainers)
- What versions are pinned **outside** the package manager? (`flake.nix`, Dockerfiles, `engines`, CI setup actions)

## Phase 1 — Classify

The archetype determines what evidence you need. It is mechanical: which files changed, is the package a runtime or dev dependency, what imports it, and is its version governed by something outside the package manager.

| Archetype | What green CI proves | What you must add |
|---|---|---|
| GitHub Action bump | Only if the workflow is `pull_request`-triggered | Diff the action's inputs across majors |
| Runtime lib, tested | A great deal | Often nothing |
| Runtime lib, **untested** | Typecheck and lint. Nothing about behaviour | **Write the test** (Phase 3) |
| Dev tooling (lint/types/test runner) | A great deal — the tooling *is* the test | Plugin and peer compatibility |
| Type-only (`@types/*`) | That it typechecks | Whether it describes the runtime you actually run |
| Framework major | Types only | Migration guide mapped to your files; visual/runtime risk |
| Externally coupled | Nothing useful | Whether the external pin can move too |
| Grouped batch | Aggregate pass/fail | Which member caused what |

## Phase 2 — Establish what CI actually proved

Never write "CI is green" as evidence. Two checks are pure mechanism:

**Workflow changes.** For each changed workflow, read its trigger. A `pull_request_target` workflow **runs from the base branch**, so a change to it is *not exercised by its own PR* and is structurally untestable before merge. Say so plainly; do not let a schema check masquerade as a runtime test.

**Library changes.** Grep the package across test files:

```bash
git grep -ln "<package>" -- 'tests/**' '**/__tests__/**'
```

Zero hits — or hits that are only `jest.mock('<package>')` — means no test ever executes it. Mocks are the common case and are easy to mistake for coverage.

## Phase 3 — Close the gap

Ordered by value. Prefer the earliest that applies.

**1. Write the missing test.** If the dependency is untested and a harness exists, write a real test. This is the primary output, not a suggestion — writing it is what validates that it was worth having, and it surfaces things reasoning does not.

Scope it to **the surface your code actually uses**, and test *your* functions rather than the library's:

- Read the module that wraps the dependency; list its exported functions.
- Stand up the real service (a container, not a mock).
- Exercise those exports, including the degraded path (service unavailable / not configured).

Then run the new test **against the old and the new version**. Passing on both is the evidence for this upgrade. It also means the next bump of that dependency is self-verifying, so the skill gets cheaper each time it runs.

Expect the writing to surface obstacles — a module with no disposal hook that leaks an open handle, a singleton that ignores later configuration. Those are real findings, and fixing them is legitimate work the test motivated.

**2. Probe.** Where no harness exists, where a test would be disproportionate, or as a fast exploratory answer before committing. Same shape, throwaway: find the API surface, stand the service up, run old versus new, compare. A probe is a fallback, not the goal.

**3. Diff the action's inputs.** For action bumps, fetch `action.yml` at both tags and confirm every input your workflows pass still exists.

```bash
curl -sfL https://raw.githubusercontent.com/<owner>/<action>/<tag>/action.yml
```

**4. Map the migration onto this codebase.** For framework majors, read the upgrade guide, then locate each breaking change **in your files with line references**. "Removes `X`" is not useful; "removes `X`, which we call at `src/a.ts:12` and `src/b.ts:44`" is. Check the image or package tag you intend to use actually exists before relying on it.

## Phase 4 — Migration and capabilities

- **What breaks for us**, with `file:line`. Nothing that does not apply.
- **Pushing to the branch ends Dependabot's updates.** If the fix has to live on the
  Dependabot branch rather than on main, expect Dependabot to stop auto-updating that PR
  once it carries a commit that is not its own. Staleness becomes yours to handle by hand
  from then on, so push last, after the PR is otherwise ready to merge.
- **Coupled PRs.** Some bumps are only correct together — a test runner and its environment package, a client and the types for it. Landing one alone can be worse than landing neither.
- **What the new version lets us delete.** Upgrade notes are not only about breakage. A new capability can remove a workaround entirely, and this is the part everyone skips.

## Phase 5 — Verdict

Report, do not merge. One of:

- **merge-ready** — with the evidence that makes it so
- **needs-work** — the specific work, not "some fixes"
- **blocked-on X** — another PR, an external pin, a decision
- **wrong — do Y instead** — the bump is not the right change (a types package outrunning the runtime, for example)

Fill in every field. A field you cannot fill is a step you did not do:

```
Verdict:          <one of the four above>
Base:             <sha of the base branch> -> <gate result there: pass | N failures>
Reviewed head:    <sha of the PR head you actually ran against>
Gate on PR:       <result, with a COUNT — not a sample>
Attribution:      <each failure -> the specific dependency that causes it>
What we'd gain:   <a measurement, or code this lets us delete. "Staying current"
                   is not an answer — if that is genuinely all there is, write
                   that, because it lowers the bar for closing the PR>
Could not verify: <what a green run does NOT cover here>
```

`Base` and `Reviewed head` exist because a verdict is perishable. Dependabot rebases, and a rebase can change the PR's *payload*, not just its base — so a verdict without both SHAs cannot be re-checked later, and silently rots into a claim about a commit nobody can find.

`What we'd gain` exists because a verdict that only answers "can we merge this" is
half a decision. A blocked major with a large payoff deserves an issue; a blocked
major with no payoff deserves a close. Same blocker, opposite action, and the
difference is only visible if someone wrote the upside down.

`Gate on PR` takes a count because a truncated sample reads exactly like a complete result. `tsc ... | head -25` reporting "25 errors" against an actual 77 is indistinguishable from the truth in the write-up, and it understates the work by a factor of three.

Then an evidence table — what was proven, and **how**. For `Could not verify`, state scope honestly: a `pull_request_target` half, a visual change types cannot see, a production-only code path. A test passing on both versions proves the upgrade is safe *for the surface you use*, not in general.

## Acting on the verdict

Dependabot takes commands as PR comments. The closed PR then *is* the record, which
is why a comment beats a `dependabot.yml` entry for anything provisional: the
reasoning and the undo end up in the same place a future reader will land.

| Comment | Effect |
|---|---|
| `@dependabot rebase` | Rebase. May instead supersede the PR — re-check state after (Phase 0) |
| `@dependabot ignore this major version` | Closes it, and stops PRs **for that major only** |
| `@dependabot ignore this dependency` | Closes it, stops all PRs for the dependency |
| `@dependabot reopen` | Reopens **and clears the ignore** — the undo |
| `@dependabot close` | Closes without ignoring; it returns when a new version lands |

Put the reasoning and the command in one comment. Two comments leave a bare command
as the last thing on the thread.

**Check what an ignore would silence before using one.** `ignore this major version`
covers the whole major, including the later minor that fixes your blocker. If the
unblock condition is "upstream supports x.1", ignoring major x buries it. Use
`close` there and let the PR come back.

## Worked example

`redis 4.7.1 → 6.2.1`, in a repo where CI was green.

- **Phase 2:** the only references to the cache module in tests were `jest.mock('@/lib/cache/valkey')`. Green CI proved typecheck and lint, nothing else.
- **Phase 3:** the wrapper exported three functions. Wrote an integration test over those three against a real Valkey container, covering JSON round-trip, TTL expiry, falsy-value preservation, and the unconfigured no-op path. Ran it on both versions — both passed.
- **What writing it surfaced:** the module had no disposal hook, so the first run hung on an open handle; and its client is a module-level singleton that ignores a later configuration change, so the unconfigured path needed its own test file.
- **Verdict:** merge-ready, with the caveat that the evidence covers the five client methods the wrapper uses, not redis 6 in general.
