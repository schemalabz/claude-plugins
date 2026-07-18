#!/usr/bin/env bash
# One-time doctl auth setup for the schemalabz DigitalOcean team.
# Run this YOURSELF in your terminal (not via the agent) — it prompts for an
# API token with hidden input. The token is written only to your own
# ~/.config/doctl/config.yaml — never the repo, shell history, or a transcript.
set -euo pipefail

CONTEXT="${1:-default}"

command -v doctl >/dev/null 2>&1 || {
    echo "doctl not found. Install it first (e.g. your package manager, or Nix: nix-shell -p doctl)." >&2
    exit 1
}

cat <<'EOF'
First create a token, if you haven't already:

  DigitalOcean control panel -> API -> Tokens -> Generate New Token
  * Under the schemalabz TEAM (top-left team switcher), NOT your personal account
  * Custom scopes (not Full Access):
      inspection:    account (read), app (read), monitoring (read), database (read)
      domain setup:  add app (update), domain (create/read)
  * Expiry: 90 days (re-run this script when it expires)

EOF

# doctl auth init silently re-validates an existing token instead of prompting
# for a new one, so clear the context first.
doctl auth remove --context "$CONTEXT" >/dev/null 2>&1 || true
doctl auth init --context "$CONTEXT"
doctl auth switch --context "$CONTEXT" >/dev/null

echo
echo "Verifying token..."
# Identity check — informative only. It requires the account (read) scope, so a
# 403 here does NOT mean the token is broken.
doctl account get --format Email,Team,Status 2>/dev/null \
    || echo "(skipping identity check: token lacks the account (read) scope — that's OK)"

echo
if doctl apps list --format ID >/dev/null 2>&1; then
    echo "OK: app read access works (team resources reachable)."
else
    echo "WARNING: token is valid but cannot list apps." >&2
    echo "Likely causes: token created under your PERSONAL account instead of the" >&2
    echo "schemalabz team, or missing the app (read) scope. Recreate the token." >&2
    exit 1
fi
