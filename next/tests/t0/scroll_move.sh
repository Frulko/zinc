#!/bin/sh
# Scrolling moves the pixels already drawn (ZN-744, raster::diff_move): rn-showcase flung by a scripted finger, deterministic; for frame pairs of
# the fling and of its settling, `zinc capture --scroll` rasterizes the previous frame, moves its pixels as diff_move says, draws only the
# damage left, and compares with a full raster of the next frame: the same pixels, and while it settles (a few pixels a frame) under a tenth
# of the screen drawn (the rows that came into view, the tab bar over the feed, the scroll indicator).
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
printf '60 touch 1 210 650\n61 touch 1 210 600\n62 touch 1 210 550\n63 touch 1 210 500\n64 touch 1 210 450\n65 touchup 1\n' >"$t/in"
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=96 ZINC_INPUT="$t/in" ZINC_SHOT_FRAMES=61,62,70,71,90,91,95,96 ZINC_SHOT="$t/x.png" \
  ZINC_SCENE_DUMP="$t/s.scn" "$ZINC" run ../examples/rn-showcase >/dev/null 2>&1
fail=0
for p in "61 62" "70 71" "90 91" "95 96"; do
  set -- $p
  out=$("$ZINC" capture --scene "$t/s-$1.scn" ../examples/rn-showcase/src/main.tsx --scroll "$t/s-$2.scn" 2>"$t/err" | tail -1)
  case "$out" in
    "scroll "*" equal") ;;
    *) echo "scroll_move: frames $1 -> $2: $out $(grep 'scroll:' "$t/err")"; fail=1; continue ;;
  esac
  if [ "$1" -ge 90 ]; then   # settling: "scroll DX DY area X,Y X,Y rects N drawn D of T pixels equal"
    f=$1; set -- $out
    [ $((${10} * 10)) -lt "${12}" ] || { echo "scroll_move: frame $f: drew ${10} of ${12} pixels while settling"; fail=1; }
  fi
done
# what a move carries wrongly (AC3): a translucent header fixed over the area, shadows crossing its edges, a rounded clip (tests/data/scroll_header)
printf '40 touch 1 210 500\n41 touch 1 210 460\n42 touch 1 210 420\n43 touch 1 210 380\n44 touch 1 210 340\n45 touchup 1\n' >"$t/in2"
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=76 ZINC_INPUT="$t/in2" ZINC_SHOT_FRAMES=41,42,50,51,70,71,75,76 ZINC_SHOT="$t/h.png" \
  ZINC_SCENE_DUMP="$t/h.scn" "$ZINC" run tests/data/scroll_header >/dev/null 2>&1
moved=0
for p in "41 42" "50 51" "70 71" "75 76"; do
  set -- $p
  out=$("$ZINC" capture --scene "$t/h-$1.scn" tests/data/scroll_header/main.tsx --scroll "$t/h-$2.scn" 2>"$t/err" | tail -1)
  case "$out" in
    "scroll "*" equal") moved=$((moved + 1)) ;;
    *) echo "scroll_move: header, frames $1 -> $2: $out $(grep 'scroll:' "$t/err")"; fail=1; continue ;;
  esac
  f=$1; set -- $out   # under a quarter of the area drawn: the strip, the header at both places, the corner bands (was the whole area)
  [ $((${10} * 4)) -lt "${12}" ] || { echo "scroll_move: header, frame $f: drew ${10} of ${12} pixels"; fail=1; }
done
[ $moved -eq 4 ] || { echo "scroll_move: header: $moved of 4 frame pairs moved"; fail=1; }
[ $fail -eq 0 ] && echo "scroll_move: ok"
exit $fail
