# Team Membership Skill — Design

**Date**: 2026-07-30
**Repo**: claude-plugins (`plugins/team/skills/team-membership/`)
**Status**: Approved design, pre-implementation
**Note**: This spec stays untracked (team convention: specs and plans are not committed).

## Problem

Onboarding and offboarding team members is a long, multi-platform checklist currently living in Notion and executed by hand. The two processes are mirror images — every account granted at onboarding must be revoked at offboarding — but nothing enforces that symmetry, and offboarding has extra categories (data transfer, secrets rotation, public presence removal) that exist nowhere as a checklist. Immediate driver: one person needs to be offboarded now.

## Solution overview

A single Claude Code skill, `team-membership`, in a new `team` plugin in the claude-plugins repo. One shared **platform inventory** where each entry carries both a *grant* side and a *revoke* side; two flows (onboarding, offboarding) that walk the same inventory in opposite directions. The skill is a **guided, stateful checklist with automation for easy wins** — not full automation.

- **Onboarding flow**: runnable by the new team member themselves; flags which steps need an admin so those asks can be batched.
- **Offboarding flow**: admin-run.
- **Source of truth**: the inventory file in the repo — the *only* canonical list. The former Notion checklist is superseded; the skill has no Notion integration and no alignment step. (The initial inventory content is seeded one-time from the existing checklist text, provided in conversation.)

## Structure

```
plugins/team/
├── .claude-plugin/plugin.json     # follows existing infra/workflow plugin convention
└── skills/team-membership/
    ├── SKILL.md                   # both flows + shared core
    └── platforms.md               # the inventory
```

## Inventory format (`platforms.md`)

One section per platform. Fields:

```markdown
## <Platform>
- **What**: what access/membership means here (e.g. "schemalabz GitHub org membership")
- **Grant**: exact steps or command to give access
- **Revoke**: exact steps or command to remove access
- **Automation**: `gh` / `doctl` / code-edit / manual (with tool notes)
- **Admin URL**: direct link to the console page where the manual action happens
- **Priority**: core | low (low = the "maybe skip" tail from the Notion list)
- **Gotchas**: ordering constraints and traps (e.g. "transfer Drive ownership BEFORE
  suspending the Google account", "catch-all keeps delivering to hello@ — decide
  forwarding for the personal address explicitly")
```

Platforms to include (seeded from the existing onboarding checklist):

- **Core**: Google Workspace (account, catch-all check, profile picture), WhatsApp group, Discord, 1Password (corp account + vault), Wise (account + corp card), shared Google Drive, Notion, Canva, GitHub, Substack, Google Search Console, PostHog (+ self-exclusion of own analytics). Plausible is no longer used — not in the inventory (one-time task: close the account if still open).
- **Low priority**: Tollfreenumber, DigitalOcean, Goodstack, Anthropic, pyannote
  - `gladia.io` appears on the old checklist but no longer in either codebase — dropped from the inventory (verify the account itself should be closed as a separate one-time task)
- **From the env-variable audit** (services with team accounts/dashboards that the old checklist omitted — engineers may or may not get individual access, the inventory entry records which): Resend (transactional email), Elastic Cloud (Elasticsearch), Mapbox, Bird (WhatsApp/SMS), Mux (video), ElevenLabs (transcription), Langfuse (observability), Google Cloud Console (IAM on the project holding `GOOGLE_API_KEY`, YouTube Data API, and the Calendar OAuth client), Snapshooter (DB backups)
- **Public presence** (modeled as inventory entries too, since both flows touch them): schemalabs.gr, opencouncil.gr/about, Canva presentations folder

Adding a new platform = adding one entry, which updates both flows at once.

## Onboarding flow

Run *with or by* the new team member. Sections, in order:

1. **Accounts** — walk the grant side of each inventory entry in setup order. Steps needing admin rights are flagged `[admin]` so the person can batch requests instead of blocking per-step.
2. **Public presence** — add name/photo to schemalabs.gr and opencouncil.gr/about (code edits → PRs), Canva presentations (manual).

Contractual paperwork appears as a reminder item (admin-side).

The onboarding curriculum (things to read, things to schedule, longer-term education) is deliberately **not** part of this skill — it is orientation content, not access mechanics, and lives wherever the team keeps human onboarding material.

## Offboarding flow

Admin-run. Phases in dependency order:

