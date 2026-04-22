#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${ROOT_DIR}/mysql-data-lll"
SOCK="/tmp/mysql-lll.sock"
PORT="${MYSQL_PORT:-3307}"

MYSQLD="$(command -v mysqld || true)"
if [[ -z "${MYSQLD}" && -x /opt/homebrew/opt/mysql/bin/mysqld ]]; then
  MYSQLD="/opt/homebrew/opt/mysql/bin/mysqld"
fi

if [[ -z "${MYSQLD}" ]]; then
  echo "mysqld not found. Install MySQL first (example: brew install mysql)." >&2
  exit 1
fi

if mysqladmin -uroot -S "${SOCK}" ping --silent 2>/dev/null; then
  echo "MySQL already running (${SOCK}, port ${PORT})."
  exit 0
fi

if [[ ! -d "${DATA_DIR}/mysql" ]]; then
  echo "Initializing MySQL datadir: ${DATA_DIR}"
  rm -rf "${DATA_DIR}"
  mkdir -p "${DATA_DIR}"
  BASEDIR="$(cd "$(dirname "${MYSQLD}")/.." && pwd)"
  "${MYSQLD}" --initialize-insecure --datadir="${DATA_DIR}" --basedir="${BASEDIR}"
fi

echo "Starting MySQL on 127.0.0.1:${PORT} (socket ${SOCK})"
nohup "${MYSQLD}" \
  --datadir="${DATA_DIR}" \
  --port="${PORT}" \
  --socket="${SOCK}" \
  --bind-address=127.0.0.1 \
  --mysqlx=OFF \
  >"${ROOT_DIR}/mysql-lll.log" 2>&1 &

for _ in {1..80}; do
  if mysqladmin -uroot -S "${SOCK}" ping --silent 2>/dev/null; then
    echo "MySQL is ready."
    exit 0
  fi
  sleep 0.2
done

echo "MySQL failed to start. See: ${ROOT_DIR}/mysql-lll.log" >&2
exit 1
