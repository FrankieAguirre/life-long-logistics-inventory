#!/usr/bin/env bash
set -euo pipefail

SOCK="/tmp/mysql-lll.sock"

if mysqladmin -uroot -S "${SOCK}" ping --silent 2>/dev/null; then
  echo "Stopping MySQL (${SOCK})"
  mysqladmin -uroot -S "${SOCK}" shutdown || true
else
  echo "MySQL not running (${SOCK})."
fi
