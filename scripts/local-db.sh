#!/usr/bin/env bash
# Local PostgreSQL for development and tests, without Docker.
# Usage: scripts/local-db.sh start|stop|reset|status|url
# Data lives in .local/pg (git-ignored). Listens on 127.0.0.1:54329 only.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$ROOT/.local/pg"
PORT="${HANTEX_PG_PORT:-54329}"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -n "$PGBIN" ] || PGBIN="$(dirname "$(command -v pg_ctl)")"

# PostgreSQL refuses to run as root; use the postgres system user when we are root.
run() {
  if [ "$(id -u)" = "0" ]; then runuser -u postgres -- "$@"; else "$@"; fi
}

init() {
  mkdir -p "$DATA"
  [ "$(id -u)" = "0" ] && chown -R postgres:postgres "$ROOT/.local"
  if [ ! -f "$DATA/PG_VERSION" ]; then
    run "$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust --encoding=UTF8 --locale=C.UTF-8 >/dev/null
  fi
}

case "${1:-start}" in
  start)
    init
    if ! run "$PGBIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
      run "$PGBIN/pg_ctl" -D "$DATA" -l "$DATA/server.log" -w \
        -o "-h 127.0.0.1 -p $PORT -k /tmp" start >/dev/null
    fi
    echo "PostgreSQL running on 127.0.0.1:$PORT"
    ;;
  stop)
    run "$PGBIN/pg_ctl" -D "$DATA" -w stop >/dev/null 2>&1 || true
    echo "PostgreSQL stopped"
    ;;
  reset)
    "$0" stop
    rm -rf "$DATA"
    "$0" start
    ;;
  status)
    run "$PGBIN/pg_ctl" -D "$DATA" status
    ;;
  url)
    echo "postgres://postgres@127.0.0.1:$PORT/postgres"
    ;;
  *)
    echo "usage: $0 start|stop|reset|status|url" >&2
    exit 1
    ;;
esac
