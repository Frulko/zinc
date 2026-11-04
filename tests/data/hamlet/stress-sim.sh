#!/bin/sh
# Headless generation and simulation at scale (tests/data/hamlet/stress.ts): tests/data/hamlet/stress-sim.sh <--native|--interp> [HAMLET_* knobs in the environment]
cd "$(dirname "$0")/../../.."
Z=${ZINC:-build/zinc}
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1
echo "== sim $1 size ${HAMLET_SIZE:-256} load $(uptime | sed 's/.*averages: //')"
/usr/bin/time -l "$Z" run $1 tests/data/hamlet/stress.ts 2>&1 | grep -E 'stress|rror|maximum resident'
