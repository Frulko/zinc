#!/bin/sh
# Real LogView and pointer resume; no process, Docker, profile or network.
cd "$(dirname "$0")/../.." || exit 2
out=$(ZINC_HEADLESS=1 ZINC_SIZE=420x280 ZINC_FRAMES=18 "$ZINC" run tests/data/pi-image/builder-log.tsx 2>&1) || { echo "$out"; exit 1; }
echo "$out" | grep -q '^builder log: follow, pause on scroll and pointer resume OK' || { echo "$out"; exit 1; }
