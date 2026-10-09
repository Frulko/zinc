#!/bin/sh
# Verbose output (ZN-368): `zinc build -v` prints every compile phase with its duration, the target, profile and layout, and each plugin's cache decision
# (built, then a cache hit); `ZINC_LOG=ui=debug` prints the layout passes of a zinc:ui program with their durations, and nothing is printed without it;
# `--log-format json` writes one JSON object per line. Skipped (77) without the pinned zig (the plugin part builds native code).
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
[ -n "$ZINC_ZIG" ] || ZINC_ZIG=$(ls -d "${ZINC_HOME:-$HOME/.zinc}"/toolchains/zig-*/zig 2>/dev/null | head -1)
[ -x "$ZINC_ZIG" ] || { echo "verbose_log: no pinned zig downloaded"; exit 77; }
export ZINC_ZIG
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
export ZINC_HOME="$tmp/home" ZINC_NATIVE=real   # the plugin's native code, never its stand-in (the runner sets ZINC_DETERMINISTIC)
mkdir -p "$tmp/p"; printf "import * as device from 'zinc:device';\nconsole.log('touch ' + device.hasTouch());\n" > "$tmp/p/main.ts"
out=$("$Z" build -v "$tmp/p/main.ts" -o "$tmp/p/app" 2>&1 >/dev/null) || { echo "verbose_log: the build failed: $out"; exit 1; }
for phase in "read and parse" "check" "lower to IR" "optimise" "reference counting" "emit ZBC" "AOT C++" "compile and link (C++)"; do
  echo "$out" | grep -q "^zinc\[build\] $phase [0-9.]* ms$" || { echo "verbose_log: zinc build -v does not time '$phase'"; fail=1; }
done
echo "$out" | grep -q "^zinc\[build\] [0-9]* files; target .*, profile .*, layout " || { echo "verbose_log: no target, profile and layout line"; fail=1; }
echo "$out" | grep -q "^zinc\[plugin\] device: built (" || { echo "verbose_log: the first build does not say the plugin was built: $out"; fail=1; }
"$Z" build -v "$tmp/p/main.ts" -o "$tmp/p/app" 2>&1 >/dev/null | grep -q "^zinc\[plugin\] device: cache hit (" || { echo "verbose_log: the second build does not say cache hit"; fail=1; }
[ -z "$("$Z" build "$tmp/p/main.ts" -o "$tmp/p/app" 2>&1)" ] || { echo "verbose_log: zinc build without -v says something"; fail=1; }
quiet=$(ZINC_HEADLESS=1 ZINC_FRAMES=3 "$Z" run ../examples/ui/forms 2>&1)
[ -z "$(echo "$quiet" | grep 'zinc\[')" ] || { echo "verbose_log: a run without ZINC_LOG logs"; fail=1; }
ui=$(ZINC_HEADLESS=1 ZINC_FRAMES=3 ZINC_LOG=ui=debug "$Z" run ../examples/ui/forms 2>&1)
echo "$ui" | grep -q "^zinc\[ui\] layout pass [0-9.]* ms$" || { echo "verbose_log: ZINC_LOG=ui=debug does not show the layout passes: $ui"; fail=1; }
[ "$(echo "$ui" | grep -v '^zinc\[')" = "$quiet" ] || { echo "verbose_log: logging changed the program's output"; fail=1; }
"$Z" run --log-format json -vv ../examples/hello 2>&1 >/dev/null | python3 -c "
import json, sys
lines = [l for l in sys.stdin.read().splitlines() if l.strip()]
assert lines, 'no JSON lines'
for l in lines:
    o = json.loads(l)
    assert {'t', 'module', 'level', 'msg'} <= o.keys(), o
" || { echo "verbose_log: --log-format json is not one JSON object per line"; fail=1; }
exit $fail
