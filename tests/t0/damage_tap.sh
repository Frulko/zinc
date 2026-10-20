#!/bin/sh
# A tap in a scroll view damages what changed, not the screen (ZN-744, docs/reports/zinc-next-first-interaction.md): a finger that lands
# without moving shows no scroll indicator, and the frame diff skips the common tail as well as the head, so a command inserted or removed
# in the middle (the indicator a wheel scroll shows) damages its own box instead of every command it shifts (the container's UNCLIP, whose
# bounds are the screen). rn-showcase, deterministic, scene dumps around a press on the tab bar and around a wheel scroll of the feed.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
printf '90 move 145 815\n100 down\n103 up\n140 move 210 400\n150 wheel 0 -1\n' >"$t/in"
frames="100,101,$(seq -s, 225 241)"
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=241 ZINC_INPUT="$t/in" ZINC_SHOT_FRAMES="$frames" ZINC_SHOT="$t/x.png" \
  ZINC_SCENE_DUMP="$t/s.scn" "$ZINC" run ../examples/rn-showcase >/dev/null 2>&1
fail=0
# the press on the empty gap of the tab bar changes nothing on the screen (it used to show the indicator for 1.2 s: the screen, twice)
press=$("$ZINC" capture --scene "$t/s-100.scn" --damage "$t/s-101.scn") || { echo "damage_tap: press: $press"; fail=1; }
case "$press" in "damage 0 rects"*) ;; *) echo "damage_tap: the press damages: $press"; fail=1 ;; esac
# the wheel scroll's indicator fades out about 1.2 s later (frame ~238): each frame damages the indicator's 5 px column, never the screen,
# including the frame that removes its RECT
seen=0
for i in $(seq 225 240); do
  d=$("$ZINC" capture --scene "$t/s-$i.scn" --damage "$t/s-$((i + 1)).scn") || { echo "damage_tap: frame $i: $d"; fail=1; }
  case "$d" in "damage 0 rects"*) continue ;; esac
  seen=1
  w=$(echo "$d" | sed -n 's/.*box \([0-9-]*\),[0-9-]* \([0-9-]*\),.*/\2 - \1/p')
  [ -n "$w" ] && [ $(($w)) -le 8 ] || { echo "damage_tap: frame $i -> $((i + 1)) damages $d"; fail=1; }
done
[ $seen -eq 1 ] || { echo "damage_tap: the indicator did not fade between frames 225 and 241"; fail=1; }
[ $fail -eq 0 ] && echo "damage_tap: ok"
exit $fail
