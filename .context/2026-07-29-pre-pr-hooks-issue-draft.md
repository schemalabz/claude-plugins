---
context: |
  Draft GitHub issue for schemalabz/claude-plugins, NOT yet filed. Andreas wants to
  revisit it from a future session with more context and ideas before opening it.

  How we got here: during work on opencouncil PR #576 (feedback-call preference
  checkbox + privacy policy), we discussed adding UI screenshots to PR descriptions
  via the browser-scripting skill, and how to make that a routine part of the
  workflow. First instinct was to extend opencouncil's pre-pr command
  (.claude/commands/pre-pr.md) — but Andreas pointed out the team created pre-pr
  and never actually uses it: opt-in checklists that require remembering don't run.
  The conversation converged on hooks as the fix (deterministic, harness-executed),
  and specifically hooks shipped via the workflow plugin in this repo so the whole
  team gets them with the plugin instead of per-machine settings.json. Andreas said
  this hooks idea has been on his mind for a while and asked to track it as an issue.

  Design points already explored (reflected in the draft below): PreToolUse hook
  matching `gh pr create`; exit 2 blocks and feeds the fix list back to the agent;
  keep hook checks fast and objective (fixup!/WIP commits, package.json without
  lockfile, @mentions) with slow checks (build/tests/lint) left to CI; judgment
  calls like "UI PR needs a screenshot" as advisory rather than blocking; per-repo
  config file so the plugin stays generic (UI paths are opencouncil-specific);
  escape hatch for false positives; known limit that it only covers agent sessions
  with the plugin installed (manual gh pr create and outside contributors still
  rely on CI / PR templates).

  Related threads not in the issue: the screenshot-hosting question for PR bodies
  (gh CLI can't upload images; leading option was browser-skill drag-drop into the
  GitHub editor → user-attachments CDN; alternatives DO Spaces or an assets repo),
  and a still-pending pilot to manually add a screenshot of the new checkbox to
  opencouncil PR #576. Also on the table but parked: a PR template with a
  Screenshots section, and a CLAUDE.md rule in opencouncil — complementary,
  team-wide nets that don't depend on the plugin.

  State: issue preview was approved-in-shape but deliberately not filed. Searched
  schemalabz/claude-plugins for related issues (none found, 2026-07-29). Repo has
  only default GitHub labels; `enhancement` fits. When resuming: refine the body,
  then file with `gh issue create --repo schemalabz/claude-plugins`.
---

# Draft issue: Enforce pre-PR quality checks via plugin hooks

**Repo:** `schemalabz/claude-plugins`
**Labels:** `enhancement`

**Title:** Enforce pre-PR quality checks via plugin hooks

### Concept

Quality checks that rely on someone remembering to run them don't run. OpenCouncil has a `pre-pr` command (`.claude/commands/pre-pr.md`) with a solid checklist — commit hygiene, lockfile consistency, dead code — but in practice it's never invoked, so PRs regularly go up with `fixup!` commits or other issues a mechanical check would have caught.

Plugins can ship hooks, and hooks execute deterministically on the action itself: a `PreToolUse` hook watching for `gh pr create` would run checks at the exact moment a PR is about to open, in every session of everyone with the workflow plugin installed — no memory required, no per-machine setup. A failing check can block the call and feed the fix list straight back to the agent.

This would give the team one shared enforcement point for pre-PR standards, instead of per-repo checklists that drift and get forgotten.

### User Story

As a maintainer, I want objective pre-PR standards enforced automatically at PR-creation time, so that avoidable review round-trips (fixup commits, missing lockfile updates, missing UI screenshots) stop reaching reviewers.

### Context

Ideas that came out of the discussion that motivated this — open for whoever picks it up:

- Hook checks should stay **fast and objective** (git/grep-level, sub-second): leftover `fixup!`/`WIP` commits, `package.json` changed without `package-lock.json`, `@mentions` in commit messages. Slow checks (build, tests, lint) remain CI's job.
- Some checks are judgment calls rather than hard rules — e.g. "this PR touches UI, does it include a screenshot?" — and probably fit better as advisory output than a hard block.
- Repo-specific knowledge (which paths count as UI) shouldn't live in the plugin; a small optional config file in each repo could declare it, with the hook running only generic checks otherwise.
- Needs an escape hatch for false positives, or the first wrong block gets the whole thing disabled.
- Known limits: only covers PRs opened through agent sessions with the plugin installed — manual `gh pr create` and outside contributors still rely on CI / PR templates.
