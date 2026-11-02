#!/bin/sh
# zinc profile: closures carry the name of where they are (`outer/inner`, `Class.method/<anonymous>`) and the report opens with the wall-clock / CPU split.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
ZINC_HEADLESS=1 ZN_NO_OPT=1 "$ZINC" profile tests/data/profile_names/main.ts --folded "$t/f" --speedscope "$t/s.json" > "$t/out" 2>/dev/null || { echo "profile_names: zinc profile failed"; exit 1; }
grep -q '^zinc profile: wall [0-9]* ms, CPU [0-9]* ms' "$t/out" || { echo "profile_names: no wall/CPU line: $(head -3 "$t/out")"; exit 1; }
grep -q 'outer/inner' "$t/s.json" || { echo "profile_names: no outer/inner frame"; exit 1; }
grep -q 'Mixer.run/<anonymous>' "$t/s.json" || { echo "profile_names: no Mixer.run/<anonymous> frame"; exit 1; }
[ -s "$t/f" ] || { echo "profile_names: no folded stacks"; exit 1; }
echo "profile_names: ok"
