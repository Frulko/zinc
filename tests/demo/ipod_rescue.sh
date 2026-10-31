#!/bin/sh
# Recovery policy/protocol, hostile archives, backup boundaries and explicit simulation; no device access.
set -eu
cd "$(dirname "$0")/../.."
python3 tests/data/ipod-rescue/test_rescue.py
