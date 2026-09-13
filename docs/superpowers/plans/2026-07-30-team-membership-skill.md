# Team Membership Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `team-membership` skill (onboarding + offboarding flows over a shared platform inventory) as a new `team` plugin in the claude-plugins repo.

**Architecture:** A documentation-only deliverable: a new plugin directory with `plugin.json`, a marketplace registration, and one skill consisting of `SKILL.md` (process: shared core + two flows) and `platforms.md` (inventory: one entry per platform with grant/revoke sides). No application code; "tests" are structural verification and a dry-run.

**Tech Stack:** Claude Code plugin/skill format (YAML frontmatter + markdown), git.

## Global Constraints

- Repo: `~/schema-labs/projects/claude-plugins` — work on branch `feat/team-membership-skill` off `main`.
- Content sources (both untracked, in `docs/superpowers/specs/`): `2026-07-30-team-membership-skill-design.md` (the spec) and `2026-07-30-team-membership-api-capabilities.md` (verified API research). Every factual claim in `platforms.md` must come from these two docs — no new unverified claims.
- **Never commit**: the spec, the plan, this plans/ or specs/ directory, or any file naming a real person. Run-state files live at `~/.local/state/team-membership/` — outside the repo by design.
- **Never push without explicit user approval** (public action). Plan ends before push.
- No `Co-Authored-By` lines in commits. Commit messages: conventional style matching repo history (`feat: …`).
- No hard line-wrapping in markdown (flowing paragraphs).
- Plausible is NOT in the inventory (team migrated to PostHog). gladia.io is NOT in the inventory (no longer used).

---

### Task 1: Plugin scaffold and marketplace registration

**Files:**
- Create: `plugins/team/.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json` (add third entry)

**Interfaces:**
- Produces: plugin `team` that Tasks 2–3 put a skill inside (`plugins/team/skills/team-membership/`).

- [ ] **Step 1: Create branch**

```bash
cd ~/schema-labs/projects/claude-plugins && git checkout -b feat/team-membership-skill main
```

- [ ] **Step 2: Write plugin.json**

Create `plugins/team/.claude-plugin/plugin.json`:

```json
{
  "name": "team",
  "description": "Team-operations skills (member onboarding/offboarding) for the schemalabz team.",
  "author": {
    "name": "schemalabz"
  }
}
```

- [ ] **Step 3: Register in marketplace.json**

In `.claude-plugin/marketplace.json`, append to the `plugins` array (after the `infra` entry):

```json
    {
      "name": "team",
      "source": "./plugins/team",
      "description": "Team-operations skills: member onboarding and offboarding."
    }
```

- [ ] **Step 4: Verify JSON validity**

Run: `jq . plugins/team/.claude-plugin/plugin.json && jq . .claude-plugin/marketplace.json`
Expected: both parse and print; marketplace shows 3 plugins.

- [ ] **Step 5: Commit**

```bash
git add plugins/team/.claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit -m "feat(team): scaffold team plugin"
```

---

### Task 2: Platform inventory (`platforms.md`)

**Files:**
- Create: `plugins/team/skills/team-membership/platforms.md`

**Interfaces:**
- Consumes: verified facts from the two source docs (see Global Constraints).
- Produces: inventory entries whose exact section headings (`## GitHub` etc.) and field names (`What/Grant/Revoke/Automation/Admin URL/Priority/Gotchas`) SKILL.md (Task 3) refers to generically.

- [ ] **Step 1: Write the file header and entry template**

Open `platforms.md` with:

```markdown
# Platform Inventory

Canonical list of every platform a Schema Labs team member gets access to. Each entry has a grant side (onboarding) and a revoke side (offboarding). The skill walks these in order; adding a platform here updates both flows at once.

Automation verdicts were verified against official docs on 2026-07-30 — re-verify a claim before relying on it if significant time has passed. "Automate when the credential is already in hand at run time; otherwise follow the manual steps."

Entry format:

- **What**: what access/membership means here
- **Grant**: steps or command to give access
- **Revoke**: steps or command to remove access
- **Automation**: automatable-today / automatable-with-setup / manual-only, with tool and why
- **Admin URL**: where the manual action happens
- **Priority**: core | low
- **Gotchas**: ordering constraints and traps
```

- [ ] **Step 2: Write the fully-worked GitHub entry (the pattern for all others)**

```markdown
## GitHub
- **What**: membership in the `schemalabz` GitHub organization
- **Grant**: `gh api orgs/schemalabz/invitations -f email=<email>` (no native `gh org invite`; caller needs org owner + `admin:org` scope)
- **Revoke**: `gh api -X DELETE orgs/schemalabz/memberships/<username>` (also cancels their own pending invitation)
- **Automation**: automatable-today (`gh` CLI, already authenticated for org admins)
- **Admin URL**: https://github.com/orgs/schemalabz/people
- **Priority**: core
- **Gotchas**: invitations *sent by* the departing member are not auto-canceled — audit with `gh api orgs/schemalabz/invitations` and check the `inviter` field.
```

