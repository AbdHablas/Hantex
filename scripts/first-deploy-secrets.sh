#!/usr/bin/env bash
# First deployment, step 2 (docs/deployment.md): generates the database passwords and random
# secrets and stores them as GitHub Actions secrets, so they never pass through chat, email or
# this repository. Run it on your own computer, in this repository's folder, after step 1:
#
#   gh auth login            # once, as the repository owner
#   bash scripts/first-deploy-secrets.sh
#
# It asks for the Neon owner connection string (hidden while typing). It refuses to replace
# secrets that already exist unless run with --replace, because changing database passwords
# after the database step has run needs that step run again.
#
# For step 5 (Hyperdrive) it writes the dashboard's and the public site's connection strings to
# .local/hyperdrive-connections.txt (readable only by you; .local is never committed). Delete
# that file once the Hyperdrive configurations exist.
set -euo pipefail

replace=false
[ "${1:-}" = "--replace" ] && replace=true

command -v gh >/dev/null || { echo "Install the GitHub CLI (https://cli.github.com) first." >&2; exit 1; }
command -v openssl >/dev/null || { echo "openssl is required." >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Run 'gh auth login' first." >&2; exit 1; }

repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
echo "Repository: $repo"

names=(DATABASE_URL HANTEX_ADMIN_APP_PASSWORD HANTEX_PUBLIC_APP_PASSWORD HANTEX_BUILD_PASSWORD
  HANTEX_BACKUP_PASSWORD BETTER_AUTH_SECRET TOKEN_HASH_SECRET PREVIEW_SIGNING_SECRET
  PUBLISH_CALLBACK_SECRET HANTEX_BUILD_DATABASE_URL BACKUP_DATABASE_URL)
existing=$(gh secret list --repo "$repo" --json name --jq '.[].name')
for name in "${names[@]}"; do
  if grep -qx "$name" <<<"$existing" && [ "$replace" = false ]; then
    echo "$name already exists. Nothing was changed. Use --replace only if you mean to rotate them." >&2
    exit 1
  fi
done

printf 'Neon owner connection string (postgresql://…, hidden): '
read -rs owner_url
echo
case "$owner_url" in
  postgres://*@*/* | postgresql://*@*/*) ;;
  *) echo "That does not look like a PostgreSQL connection string." >&2; exit 1 ;;
esac
# Hyperdrive and the workflows need the direct host, not Neon's "-pooler" one.
if [[ "$owner_url" == *-pooler.* ]]; then
  echo "Use the direct connection string (turn off 'Connection pooling' in Neon's Connect dialog)." >&2
  exit 1
fi

scheme=${owner_url%%://*}
rest=${owner_url#*://}
host_and_db=${rest#*@}
as_user() { printf '%s://%s:%s@%s' "$scheme" "$1" "$2" "$host_and_db"; }
random() { openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48; }

admin_pw=$(random)
public_pw=$(random)
build_pw=$(random)
backup_pw=$(random)

put() { printf '%s' "$2" | gh secret set "$1" --repo "$repo" >/dev/null && echo "  set $1"; }
echo "Storing secrets in GitHub…"
put DATABASE_URL "$owner_url"
put HANTEX_ADMIN_APP_PASSWORD "$admin_pw"
put HANTEX_PUBLIC_APP_PASSWORD "$public_pw"
put HANTEX_BUILD_PASSWORD "$build_pw"
put HANTEX_BACKUP_PASSWORD "$backup_pw"
put BETTER_AUTH_SECRET "$(random)"
put TOKEN_HASH_SECRET "$(random)"
put PREVIEW_SIGNING_SECRET "$(random)"
put PUBLISH_CALLBACK_SECRET "$(random)"
put HANTEX_BUILD_DATABASE_URL "$(as_user hantex_build "$build_pw")"
put BACKUP_DATABASE_URL "$(as_user hantex_backup "$backup_pw")"

mkdir -p .local
umask 077
{
  echo "# For step 5 only. Delete this file once both Hyperdrive configurations exist."
  echo "dashboard (hantex_admin_app, caching off): $(as_user hantex_admin_app "$admin_pw")"
  echo "public sites (hantex_public_app):           $(as_user hantex_public_app "$public_pw")"
} >.local/hyperdrive-connections.txt
echo "Done. Hyperdrive connection strings: .local/hyperdrive-connections.txt (delete after step 5)."
