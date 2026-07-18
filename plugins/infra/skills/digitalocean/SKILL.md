---
name: digitalocean
description: Use when inspecting or changing schemalabz DigitalOcean infrastructure — app slowness/incidents (CPU, memory, restarts), deployment status, runtime logs, database config/pools, adding custom domains to App Platform apps, or DNS/TLS verification. Also use when doctl returns 401/403 errors.
---

# DigitalOcean Operations

Inspect and operate the team's DO infrastructure (App Platform apps, managed Postgres, DNS) with `doctl` + the DO API.

## One-Time Setup (each contributor)

Each contributor authenticates `doctl` once with their **own** token via the setup helper that ships with this skill. The contributor runs it **themselves, in their terminal** (not via the agent) — it walks through token creation, prompts for the token with hidden input, and verifies team access:

```bash
bash <skill-directory>/setup-auth.sh
```

The token is written only to their own `~/.config/doctl/config.yaml` — never the repo, shell history, or an agent transcript. Token policy (the script prints this too): create it under the **schemalabz team** (not your personal account), with **custom scopes** rather than Full Access — `account`/`app`/`monitoring`/`database` (read) for inspection, plus `app` (update) and `domain` (create/read) only if doing domain work — and a 90-day expiry. DO tokens **cannot** be scoped to a project or to specific resources; resource-type × action is the finest granularity, and the team is the real isolation boundary.

If `doctl` is not installed, install via your package manager (Nix users: `nix-shell -p doctl --run "..."`).

## Auth check (start every session here)

```bash
doctl auth list                  # which contexts exist, which is current
doctl account get                # who am I? (fails = bad token)
```

