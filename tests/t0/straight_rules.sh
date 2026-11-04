#!/bin/sh
# Droit devant (Pixel Plays): the endings, the secret path and the walls of the Just go straight port.
set -eu
cd "$(dirname "$0")/../.."
ZINC_HEADLESS=1 timeout 60 "$ZINC" run tests/data/pixel-plays/straight-rules.ts 2>&1 | grep -q 'straight-rules: PASS'
echo 'straight_rules: endings, secret path, walls and gaps PASS'
