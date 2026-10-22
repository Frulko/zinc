#!/bin/sh
# bench/ui-primitives/measure.sh [zinc] (ZN-774.18, criterion 3): what a zinc:ui program pays for the class parser. styleonly gives every
# look as a style object, prims-rn is the React Native model, lesson 12 uses classes. Prints ZBC instructions, functions, ZBC and AOT C++
# bytes (deterministic); with TIMES=1 also the interpreter start with its first compile and `zinc build` seconds, best of 5, valid only
# on a quiet machine (uptime under 4). The numbers go in docs/reports/zinc-next-perf.md.
cd "$(dirname "$0")/../.." || exit 1
Z=${1:-build/zinc}; out=$(mktemp -d); trap 'rm -rf "$out"' EXIT
export ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 ZINC_FRAMES=1
best() { b=; for _ in 1 2 3 4 5; do t=$( { /usr/bin/time -p "$@" >/dev/null 2>&1; } 2>&1 | awk '/^real/ {print $2}'); [ -z "$b" ] || [ "$(echo "$t < $b" | bc)" = 1 ] && b=$t; done; echo "$b"; }
printf '%-10s %8s %6s %9s %9s %s\n' program instrs funcs zbc-bytes cpp-bytes "${TIMES:+start-s build-s}"
for d in bench/ui-primitives/styleonly bench/ui-primitives/prims-rn docs/learn/samples/12-a-small-app; do
  p=$d/src/main.tsx; n=$(basename "$d" | cut -c1-10)
  "$Z" --emit=zbc "$p" > "$out/z.txt" 2>&1; "$Z" --emit=zbc-bin "$p" "$out/z.bin" >/dev/null 2>&1; "$Z" --emit=cpp "$p" > "$out/z.cpp" 2>/dev/null
  t=; [ -n "$TIMES" ] && t="$(best "$Z" run "$d") $(best "$Z" build "$d" -o "$out/app")"
  printf '%-10s %8s %6s %9s %9s %s\n' "$n" "$(grep -cE '^ +[0-9]+  [A-Z]' "$out/z.txt")" "$(grep -c '^func @' "$out/z.txt")" \
    "$(wc -c < "$out/z.bin" | tr -d ' ')" "$(wc -c < "$out/z.cpp" | tr -d ' ')" "$t"
done
