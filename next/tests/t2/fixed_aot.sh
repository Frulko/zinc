#!/bin/sh
# Fixed point in AOT programs (ZN-121.03): the fx12 conformance programs built with `zinc build --profile ps1` print the .fx12.out goldens like the interpreter, and an fx16 program
# (tests/golden/fixed/fx16.ts) prints its frozen output in both tiers. Programs that need a plugin, the network or a gradual `any` under a strict build are not in the list.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home}
fail=0
for n in tour clock async array_search conversions features generic_static regressions regressions2 dyn dyn_literals hardening canvas2d scene3d ink lottie errors path pinball_physics shapes signals clock_frames literal_member_arrays; do
  [ -f ../tests/conformance/$n.fx12.out ] || continue
  "$ZINC" build --profile ps1 ../tests/conformance/$n.ts -o "$tmp/p" >"$tmp/build.log" 2>&1 || { echo "$n: the AOT build fails: $(grep -v "^'" "$tmp/build.log" | head -c 200)"; fail=1; continue; }
  out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 timeout 60 "$tmp/p" 2>"$tmp/err"); code=$?
  { [ -n "$out" ] && printf '%s\n' "$out"; if [ $code -ne 0 ]; then printf '[exit %s] %s\n' "$code" "$(cat "$tmp/err")"; else cat "$tmp/err"; fi; } | diff -q - ../tests/conformance/$n.fx12.out >/dev/null || { echo "$n: the AOT program does not print $n.fx12.out"; fail=1; }
done
"$ZINC" build tests/golden/fixed/fx16.ts -o "$tmp/q" >/dev/null 2>&1 && "$tmp/q" | diff -q - tests/golden/fixed/fx16.out >/dev/null || { echo "fx16: the AOT program differs from its golden"; fail=1; }
"$ZINC" run tests/golden/fixed/fx16.ts | diff -q - tests/golden/fixed/fx16.out >/dev/null || { echo "fx16: the interpreter differs from its golden"; fail=1; }
exit $fail
