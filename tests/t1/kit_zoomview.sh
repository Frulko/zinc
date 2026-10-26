#!/bin/sh
# The kit's ZoomView (docs/reports/engine-gestures-zoom-refresh.md): a scripted two-finger pinch in picture mode moves the picture taken when the
# pinch started without drawing the content again (one draw during the whole gesture), commits the view once when the fingers lift (zoom 5/3
# around the centroid), and the frame in the middle of the pinch and the final one match the pixel goldens.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
g=$PWD/tests/golden/ui/zoomview
out=$(ZINC_INPUT=$g/script ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 ZINC_SCALE=1 ZINC_SHOT="$tmp/z.png" ZINC_SHOT_FRAMES=16,28 "$ZINC" run "$g" 2>&1 | grep -E "^(draw|view) ")
# the pinch runs from frame 11 (the frame after the second finger lands) to 21 (they lift): one draw in it, for its picture
during=$(echo "$out" | awk '$1 == "draw" && $2 >= 11 && $2 <= 21' | wc -l | tr -d ' ')
[ "$during" = 1 ] || { echo "draws during the pinch: $during, want 1"; echo "$out" | tr '\n' ' '; echo; fail=1; }
echo "$out" | grep -qx "view 167 -107 -107" || { echo "the committed view is not 5/3 around (160, 160): $(echo "$out" | grep view)"; fail=1; }
echo "$out" | grep -qx "draw 29" || { echo "the content is not drawn again after the pinch"; fail=1; }
for f in 16 28; do
  if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/z-$f.png" "$g/z-$f.png"; continue; fi
  tools/pngdiff "$tmp/z-$f.png" "$g/z-$f.png" >/dev/null || { echo "frame $f differs from $g/z-$f.png"; fail=1; }
done
[ $fail -eq 0 ] && echo "kit zoomview: ok"
exit $fail
