#!/bin/sh
# Arrêt au stand (Pixel Plays): braking, the wheel-change timeline, the green light, false starts and the record.
set -eu
cd "$(dirname "$0")/../.."
ZINC_HEADLESS=1 timeout 60 "$ZINC" run tests/data/pixel-plays/pitstop-rules.ts 2>&1 | grep -q 'pitstop-rules: PASS'
echo 'pitstop_rules: overshoot, clean stop, four wheels, green light, false start PASS'
