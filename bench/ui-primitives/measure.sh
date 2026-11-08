#!/bin/sh
# bench/ui-primitives/measure.sh [zinc] (ZN-774.18, criterion 3): what a zinc:ui program pays for the class parser. styleonly gives every
# look as a style object, styleonly+cls is the same program with one className (p-0: no pixel moves), which brings the class parser back,
# prims-rn is the React Native model, lesson 12 uses classes. Prints ZBC instructions, functions, ZBC and AOT C++ bytes (deterministic);
# with TIMES=1 also the interpreter start with its whole compile (ZINC_DETERMINISTIC: no run cache) and a cold `zinc build` (a fresh
# ZINC_HOME: no cached objects), seconds, best of 5, valid only on a quiet machine (uptime under 4). The numbers go in docs/reports/zinc-next-perf.md.
cd "$(dirname "$0")/../.." || exit 1
Z=${1:-build/zinc}; out=$(mktemp -d); trap 'rm -rf "$out"' EXIT
export ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 ZINC_FRAMES=1
best() { b=; for _ in 1 2 3 4 5; do rm -rf "$out/home"; mkdir "$out/home"; t=$(env ${COLD:+ZINC_HOME=$out/home} /usr/bin/time -p sh -c 'exec "$0" "$@" >/dev/null 2>&1' "$@" 2>&1 | awk '/^real/ {print $2}'); [ -z "$b" ] || [ "$(echo "$t < $b" | bc)" = 1 ] && b=$t; done; echo "$b"; }
mkdir -p "$out/styleonly+cls/src"
cp bench/ui-primitives/styleonly/zinc.json "$out/styleonly+cls/"
sed 's|<Text style={{ fontSize: 20|<Text className="p-0" style={{ fontSize: 20|' bench/ui-primitives/styleonly/src/main.tsx > "$out/styleonly+cls/src/main.tsx"
printf '%-14s %8s %6s %9s %9s %s\n' program instrs funcs zbc-bytes cpp-bytes "${TIMES:+start-s build-s exe-bytes}"
for d in bench/ui-primitives/styleonly "$out/styleonly+cls" bench/ui-primitives/prims-rn docs/learn/samples/12-a-small-app; do
  p=$d/src/main.tsx; n=$(basename "$d" | cut -c1-14)
  "$Z" --emit=zbc "$p" > "$out/z.txt" 2>&1; "$Z" --emit=zbc-bin "$p" "$out/z.bin" >/dev/null 2>&1; "$Z" --emit=cpp "$p" > "$out/z.cpp" 2>/dev/null
  t=; [ -n "$TIMES" ] && t="$(best "$Z" run "$d") $(COLD=1 best "$Z" build "$d" -o "$out/app") $(wc -c < "$out/app" | tr -d ' ')"
  printf '%-14s %8s %6s %9s %9s %s\n' "$n" "$(grep -cE '^ +[0-9]+  [A-Z]' "$out/z.txt")" "$(grep -c '^func @' "$out/z.txt")" \
    "$(wc -c < "$out/z.bin" | tr -d ' ')" "$(wc -c < "$out/z.cpp" | tr -d ' ')" "$t"
done
