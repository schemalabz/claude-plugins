# Team Membership — API Capabilities Research

**Date**: 2026-07-30 (verified against official docs on this date; plans/APIs change — re-verify before relying on a claim)
**Companion to**: `2026-07-30-team-membership-skill-design.md`
**Purpose**: seed for `platforms.md` `Automation` fields. Untracked, like the spec.

## Verdict summary

| Verdict | Platforms |
|---|---|
| **Automatable today** (credential the team already holds, or trivially creatable) | GitHub, Elastic Cloud, PostHog, Bird, 1Password (after one admin toggle), GCP IAM (`gcloud`), DO Spaces keys, Mapbox tokens, Resend keys |
| **Automatable with setup** | Google Workspace (GAM7 / Admin SDK — one-time OAuth/SA setup), Anthropic Admin API (admin key minted in Console), ElevenLabs (Scale+ plan, admin key), Langfuse (org-scoped key; Cloud gating murky — test first), Discord (bot token; practically manual for 5 people) |
| **Manual only** | DO *team membership*, Notion (Business), Canva (Teams), Substack, WhatsApp group, Wise, Google Search Console, SnapShooter, Mux, pyannote, Plausible (standard plans), Goodstack, Tollfreenumber |

## Per-platform records

### Fully automatable member management

- **GitHub**: invite `POST /orgs/{org}/invitations`, remove `DELETE /orgs/{org}/memberships/{username}` (also cancels their pending invite). Needs org-owner + `admin:org` PAT (or fine-grained Members:write). No native `gh org invite` — use `gh api`. **Gotcha**: invitations *sent by* the departing user are not documented as auto-canceled — audit `GET /orgs/{org}/invitations` filtering the `inviter` field.
- **Elastic Cloud**: invite `POST /api/v1/organizations/{org}/invitations` (72h expiry), remove `DELETE /api/v1/organizations/{org}/members/{user_ids}`. Needs EC API key of an Organization owner. ES API keys: create `POST /_security/api_key`, invalidate `DELETE /_security/api_key` (no in-place rotation).
- **PostHog** (EU cloud): invite `/api/organizations/:org/invites/`, remove `DELETE /api/organizations/:org/members/:uuid/` — personal API key with `organization_member:write`. Project secret token has zero-downtime rotation: `PATCH .../rotate_secret_token/`. No plan gating.
- **Bird**: full org-user CRUD (`POST/DELETE /organizations/{org}/users[...]`) AND access-key CRUD (`/organizations/{org}/access-keys`). Most automatable comms platform — MessageBird-era assumptions are stale.
- **1Password (Business)**: `op user provision / suspend / delete` (suspend before delete; delete needs Owner role), `op vault user grant/revoke`. One-time toggle: "Turn On CLI Provisioning" in Provisioning settings (creates Provision Managers group). **No SCIM bridge needed.**
- **GCP IAM**: `gcloud projects add/remove-iam-policy-binding` — works with any authenticated Owner/IAM-admin, no setup. API keys: no rotate primitive — create replacement, swap, delete old (`gcloud services api-keys`).

### Key/token rotation only (members manual or nonexistent)

- **DigitalOcean**: team membership is **UI-only** (no API — historical status unchanged). Spaces keys ARE API-manageable now: `doctl spaces keys create/list/update/delete` (docs claiming UI-only are stale). Fine-grained token scopes `spaces_key:*`.
- **Mapbox**: structurally single-account — no members exist at any tier (official guidance: shared login + password manager). Offboarding = rotate tokens (Tokens API, full CRUD, needs `tokens:write` secret token) + change the shared password.
- **Resend**: members dashboard-only; API keys full create/delete via API (`POST/DELETE /api-keys`, needs full-access key).

### Automatable with setup

- **Google Workspace (Business plan — nothing is Enterprise-gated)**:
  - Create/suspend/delete users, Drive ownership transfer (Data Transfer API), alias/group management: all Admin SDK, admin OAuth or service account with domain-wide delegation. Practical route: **GAM7** CLI (guided one-time setup: GCP project + OAuth client + SA/DWD).
  - **Trap**: suspended accounts *bounce* inbound mail — "suspend + forward" is invalid. The automatable offboarding pattern: transfer Drive data → delete user → reattach freed address as alias on a surviving user or as a Group.
  - `updateAutoForwarding` (keep-account-active forwarding) is the one call requiring SA+DWD — plain admin OAuth is rejected.
- **Anthropic Admin API**: invite `POST /v1/organizations/invites`, remove `DELETE /v1/organizations/users/{id}` — but **cannot remove admin-role members** and **cannot create API keys** (Console-only; API can only list/disable). Needs `sk-ant-admin...` key, itself minted manually in Console by an admin.
- **ElevenLabs**: invite/remove via workspace API (permission-gated, not Enterprise-gated), service-account API keys creatable via API with scoped permissions. But multi-seat workspaces require **Scale+** plan.
- **Langfuse Cloud**: org/project membership upsert/delete via org-scoped API key (created once in Org Settings UI). SCIM is Enterprise-only. Docs vs third-party sources conflict on whether org keys work on standard Cloud plans — **empirically test on our plan before relying on it**.
- **Discord**: kick + role removal trivially bot-API-able (`DELETE /guilds/{id}/members/{uid}`), but for a 5-person server manual kick is simpler unless a bot already exists.

### Manual only

- **Notion (Business)**: zero write access to membership — no invite, no removal, not even guest removal. SCIM is Enterprise-only. API can only *list* users (`GET /v1/users`) — useful for audit.
- **Canva (Teams)**: Connect API users endpoints are read-only; there's a "Team invite" *webhook* (observe-only). SCIM is Enterprise/Districts-only.
- **Substack**: no API for team management at any tier.
- **WhatsApp (regular group)**: no official API; third-party group-management APIs are ToS-violating session hijacks — do not use.
- **Wise**: multi-user access is UI-only; no member/role API for business accounts. **Card cancellation requires contacting support** — not even self-service in the UI; plan lead time on offboarding day. (Card APIs in Wise docs are for platform partners, a different product.)
- **Google Search Console**: user management is entirely absent from the API surface (not gated — absent). UI: Settings → Users and permissions.
- **SnapShooter**: **decoupled from DO team membership** — removing someone from the DO team does NOT remove their SnapShooter access (separate account, OAuth-connected). No member API, no roles: every member can delete all backups. Manual removal in SnapShooter team settings is a mandatory, separate offboarding step.
- **Mux**: zero admin API surface — even access-token create/revoke is dashboard-only (org admin).
- **pyannote.ai**: teams exist but dashboard-only; keys dashboard-only (secret shown once).
- **Plausible (cloud)**: *no longer used by the team (replaced by PostHog) — record kept for reference.* Sites API is Enterprise-only and manages *guests*, not team members. Standard plans: UI only. API keys: dashboard only.
- **Goodstack**: API is nonprofit-verification data only; no team endpoints; no key rotation endpoint.
- **Tollfreenumber**: manual.

## Cross-cutting notes

1. "Rotation" almost nowhere exists as a primitive — the universal pattern is create-new → swap consumers → invalidate-old. PostHog is the exception (backup-key mechanism); Anthropic is the anti-exception (can't even create via API).
2. Enterprise-SCIM gating hits exactly the collaboration suites (Notion, Canva, Plausible, Langfuse-SCIM); infra/dev tools are mostly open.
3. The offboarding-critical trap list: Google suspend-bounces-mail; SnapShooter decoupled from DO; Wise card needs support contact; GitHub orphaned invitations sent by the leaver; Mapbox shared-password change.
