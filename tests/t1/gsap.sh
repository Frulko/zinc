#!/bin/sh
# plugins/gsap: GSAP's core API in Zinc (import gsap from 'gsap') on a fixed clock. The program prints values that are functions of the ticks:
# the interpreter and a zinc build (AOT) program must print the golden output, byte for byte.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
src=plugins/gsap/tests/gsap_core.ts
"$ZINC" run "$src" 2> "$tmp/err" | diff - tests/golden/gsap/gsap_core.out > "$tmp/d1" || { echo "gsap: the interpreter differs from tests/golden/gsap/gsap_core.out:"; head -10 "$tmp/d1"; fail=1; }
"$ZINC" build "$src" -o "$tmp/app" > "$tmp/build.log" 2>&1 || { echo "gsap: zinc build failed: $(tail -c 300 "$tmp/build.log")"; exit 1; }
"$tmp/app" | diff - tests/golden/gsap/gsap_core.out > "$tmp/d2" || { echo "gsap: the AOT program differs from the golden output:"; head -10 "$tmp/d2"; fail=1; }
exit $fail
