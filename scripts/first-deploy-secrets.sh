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
#
# It also writes .local/studio-runner.env, the 3D Studio processing runner's settings (its own
# database user's connection string; you add its R2 token there). Keep that file on the computer
# that runs the runner. If you set up the other secrets before the runner existed, add only the
# runner's password with:
#
#   bash scripts/first-deploy-secrets.sh --studio-runner
set -euo pipefail

replace=false
mode=all
for arg in "$@"; do
  case "$arg" in
    --replace) replace=true ;;
    --studio-runner) mode=studio-runner ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

command -v gh >/dev/null || { echo "Install the GitHub CLI (https://cli.github.com) first." >&2; exit 1; }
command -v openssl >/dev/null || { echo "openssl is required." >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Run 'gh auth login' first." >&2; exit 1; }

repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
echo "Repository: $repo"

if [ "$mode" = studio-runner ]; then
  names=(HANTEX_STUDIO_RUNNER_PASSWORD)
else
  names=(DATABASE_URL HANTEX_ADMIN_APP_PASSWORD HANTEX_PUBLIC_APP_PASSWORD HANTEX_BUILD_PASSWORD
    HANTEX_BACKUP_PASSWORD HANTEX_STUDIO_RUNNER_PASSWORD BETTER_AUTH_SECRET TOKEN_HASH_SECRET
    PREVIEW_SIGNING_SECRET UNSUBSCRIBE_SECRET PUBLISH_CALLBACK_SECRET HANTEX_BUILD_DATABASE_URL
    BACKUP_DATABASE_URL)
fi
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

put() { printf '%s' "$2" | gh secret set "$1" --repo "$repo" >/dev/null && echo "  set $1"; }
mkdir -p .local

# The runner's settings, for the computer that runs it (docs/deployment.md). Real environment
# variables of the same name take precedence over this file.
studio_runner_env() {
  (
    umask 077
    {
      echo "# 3D Studio processing runner (docs/deployment.md). Readable only by you; never commit it."
      echo "STUDIO_RUNNER_DATABASE_URL=$(as_user hantex_studio_runner "$1")"
      echo "# Cloudflare: R2 → Manage API tokens → Object Read & Write, for the hantex-studio bucket only."
      echo "STUDIO_RUNNER_R2_ACCOUNT_ID="
      echo "STUDIO_RUNNER_R2_BUCKET=hantex-studio"
      echo "STUDIO_RUNNER_R2_ACCESS_KEY_ID="
      echo "STUDIO_RUNNER_R2_SECRET_ACCESS_KEY="
    } >.local/studio-runner.env
  )
}

studio_pw=$(random)
if [ "$mode" = studio-runner ]; then
  put HANTEX_STUDIO_RUNNER_PASSWORD "$studio_pw"
  studio_runner_env "$studio_pw"
  echo "Done. Runner settings: .local/studio-runner.env. Run Deploy (production) → database to"
  echo "create the runner's database user."
  exit 0
fi

admin_pw=$(random)
public_pw=$(random)
build_pw=$(random)
backup_pw=$(random)

echo "Storing secrets in GitHub…"
put DATABASE_URL "$owner_url"
put HANTEX_ADMIN_APP_PASSWORD "$admin_pw"
put HANTEX_PUBLIC_APP_PASSWORD "$public_pw"
put HANTEX_BUILD_PASSWORD "$build_pw"
put HANTEX_BACKUP_PASSWORD "$backup_pw"
put HANTEX_STUDIO_RUNNER_PASSWORD "$studio_pw"
put BETTER_AUTH_SECRET "$(random)"
put TOKEN_HASH_SECRET "$(random)"
put PREVIEW_SIGNING_SECRET "$(random)"
put UNSUBSCRIBE_SECRET "$(random)"
put PUBLISH_CALLBACK_SECRET "$(random)"
put HANTEX_BUILD_DATABASE_URL "$(as_user hantex_build "$build_pw")"
put BACKUP_DATABASE_URL "$(as_user hantex_backup "$backup_pw")"

studio_runner_env "$studio_pw"
umask 077
{
  echo "# For step 5 only. Delete this file once both Hyperdrive configurations exist."
  echo "dashboard (hantex_admin_app, caching off): $(as_user hantex_admin_app "$admin_pw")"
  echo "public sites (hantex_public_app):           $(as_user hantex_public_app "$public_pw")"
} >.local/hyperdrive-connections.txt
echo "Done. Hyperdrive connection strings: .local/hyperdrive-connections.txt (delete after step 5)."
echo "3D Studio runner settings: .local/studio-runner.env."
