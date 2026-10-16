#!/bin/sh
# The navigation stack of zinc:ui/navigation (docs/ui.md, "Navigation stack"), under each platform's behaviour (ZINC_PLATFORM): a push and a pop
# (iOS slide with parallax and dimming, Android shared axis), the iOS edge swipe completed and cancelled by the release velocity, the Android back
# key, Android's predictive back (progress, cancel, commit), and a modal screen (iOS's sheet dragged down, Android's dialog closed by back). Each scenario keeps the hashes of a few frames (start, middle, end of a transition)
# and the stack it ends with, in tests/golden/navigation/expected.txt. NAV_BLESS=1 rewrites it; NAV_SHOTS=dir writes those frames as PNGs to look at.
cd "$(dirname "$0")/../golden/navigation" || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
scenario() {   # name platform script input frames...
  name=$1 plat=$2 script=$3 input=$4; shift 4
  list=$(echo "$@" | tr ' ' ',')
  env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=240x320 ZINC_FRAMES=90 ZINC_FRAMEHASH=all ZINC_PLATFORM=$plat NAV_SCRIPT=$script \
    ZINC_INPUT=$input ${NAV_SHOTS:+ZINC_SHOT_FRAMES=$list ZINC_SHOT=$NAV_SHOTS/$name.png} "$ZINC" run main.tsx > "$tmp/out" 2> "$tmp/err"
  line="$name"
  for f in "$@"; do line="$line $f:$(sed -n "s/^zinc: framehash $f [0-9x]* //p" "$tmp/err" | head -1)"; done
  echo "$line $(grep '^depth' "$tmp/out")"
}
{
  scenario ios-push-pop ios push-pop none.input 4 10 30 44 70
  scenario android-push-pop android push-pop none.input 4 10 30 44 70
  scenario ios-swipe-done ios push swipe-done.input 54 62 90
  scenario ios-swipe-cancel ios push swipe-cancel.input 54 62 90
  scenario android-back android push back.input 52 90
  scenario android-predictive android push predictive.input 54 56 66 72 76 90
  scenario ios-sheet ios present sheet-drag.input 30 56 90
  scenario android-dialog android present back.input 30 90
} > "$tmp/got.txt"
[ -n "$NAV_BLESS" ] && cp "$tmp/got.txt" expected.txt
if diff expected.txt "$tmp/got.txt" > "$tmp/d"; then echo "navigation: ok"; exit 0; fi
echo "navigation: frames differ from tests/golden/navigation/expected.txt (look at them with NAV_SHOTS=dir):"; cat "$tmp/d"; exit 1
