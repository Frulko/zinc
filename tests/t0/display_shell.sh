#!/bin/sh
# plugins/display-shell against a stand-in Zinc shell (tests/display_shell.py): CONNECT, BUFFERS, pixels, back-pressure, PING, INPUT, resize,
# QUIT, the socket closing and the error with no shell.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || exit 77
exec python3 tests/display_shell.py "$ZINC"
