#!/usr/bin/env bash
# ==============================================================================
# run-mcp.sh — Cross-platform runner for jookoi-md-mcp
#
# Supported environments:
#   - macOS (Darwin): runs natively using local Python
#   - Linux (native or inside WSL): runs natively using local Python
#   - Windows (Git Bash / MSYS / CYGWIN): invokes WSL Ubuntu runner
#
# Usage:
#   ./run-mcp.sh              # Run in foreground
#   ./run-mcp.sh --bg         # Run in background
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BG=false

for arg in "$@"; do
    case "$arg" in
        --bg|-b|--background)
            BG=true
            ;;
    esac
done

OS="$(uname -s 2>/dev/null || echo "Unknown")"

case "$OS" in
    Darwin|Linux)
        # Native Unix: macOS, native Linux, or already inside WSL
        cd "$SCRIPT_DIR/jookoi-md-mcp"
        if [ "$BG" = true ]; then
            echo "Starting jookoi-md-mcp in background (native $OS)..."
            nohup ./run.sh >/dev/null 2>&1 &
            echo "Server started in background."
        else
            echo "Starting jookoi-md-mcp (native $OS)..."
            exec ./run.sh
        fi
        ;;
    MINGW*|MSYS*|CYGWIN*)
        # Windows host running Git Bash / MSYS
        # jookoi-md-mcp requires O_NOFOLLOW/dir_fd, requiring WSL on Windows
        if command -v cygpath >/dev/null 2>&1; then
            WIN_DIR="$(cygpath -w "$SCRIPT_DIR/jookoi-md-mcp")"
        else
            WIN_DIR="$SCRIPT_DIR/jookoi-md-mcp"
        fi
        WSL_PATH="$(wsl.exe -d Ubuntu wslpath -u "$WIN_DIR" 2>/dev/null | tr -d '\r')"

        if [ "$BG" = true ]; then
            echo "Starting jookoi-md-mcp in background via WSL Ubuntu..."
            cmd.exe /c start /b wsl.exe -d Ubuntu bash -c "cd '$WSL_PATH' && ./run.sh" >/dev/null 2>&1
            echo "Server process started in background."
        else
            echo "Starting jookoi-md-mcp via WSL Ubuntu..."
            exec wsl.exe -d Ubuntu bash -c "cd '$WSL_PATH' && ./run.sh"
        fi
        ;;
    *)
        echo "Error: Unsupported operating system: $OS" >&2
        exit 1
        ;;
esac