Tokens are per-**team**: **401** = expired/invalid token; **403** = valid token, wrong account (usually personal instead of team) or missing scope. A 403 from `account get` alone proves nothing — custom-scoped tokens without `account` (read) always fail it; the definitive team-access check is `doctl apps list`. Only conclude "wrong account/scope" if that fails too. In either case — and this is the important part — **do not try to fix auth yourself**: `doctl auth init` needs an interactive terminal to paste a secret into, and the token must be created by a human in the DO panel. Print the full path of `setup-auth.sh` (in this skill's directory), ask the user to run it in their own terminal, and continue once `doctl account get` succeeds.

**Trap (why the script removes the context first):** `doctl auth init` does NOT prompt for a new token if the context already has one — it silently re-validates the stored, possibly expired token and fails. Never pass tokens via `-t` (shell history).

## Discovery (never hardcode IDs)

```bash
doctl apps list --format ID,Spec.Name,DefaultIngress,Updated
doctl databases list
doctl databases pool list <DB_ID>
```

(`--format` columns are strict — invalid ones like `ActiveDeployment.Phase` error out; see `--help` per subcommand. Deployment phase comes from `doctl apps list-deployments` or `-o json`.)

## App metrics (raw API only — doctl has no command for these)

The ONLY app metrics the API exposes: `cpu_percentage`, `memory_percentage`, `restart_count`. Database performance metrics (query latency, connections, cache hit ratio) and HTTP response times are **dashboard-only** — don't burn time looking for endpoints.

```bash
TOKEN=$(doctl auth token 2>/dev/null || grep -m1 'access-token' ~/.config/doctl/config.yaml | awk '{print $2}')
START=$(date -d '24 hours ago' +%s); END=$(date +%s)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.digitalocean.com/v2/monitoring/metrics/apps/cpu_percentage?app_id=<APP_ID>&start=$START&end=$END"
```

Returns Prometheus-style per-instance series (`values: [[unix_ts, "val"], ...]`). Series reset on instance restart — gaps are restarts, not missing data.

**Interpretation:** sustained >90% CPU = stuck loop, not load. Spike-then-recover = burst/deploy. Memory climbing steadily = leak; memory ~100% + restart spikes = OOM-kill loop (the classic App Platform slowness signature). One instance hot while others idle = instance-specific (stuck request, cache stampede).

**Correlate with deploys:** `doctl apps list-deployments <APP_ID>` timestamps overlaid on the metric series. Also `doctl apps list-alerts <APP_ID>` to see if CPU/MEM alerts fired.

## Logs & deployments

```bash
doctl apps logs <APP_ID> --type run          # also: build, deploy, run_restarted
doctl apps logs <APP_ID> --type build --deployment <DEPLOY_ID>
doctl apps get <APP_ID> -o json              # full spec incl. domains
```

Limits: runtime logs are recent-only and **unavailable for superseded deployments** — yesterday's incident logs are usually gone unless a log forwarder is configured.

## Databases

`doctl databases get|db list|connection|backups|events list|configuration get <DB_ID>` — cluster info, contained DBs, connection strings, backup history, runtime config (`max_connections` etc.).

## Read vs write — consent required for writes

Everything in this skill is read-only **except**: `doctl apps update`, `doctl compute domain create|delete` and record changes, and any database mutation. For those:

- **Show the exact change and get explicit approval before executing.** For spec updates that means the diff (`diff spec.backup.yaml spec.yaml`), stated together with the consequence: *applying the spec triggers a production deployment.* A general request ("set up the domain") authorizes the goal — it does not replace showing the diff before you apply it.
- If the user explicitly pre-authorized unattended execution ("just do it, don't wait"), that consent covers **exactly the requested change** — still produce the diff and include it in your report.
- **Single-purpose diffs.** Never bundle anything unrequested into a spec update — not stale-entry cleanup, not alert tweaks, not "while I'm in there" fixes. The diff must contain only the requested change; propose anything else separately and wait.
- Nothing here authorizes deletions. A `delete` of any resource always requires its own explicit, per-resource confirmation, whatever was agreed before.

## Custom domains on App Platform

Our apps' ingress is **Cloudflare-fronted**: a correctly attached domain resolves to Cloudflare IPs (`172.66.x.x` / `162.159.x.x`). Don't misread that as "pointing at the wrong place" — compare against a known-good domain (`dig +short A opencouncil.gr`).

**Order matters — verify delegation before anything else:**

```bash
# 1. Registry published our nameservers? Ask the TLD servers DIRECTLY —
#    public resolvers negative-cache NXDOMAIN and lie to you for minutes/hours.
#    Individual TLD servers flake — query a few before concluding anything:
for TLD_NS in $(dig +short NS <tld>. | head -3); do
  echo "--- @$TLD_NS"; dig NS <domain> @$TLD_NS +noall +answer +time=3 +tries=1
done                                        # expect ns1/2/3.digitalocean.com
# Small-country registries (.cy, .gr) can take hours–days and manual review. If
# NXDOMAIN here, STOP — the registrar side isn't done; nothing on DO will help.

# 2. Zone answered by DO? Empty = domain not added to the DO account yet.
dig +short SOA <domain> @ns1.digitalocean.com
```

**Adding the domain — two routes:**

*Dashboard (simplest, use for one-offs):* App → Settings → Domains → Add Domain → "We manage your domain". Creates zone + records + Let's Encrypt cert in one step.

*doctl (spec-edit — the spec is REPLACED wholesale, so backup first):*

```bash
doctl apps spec get <APP_ID> > spec.yaml && cp spec.yaml spec.backup.yaml
# APPEND to domains: (keep existing entries; only one PRIMARY allowed):
#   - domain: <domain>
#     type: ALIAS
#     zone: <domain>        # zone: makes App Platform manage the DNS records
doctl apps update <APP_ID> --spec spec.yaml --wait   # triggers a deployment
```

**Verify:** domain phase via `doctl apps get <APP_ID> -o json | jq '.domains[] | {domain: .spec.domain, phase}'` (`CONFIGURING` = cert being issued, normal for a few minutes; stuck `ERROR` → check `.progress.steps`). Then `dig +short A <domain>` (expect Cloudflare IPs), `curl -sSI https://<domain>` (200/expected redirect), and re-check the existing production domains still respond.

**App-level caveat:** attaching a domain makes the platform serve it — it does NOT make the app treat it as a first-class host. Our apps resolve tenants from the Host header (see `realmForHost` in opencouncil); an unknown domain falls back to the default realm, and host-trust checks (magic-link URLs) reject it until the app config knows the domain. Infra done ≠ product done.

## Quick reference

| Task | Command |
|---|---|
| Who am I / token valid? | `doctl account get` |
| Find app ID | `doctl apps list` |
| CPU/mem/restarts | raw API `monitoring/metrics/apps/*` (no doctl) |
| Deploy history | `doctl apps list-deployments <APP_ID>` |
| Runtime logs | `doctl apps logs <APP_ID> --type run` |
| Full app spec | `doctl apps get <APP_ID> -o json` |
| Delegation live? | `dig NS <domain> @<tld-nameserver>` |
| Zone in DO? | `dig SOA <domain> @ns1.digitalocean.com` |
| DB config | `doctl databases configuration get <DB_ID>` |

## Common mistakes

- Trusting a public resolver's NXDOMAIN right after a registrar change (negative caching) — ask the TLD servers directly.
- `doctl auth init` "fails" on an expired token — it never prompted; remove the context first.
- Hunting for app metrics in doctl or DB metrics in the API — they aren't there.
- Editing the app spec without a backup — `apps update --spec` replaces everything.
- Expecting droplet-style IPs on app domains — ours are Cloudflare-fronted.
- Declaring domain setup "done" without checking the app's own host handling.
