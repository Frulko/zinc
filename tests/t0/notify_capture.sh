#!/bin/sh
# The CI-stall boundary: multiple SQLite batches and binary plists, no tray/network/live notification database.
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] || exit 77
python3 -B tests/data/notify-relay/capture_poll.py "$ZINC"
