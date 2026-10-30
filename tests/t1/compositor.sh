#!/bin/sh
# The compositor (D182 step 6, runtime/gfx.cpp): tests/golden/compositor turns a bar forever and a card once (with a delay) through
# animate('rotate'). Deterministic and headless, the compositor composes each frame at the script's clock, so:
# 1. the frame hashes, the hit tests on the turned bar and the frame the card's animation ends on equal those of ZINC_COMPOSITOR=0 (the
#    script tweens and repaints every frame), frame by frame, and the frames do move;
# 2. with the compositor the script draws only when something else changes (ZINC_RENDER_STATS painted=), without it every frame;
# 3. QuickJS and the AOT give the same hashes with the compositor on and off over 20 frames.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"
app=tests/golden/compositor
fail=0
for c in 0 1; do
  ZINC_COMPOSITOR=$c ZINC_FRAMEHASH=1 ZINC_RENDER_STATS=1 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=60 timeout 120 "$ZINC" run --interp "$app" \
    >"$tmp/out$c" 2>"$tmp/err$c" || { echo "compositor=$c: exit $?: $(tail -3 "$tmp/err$c")"; fail=1; }
  grep '^zinc: framehash' "$tmp/err$c" > "$tmp/h$c"
done
n=$(wc -l < "$tmp/h1" | tr -d ' ')
[ "$n" -ge 60 ] || { echo "compositor: $n frame hashes"; fail=1; }
cmp -s "$tmp/h0" "$tmp/h1" || { echo "compositor: frame hashes differ from the script's tweens"; diff "$tmp/h0" "$tmp/h1" | head -4; fail=1; }
moved=$(awk '{print $5}' "$tmp/h1" | sort -u | wc -l | tr -d ' ')
[ "$moved" -ge 30 ] || { echo "compositor: only $moved different frames: nothing turns"; fail=1; }
cmp -s "$tmp/out0" "$tmp/out1" || { echo "compositor: the program's output differs:"; diff "$tmp/out0" "$tmp/out1" | head -6; fail=1; }
grep -q ': bar$' "$tmp/out1" || { echo "compositor: no hit on the turned bar: $(head -3 "$tmp/out1")"; fail=1; }
grep -q '^card done at frame' "$tmp/out1" || { echo "compositor: the card's animation never ended"; fail=1; }
p0=$(sed -n 's/^zinc stats: .* painted=\([0-9]*\) .*/\1/p' "$tmp/err0"); p1=$(sed -n 's/^zinc stats: .* painted=\([0-9]*\) .*/\1/p' "$tmp/err1")
[ "${p0:-0}" -ge 55 ] && [ "${p1:-99}" -le 10 ] || { echo "compositor: frames painted by the script: $p0 without the compositor, $p1 with it"; fail=1; }
for e in "--engine quickjs" ""; do
  for c in 0 1; do
    ZINC_COMPOSITOR=$c ZINC_FRAMEHASH=1 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=20 timeout 300 "$ZINC" run "$app" $e 2>&1 >/dev/null |
      grep '^zinc: framehash' > "$tmp/e$c"
  done
  [ "$(wc -l < "$tmp/e1" | tr -d ' ')" -ge 20 ] || { echo "compositor (${e:-aot}): no frames"; fail=1; }
  cmp -s "$tmp/e0" "$tmp/e1" || { echo "compositor (${e:-aot}): frame hashes differ with the compositor"; diff "$tmp/e0" "$tmp/e1" | head -4; fail=1; }
done
[ $fail -eq 0 ] && echo "compositor: ok"
exit $fail
