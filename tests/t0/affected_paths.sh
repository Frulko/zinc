#!/bin/sh
# A path outside next/ (its rule in tests/affected.json starts with "../") selects the tests of its rule, not the whole tier:
# those rules never matched, so a change in a plugin ran every T0 and T1 test.
cd "$(dirname "$0")/.." || exit 2
out=$(printf 'plugins/devtools/index.ts\n' | python3 affected.py affected.json)
echo "$out" | grep -qx netlog || { echo "plugins/devtools/index.ts does not select netlog: $out"; exit 1; }
n=$(echo "$out" | wc -l | tr -d ' ')
[ "$n" -lt 20 ] || { echo "plugins/devtools/index.ts selects $n tests: the fallback, not its rule"; exit 1; }