1. **Prep** — generate the person's run-state file from the inventory; confirm with the admin which platforms the person actually has (low-priority entries are often unset).
2. **Data transfer** — Google Drive/Docs ownership transfer, Notion page ownership, email handling decision for the @opencouncil.gr address, calendar cleanup. Must complete before account suspension. **Trap (from the API research)**: a *suspended* Google account bounces inbound mail, so "suspend + forward" is not a valid combo — the working pattern is transfer data → delete user → reattach the freed address as an alias on a surviving account or as a Group.
3. **Secrets rotation** — enumerate what the person could access: 1Password shared vault items, SSH keys on team servers (preview droplet 159.89.98.26, tasks host 134.122.74.255 — checkable directly via `authorized_keys`), shared API keys. Decide per item whether rotation is warranted; rotate.
   - **Shared API keys** (anyone with 1Password vault / DO App Platform console / server access could have seen these): per-service keys for Resend, Anthropic, Elastic Cloud, Mapbox, Bird (+ webhook secret), Mux, ElevenLabs, Langfuse, PostHog, pyannote, Google API keys, DO Spaces keys.
   - **Internal shared secrets**: `TASK_API_KEY`, `CRON_SECRET`, `NEXTAUTH_SECRET`, `BIRD_WEBHOOK_SECRET`, basic-auth credentials, database passwords.
   The skill's rotation phase walks this census; the inventory records which secrets each platform entry owns so the census stays derived, not hand-maintained. (Checked and confirmed *not* person-bound, so not offboarding concerns: `GOOGLE_CALENDAR_REFRESH_TOKEN`, `SCHEMA_URL`, `secrets/cookies.json`.)
4. **Account revocation** — walk the revoke side of every inventory entry, automated or manual per its `Automation` field (see automation policy). Inventory gotchas the walk must surface: SnapShooter access is decoupled from DO team membership (separate manual removal, and members can delete all backups); DO *team* removal itself is UI-only; GitHub org invitations *sent by* the leaver survive their removal (audit via the invitations API `inviter` field); Mapbox is a shared single account (rotate tokens + change the shared password); Wise card cancellation requires contacting support — start it early.
5. **Public presence removal** — schemalabs.gr, opencouncil.gr/about (code edits → PRs), Canva presentations (manual).
6. **Exit logistics** — contractual paperwork, Wise corp card cancellation, exit 1:1, team announcement. Reminders only.

## Skill behavior (shared core)

- **Direction first**: the skill's first action is asking onboarding vs offboarding (unless obvious from the invocation).
- **Confirm-each-step loop**: present one phase at a time; for automatable steps, show what will run and confirm before anything destructive; for manual steps, print exact instructions + admin URL, then wait for the human to confirm done.
- **Run state**: a per-person markdown checklist generated at flow start, stored at `~/.local/state/team-membership/<person-slug>.md` — deliberately outside any git repo, because it names a real person (privacy: never committed, never in the plugins repo). Resumable across sessions: on invocation the skill checks for an existing run file and offers to continue. The completed run file itself is the record; archiving it anywhere else is the admin's choice, outside the skill.
- **Automation policy**: per-platform API capabilities were researched and verified 2026-07-30 — see the companion doc `2026-07-30-team-membership-api-capabilities.md`, which seeds each inventory entry's `Automation` field. The v1 rule: **automate when the required credential is already in hand at run time; otherwise print manual steps.** Automatable today: GitHub (`gh api`), Elastic Cloud, PostHog, Bird, 1Password (`op`, after a one-time CLI-provisioning toggle), GCP IAM (`gcloud`), and key rotation for DO Spaces (`doctl spaces keys`), Mapbox, Resend. Each manual-only or with-setup entry records *why* (plan gating, missing API) so nobody re-researches it. Building new infrastructure (GAM7/Google Admin SDK setup, Anthropic admin key, Discord bot) is out of scope for v1 but recorded in the inventory as upgrade paths.

## Out of scope (v1)

- Google Workspace Admin SDK automation (suspend, Drive transfer via API)
- Any Notion integration whatsoever — the repo inventory fully replaces the old checklist's account sections
- The onboarding curriculum (reading list, scheduling, education) — orientation content, not access mechanics
- Any HR/payroll system beyond reminder items

## Success criteria

1. The immediate offboarding is completed end-to-end using the skill's first live run, with the run file as the audit trail.
2. A future onboarding can be run from the same inventory without editing SKILL.md structure.
3. Adding a platform requires touching only `platforms.md`.
