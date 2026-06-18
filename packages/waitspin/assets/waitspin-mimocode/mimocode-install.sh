#!/usr/bin/env bash
# WaitSpin MiMo Code install script.
# Delegates to the canonical waitspin CLI implementation.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: mimocode-install.sh [waitspin mimocode install options]

This asset intentionally does not duplicate install, registration, or JSON
logic. Use the package CLI as the single source of truth:

  waitspin mimocode install --api-key KEY

For trusted development only, set WAITSPIN_DEV=1 and WAITSPIN_CLI_JS to a
local dist/cli.js path.
EOF
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if [ -n "${WAITSPIN_CLI_JS:-}" ]; then
  if [ "${WAITSPIN_DEV:-}" != "1" ]; then
    echo "WAITSPIN_CLI_JS requires WAITSPIN_DEV=1." >&2
    exit 126
  fi
  exec node "$WAITSPIN_CLI_JS" mimocode install "$@"
fi

if command -v waitspin >/dev/null 2>&1; then
  exec waitspin mimocode install "$@"
fi

cat >&2 <<'EOF'
waitspin CLI was not found.

Install the package or run from a built checkout, then retry:
  npm --workspace packages/waitspin run build
  node packages/waitspin/dist/cli.js mimocode install --api-key KEY
EOF
exit 127
