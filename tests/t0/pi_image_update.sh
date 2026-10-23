#!/bin/sh
# The Pi updater's trust and transaction boundaries, with local signed packages; no Docker or device.
cd "$(dirname "$0")/../.." || exit 2
python3 -B tests/data/pi-image/test_updates.py
