#!/bin/sh
# Animated's native driver (ZN-364.01), tests/golden/animated-native: values bound with attach() and animated with useNativeDriver: true are played
# by the engine. 1. the program's output (the view shows what the value reads, React Native's error for `width`, a stop and a restart, a series and a
# binding whose node was released and its slot recycled leave the new node alone) equals main.out on the interpreter and QuickJS; 2. with the
# compositor the script paints a few frames, without it every frame of the animation; 3. the frames are the same, bit for bit, with it on and off.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
g=tests/golden/animated-native
fail=0
for e in --interp "--engine quickjs"; do
  LANG=C ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=60 timeout 60 "$ZINC" run $e $g > "$tmp/out" 2>/dev/null
  diff "$tmp/out" $g/main.out > "$tmp/d" || { echo "animated_native ($e): $(head -6 "$tmp/d")"; fail=1; }
done
for c in 0 1; do
  ZINC_COMPOSITOR=$c ZINC_FRAMEHASH=1 ZINC_RENDER_STATS=1 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=60 timeout 60 "$ZINC" run --interp $g >/dev/null 2>"$tmp/err$c"
  grep '^zinc: framehash' "$tmp/err$c" > "$tmp/h$c"
done
[ "$(wc -l < "$tmp/h1" | tr -d ' ')" -ge 60 ] || { echo "animated_native: no frame hashes"; fail=1; }
cmp -s "$tmp/h0" "$tmp/h1" || { echo "animated_native: frames differ with the compositor: $(diff "$tmp/h0" "$tmp/h1" | head -3)"; fail=1; }
p0=$(sed -n 's/^zinc stats: .* painted=\([0-9]*\) .*/\1/p' "$tmp/err0"); p1=$(sed -n 's/^zinc stats: .* painted=\([0-9]*\) .*/\1/p' "$tmp/err1")
[ "${p0:-0}" -ge 35 ] && [ "${p1:-99}" -le 12 ] || { echo "animated_native: frames painted by the script: $p0 without the compositor, $p1 with it"; fail=1; }
[ $fail -eq 0 ] && echo "animated_native: ok"
exit $fail
