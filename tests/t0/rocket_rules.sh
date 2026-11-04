#!/bin/sh
# Objectif Lune (Pixel Plays): the countdown, the sync window, misses and scrub, ignition and lift-off, the record.
set -eu
cd "$(dirname "$0")/../.."
ZINC_HEADLESS=1 timeout 60 "$ZINC" run tests/data/pixel-plays/rocket-rules.ts 2>&1 | grep -q 'rocket-rules: PASS'
echo 'rocket_rules: countdown, window, misses, scrub, lift-off, record PASS'