- [ ] **Step 3: Write the remaining entries from the capabilities doc**

One entry per platform below, same format, facts lifted from `2026-07-30-team-membership-api-capabilities.md` (automation verdict, commands/endpoints, gating reason) and the spec (what/priority/process gotchas). Order = onboarding setup order.

Core: Google Workspace (account create, catch-all test, profile picture; GAM7/Admin SDK = with-setup; gotcha: suspended accounts bounce mail — offboarding pattern is transfer → delete → re-attach address as alias/group), Google Cloud Console (IAM via `gcloud` = today), WhatsApp group (manual-only, no official API — never use third-party session-hijack APIs), Discord (manual kick; bot API exists but overkill), 1Password (op CLI provision/suspend/delete + vault grant/revoke = today after one-time "Turn On CLI Provisioning" toggle; delete needs Owner role), Wise (manual-only; gotcha: card cancellation requires contacting support — start early), shared Google Drive (covered by Workspace entry's data-transfer notes), Notion (manual-only on Business — zero membership write API, listing via `GET /v1/users` for audit), Canva (manual-only on Teams; also covers the Presentations folder for public-presence), Substack (manual-only, no API), Google Search Console (manual-only — user management absent from API), PostHog (invites/removal via API with `organization_member:write` personal key = today; includes self-exclusion-of-own-analytics onboarding step; project secret token has zero-downtime rotation).

From env audit: Resend (members manual, key rotation via API = today), Elastic Cloud (org invites/removal via API = today, org-owner EC key; ES keys create+invalidate), Mapbox (single shared account — no members; offboard = rotate tokens via Tokens API + change shared password), Bird (org-user CRUD + access-key CRUD via API = today), Mux (manual-only — zero admin API, even tokens are dashboard-only), ElevenLabs (invite/remove + service-account keys via API = with-setup, needs Scale+ plan and admin key), Langfuse (org-scoped-key membership API = with-setup; Cloud plan gating murky — test before relying; SCIM is Enterprise-only), SnapShooter (manual-only; **gotcha: decoupled from DO team membership — separate removal, and every member can delete all backups**).

Low priority: DigitalOcean (team membership manual-only/UI; Spaces keys rotate via `doctl spaces keys` = today), Anthropic (invites/removal via Admin API = with-setup, `sk-ant-admin…` key minted in Console; cannot remove admin-role members, cannot create keys via API), pyannote (manual-only, teams + keys dashboard-only), Tollfreenumber (manual), Goodstack (manual-only, no team API).

Public presence: schemalabs.gr (code edit → PR in that repo), opencouncil.gr/about (code edit → PR in opencouncil repo), Canva presentations (manual, points at Canva entry).

- [ ] **Step 4: Verify inventory completeness against the spec**

Run a manual check: every platform named in the spec's "Platforms to include" section has exactly one entry; no entry mentions Plausible or gladia; every entry has all 7 fields.

```bash
grep -c '^## ' plugins/team/skills/team-membership/platforms.md
```
Expected: ~27 sections (26 platforms + template heading counts none — adjust expectation to actual list).

- [ ] **Step 5: Commit**

```bash
git add plugins/team/skills/team-membership/platforms.md
git commit -m "feat(team): platform inventory for member on/offboarding"
```

---

### Task 3: The skill itself (`SKILL.md`)

**Files:**
- Create: `plugins/team/skills/team-membership/SKILL.md`

**Interfaces:**
- Consumes: `platforms.md` entry format from Task 2 (field names, priority values).
- Produces: the user-facing skill; frontmatter `name: team-membership`.

- [ ] **Step 1: Write frontmatter and shared core**

```markdown
---
name: team-membership
description: Guided onboarding or offboarding of a Schema Labs team member across all platforms (accounts, access, public presence, secrets). Use when a new person joins the team or someone is leaving — walks a shared platform inventory, automates steps where credentials allow, gives click-by-click instructions otherwise, and tracks progress in a resumable per-person checklist.
---

# Team Membership (Onboarding / Offboarding)

Walk a team member's access lifecycle using the platform inventory in `platforms.md` (same directory). Two flows over the same inventory: onboarding walks each entry's **Grant** side, offboarding the **Revoke** side.

## Shared rules

1. **Direction first.** If not obvious from the request, ask: onboarding or offboarding? Then collect: person's name, personal email, @opencouncil.gr address (offboarding), GitHub username.
2. **Run state.** Progress lives in `~/.local/state/team-membership/<person-slug>.md` — deliberately OUTSIDE every git repo because it names a real person; never copy it into a repo. On start, check for an existing file and offer to resume. Create the directory if missing. Generate the checklist by copying every applicable inventory entry as an unchecked item (confirm with the user which low-priority platforms apply).
3. **Confirm-each-step loop.** Work one phase at a time. For automatable steps: show the exact command, get confirmation before anything destructive or externally visible, run it, record the result. For manual steps: print the instructions and Admin URL from the inventory entry, then wait for the human to confirm before checking the item off.
4. **Automation rule.** Automate only when the required credential is already available in the current environment; otherwise fall back to the manual steps. Never mint new credentials, service accounts, or bots mid-run — the inventory records those as upgrade paths.
5. **Verify claims before relying on them.** Automation verdicts were verified 2026-07-30; if an API call fails unexpectedly, treat the inventory as possibly stale, do the step manually, and note the discrepancy for an inventory update.
```

- [ ] **Step 2: Write the onboarding flow section**

```markdown
## Onboarding flow

Run with (or by) the new team member. Steps needing admin rights are tagged `[admin]` in the walk so the person can batch requests instead of blocking on each.

1. **Accounts** — walk every core entry's Grant side in inventory order, then ask which low-priority entries apply. Google Workspace comes first (other platforms invite the new address). Include the entry-specific onboarding checks (catch-all test: send mail to hello@opencouncil.gr from an external address and confirm the new person receives it; PostHog self-exclusion of own analytics on desktop and mobile).
2. **Public presence** — add name/photo: schemalabs.gr and opencouncil.gr/about are code edits (open PRs in those repos), Canva presentations manual.
3. **Reminders (admin)** — contractual paperwork. The onboarding curriculum (reading, scheduling, education) is intentionally NOT part of this skill.
```

- [ ] **Step 3: Write the offboarding flow section**

```markdown
## Offboarding flow

Admin-run. Phases in dependency order — data before destruction:

1. **Prep** — create the run file; confirm which platforms the person actually has.
2. **Data transfer** — Drive/Docs ownership, Notion pages, calendar; decide the fate of the @opencouncil.gr address. **Trap: a suspended Google account bounces inbound mail** — the working pattern is transfer data → delete user → re-attach the freed address as an alias on a surviving account or as a Group (see the Google Workspace entry).
3. **Secrets rotation** — enumerate what the person could access: 1Password shared vault items, SSH keys on team servers (preview droplet 159.89.98.26, tasks host 134.122.74.255 — check `authorized_keys` directly), shared API keys from each inventory entry. Per item: decide rotate/skip with the admin (rotating e.g. NEXTAUTH_SECRET logs everyone out — cost-benefit, not blanket rotation). Rotation pattern everywhere: create new → swap consumers → invalidate old.
4. **Account revocation** — walk every applicable entry's Revoke side. Surface each entry's Gotchas as you go (SnapShooter is separate from DO; GitHub invitations sent by the leaver; Mapbox shared-password change; Wise card via support).
5. **Public presence removal** — mirror of onboarding step 2.
6. **Exit logistics (reminders)** — contractual paperwork, corp card cancellation, exit 1:1, team announcement.
```

- [ ] **Step 4: Verify skill loads structurally**

Run: `head -5 plugins/team/skills/team-membership/SKILL.md` — frontmatter opens with `---` and has `name` + `description`. Compare shape against `plugins/workflow/skills/merge-pr/SKILL.md`.

- [ ] **Step 5: Commit**

```bash
git add plugins/team/skills/team-membership/SKILL.md
git commit -m "feat(team): team-membership skill with onboarding and offboarding flows"
```

---

### Task 4: Self-review and dry-run

**Files:**
- Modify (fixes only): the two files from Tasks 2–3.

- [ ] **Step 1: Spec-coverage check**

Read the spec top to bottom; for each requirement, point at the line in SKILL.md/platforms.md that implements it. Fix gaps inline. Specifically confirm: run-state path matches spec (`~/.local/state/team-membership/`), no Plausible/gladia entries, curriculum explicitly out, all five offboarding-trap gotchas present.

- [ ] **Step 2: Dry-run the offboarding flow**

Simulate: read SKILL.md as if invoked with "offboard Jane Doe", and walk phases 1–2 mentally against the inventory. Verify the instructions are executable without reaching for the spec or research doc (the skill must be self-contained — teammates installing the plugin never see the untracked spec).

- [ ] **Step 3: Commit any fixes**

```bash
git add -u && git commit -m "fixup! feat(team): team-membership skill with onboarding and offboarding flows"
```
(Skip if no changes. Squash fixups before any push, per workflow.)

---

### Task 5: Handoff (gated)

- [ ] **Step 1: Present the branch to the user** — summary of commits, offer to push + open a PR against `schemalabz/claude-plugins` main. **Do not push without approval.**
- [ ] **Step 2: After merge (or local install for immediate use)** — for the urgent offboarding, the skill can be used before merge via the documented dev-mode symlink: `ln -s ~/schema-labs/projects/claude-plugins/plugins/team ~/.claude/skills/team` (remove after marketplace install). First live run = the real offboarding.
