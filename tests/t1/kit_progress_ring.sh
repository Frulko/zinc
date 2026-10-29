#!/bin/sh
# The kit's ProgressRing: rings at 0, 25, 60 and 100 % drawn as the golden frame, and a ring whose value changes (10 % then 80 %) repaints although
# it is a lazy canvas and nothing else on the page changed.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
g=$PWD/tests/golden/ui/progress-ring
fail=0
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 ZINC_SCALE=1 ZINC_SHOT="$tmp/r.png" ZINC_SHOT_FRAMES=5,28 "$ZINC" run "$g" > "$tmp/out" 2>&1 \
  || { echo "kit progress ring: the fixture failed: $(tail -3 "$tmp/out")"; exit 1; }
for f in 5 28; do
  if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/r-$f.png" "$g/r-$f.png"; continue; fi
  tools/pngdiff "$tmp/r-$f.png" "$g/r-$f.png" >/dev/null || { echo "frame $f differs from $g/r-$f.png"; fail=1; }
done
cmp -s "$tmp/r-5.png" "$tmp/r-28.png" && { echo "kit progress ring: the ring did not repaint its new value"; fail=1; }
# QuickJS draws the same last frame
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 ZINC_SCALE=1 ZINC_SHOT="$tmp/q.png" ZINC_SHOT_FRAMES=28 "$ZINC" run "$g" --engine quickjs > "$tmp/q.out" 2>&1
tools/pngdiff "$tmp/q-28.png" "$g/r-28.png" >/dev/null 2>&1 || { echo "kit progress ring: QuickJS's frame 28 differs: $(tail -2 "$tmp/q.out")"; fail=1; }
[ $fail -eq 0 ] && echo "kit progress ring: ok"
exit $fail
