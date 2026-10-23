#!/bin/sh
# Native processes and a fake display exercise the actual Pi session/agent handshake.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || exit 77
python3 tests/agent_screen.py "$ZINC"
