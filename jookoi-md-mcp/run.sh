#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if [ -f "mcp.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source mcp.env
    set +a
elif [ -f "mcp.env.example" ]; then
    echo "Notice: mcp.env not found, using mcp.env.example defaults" >&2
    set -a
    source mcp.env.example
    set +a
fi

# 1. Prefer existing local virtualenv executable if built
if [ -x ".venv/bin/jookoi-md-mcp" ]; then
    exec ".venv/bin/jookoi-md-mcp" "$@"
fi

# 2. Use the local environment's Python if the console script is unavailable
if [ -x ".venv/bin/python" ]; then
    exec ".venv/bin/python" -m jookoi_md_mcp.server "$@"
fi

if command -v python3 >/dev/null 2>&1; then
    exec python3 -m jookoi_md_mcp.server "$@"
fi

echo "Error: Could not find .venv/bin/jookoi-md-mcp or python3" >&2
exit 1
