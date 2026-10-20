#!/bin/sh
# Scroll physics per platform (docs/ui.md, "Scrolling"): one script of fingers (a pull past the top, a fling up, a fling down that reaches the
# top) on a list, under ZINC_PLATFORM=ios and android; the offset and the stretch of every frame equal tests/golden/scroll-platform/<platform>.txt
# (iOS: rubber band and 0.998/ms deceleration; Android: OverScroller's spline fling, the stretch overscroll and its absorbed fling), and Android
# before 12 (ZINC_PLATFORM_VERSION=29) draws the glow instead of the stretch. SCROLL_BLESS=1 rewrites the numbers.
cd "$(dirname "$0")/../golden/scroll-platform" || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
for p in ios android; do
  env ZINC_PLATFORM=$p ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=240x320 ZINC_FRAMES=260 ZINC_INPUT=fling.input "$ZINC" run main.tsx 2>/dev/null > "$tmp/$p.txt"
  [ -n "$SCROLL_BLESS" ] && cp "$tmp/$p.txt" "$p.txt"
  diff "$p.txt" "$tmp/$p.txt" > "$tmp/d" || { echo "scroll_platform: $p's trajectory differs:"; head -10 "$tmp/d"; fail=1; }
done
# the Android trajectory is not iOS's: no rubber band (the offset never goes below 0), a stretch instead
awk '$2 < 0 { bad = 1 } END { exit bad }' android.txt || { echo "scroll_platform: android rubber-banded"; fail=1; }
awk '$3 > 0 { s = 1 } END { exit !s }' android.txt || { echo "scroll_platform: android showed no stretch"; fail=1; }
# the glow (Android 11 and before) is drawn, the stretch is not: the frame differs from the stretched one
a=$(env ZINC_PLATFORM=android ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=240x320 ZINC_FRAMES=12 ZINC_FRAMEHASH=last ZINC_INPUT=fling.input "$ZINC" run main.tsx 2>&1 >/dev/null | grep framehash)
g=$(env ZINC_PLATFORM=android ZINC_PLATFORM_VERSION=29 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=240x320 ZINC_FRAMES=12 ZINC_FRAMEHASH=last ZINC_INPUT=fling.input "$ZINC" run main.tsx 2>&1 >/dev/null | grep framehash)
[ -n "$a" ] && [ "$a" != "$g" ] || { echo "scroll_platform: the glow frame equals the stretch frame ($a)"; fail=1; }
[ $fail -eq 0 ] && echo "scroll platform: ok"
exit $fail
