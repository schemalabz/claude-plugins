---
name: merge-pr
description: Merge an approved PR with the right strategy. Assesses the branch's commit history to recommend merge commit vs squash, runs pre-flight checks (CI, approval, fixups, rebase state), and builds the merge commit body. Use when a PR is reviewed and ready to land.
disable-model-invocation: true
allowed-tools: Bash, AskUserQuestion
argument-hint: <pr-number>
---

# Merge PR

Merge pull request `$ARGUMENTS` with the strategy its history deserves.

**Core principle:** the merge strategy follows from the quality of the branch's commit history. Clean, atomic, logically-separate commits are worth preserving → merge commit. A single concern or messy incremental history → squash. Never decide silently — always present the assessment and let the user confirm.

## Step 1: Pre-flight checks

Determine the remote and gather PR state:

```bash
git remote | grep -q upstream && REMOTE=upstream || REMOTE=origin
gh pr view <PR#> --json state,isDraft,title,baseRefName,headRefName,headRepositoryOwner,isCrossRepository,reviewDecision,mergeable
gh pr checks <PR#> --required   # required checks are the gate; plain `gh pr checks` shows the rest
git fetch $REMOTE               # plain fetch, so the $REMOTE/<base> and $REMOTE/<head-branch> tracking refs used below are actually fresh
```

All of these must hold — report any failure and **stop** (the user can override explicitly):

1. PR state is `OPEN`, `isDraft` is false, and `mergeable` is not `CONFLICTING`.
2. All required CI checks pass. Non-required (bot) check failures are worth mentioning but don't block.
3. `reviewDecision` is `APPROVED`.
4. No `fixup!`/`squash!` commits on the branch:
   ```bash
   git log --oneline $REMOTE/<base>..$REMOTE/<head-branch> | grep -E "fixup!|squash!"
   ```
   If any exist, point to the `atomic-commits` skill and stop.

Also record `isCrossRepository` — it decides branch deletion in Step 3.

## Step 2: Assess the history

Show the branch's commits and classify:

```bash
git log --oneline $REMOTE/<base>..$REMOTE/<head-branch>
git cherry -v $REMOTE/<base> $REMOTE/<head-branch>
```

`git cherry` lines starting with `-` are commits whose changes already exist in base (cherry-picked or merged elsewhere). If any appear, the branch history doesn't cleanly represent what will land — point to the `rebase-pr` skill to clean it up before a merge commit (a squash is unaffected).

- **Merge commit** — multiple commits, each an atomic, logically-separate change with conventional messages (`type(scope): subject`). History is worth preserving.
- **Squash** — a single concern spread over incremental commits, WIP/fixup-style messages, or one commit total. History adds noise, not information.

Borderline (good commits mixed with noise)? Mention that `atomic-commits` could make it merge-commit-worthy, but don't run it — v1 of this skill only assesses.

**Present the commit list, your classification with a one-line reason, and the recommendation. Ask the user to confirm the strategy before proceeding.**

## Step 3: Merge

### Merge commit path

1. **Require the branch to be rebased on latest `<base>`:**
   ```bash
   git merge-base --is-ancestor $REMOTE/<base> $REMOTE/<head-branch> && echo OK || echo NEEDS-REBASE
   ```
   If `NEEDS-REBASE`, stop and point to the `rebase-pr` skill. Do not merge a stale branch with a merge commit.
2. **Build the merge body** — the hash + title list, generated from the current (post-rebase) tip so hashes are final. Keep git's newest-first order:
   ```bash
   git log --oneline --no-decorate $REMOTE/<base>..$REMOTE/<head-branch>
   ```
3. **Merge.** The subject matches GitHub's native format (`<owner>` is `headRepositoryOwner` from Step 1); add `--delete-branch` only when `isCrossRepository` is false — never delete an external contributor's fork branch:
   ```bash
   gh pr merge <PR#> --merge --subject "Merge pull request #<PR#> from <owner>/<head-branch>" --body "<oneline list>" [--delete-branch]
   ```

### Squash path

1. Compose the squash subject in the repo's convention: `type(scope): subject (#<PR#>)` — derive type/scope from the branch's commits, take the subject from the PR title.
2. Body: a short summary distilled from the PR description (not the full description, and never bot-generated sections).
3. **Merge** (same `--delete-branch` rule as the merge-commit path):
   ```bash
   gh pr merge <PR#> --squash --subject "<subject>" --body "<body>" [--delete-branch]
   ```

## Step 4: Post-merge

1. Verify the merge landed (`gh pr view <PR#> --json state,mergedAt`) and that the head branch is gone when it should be.
2. Remind about local cleanup: review worktrees, local branches, and any `backup/pr-<N>-*` branches on origin.

## Common mistakes

| Mistake | Consequence | Rule |
|---|---|---|
| Generating the oneline list before the final rebase/push | Merge body references dead hashes | Build the list from the branch tip at merge time |
| Merge commit on a stale branch | Merge commit contains real conflict-resolution code changes, breaking the "merge commits contain no code changes" audit assumption | Rebase first, always |
| Squashing away a clean multi-commit history | Loses reviewable, revertable units | Assess before choosing; when in doubt ask |
| Auto-deciding the strategy | User loses the call on history shape | Always confirm the strategy explicitly |
