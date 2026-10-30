#!/bin/sh
# zinc agent under a live shell.sock: ZINC_DISPLAY=shell and no file lease; a GL app keeps the lease.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || exit 77
python3 tests/agent_shell.py "$ZINC"
