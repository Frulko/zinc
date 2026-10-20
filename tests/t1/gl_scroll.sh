#!/bin/sh
# A scroll on the GPU (ZN-744): the GL window keeps the frame in a texture, a scroll turns the rows of the scrolled area there (or moves its
# pixels) and replays only the rectangles left. ZINC_GL_VERIFY=1 replays every moved frame whole as well and counts the pixels that differ:
# rn-showcase's Components screen and tests/data/scroll_header (a translucent header fixed over the area, shadows across its edges, rounded
# clips) flung by a scripted finger. A pixel or two may differ in a frame where a vector icon's antialiased edge lands on a tie (the GPU
# interpolates at the new place, not bit for bit the same); more is a missed damage. A window of the host's GPU; skipped without one.
cd "$(dirname "$0")/../.." || exit 2
[ -z "$ZINC_CI" ] || { echo "skipped: needs a real GPU"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home}
fail=0
printf '30 touch 1 126 835\n33 touchup 1\n60 touch 1 210 650\n61 touch 1 210 600\n62 touch 1 210 550\n63 touch 1 210 500\n64 touch 1 210 450\n65 touchup 1\n100 touch 1 210 300\n101 touch 1 210 400\n102 touch 1 210 500\n103 touch 1 210 600\n104 touchup 1\n' >"$tmp/a"
printf '30 touch 1 210 500\n31 touch 1 210 460\n32 touch 1 210 420\n33 touch 1 210 380\n34 touch 1 210 340\n35 touchup 1\n90 touch 1 210 200\n91 touch 1 210 300\n92 touch 1 210 400\n93 touchup 1\n' >"$tmp/b"
for e in examples/rn-showcase:a tests/data/scroll_header:b; do
  p=${e%%:*}; in=${e#*:}
  env -u ZINC_HEADLESS -u ZINC_DETERMINISTIC ZINC_BACKGROUND=1 ZINC_RENDERER=gl ZINC_GL_MOVE=1 ZINC_GL_STATS=1 ZINC_GL_VERIFY=1 ZINC_FRAMES=160 ZINC_INPUT="$tmp/$in" \
    timeout 90 "$ZINC" run "$p" >"$tmp/log" 2>&1
  grep -q "window renderer gl (" "$tmp/log" || { echo "skipped: no GL window here"; exit 77; }
  moves=$(grep -o "[0-9]* scrolls moved on the GPU" "$tmp/log" | cut -d' ' -f1)
  [ "${moves:-0}" -ge 10 ] || { echo "gl_scroll: $p: ${moves:-0} scrolls moved on the GPU"; fail=1; continue; }
  worst=$(grep -o "this one ([-0-9]*, [-0-9]*): [0-9]* pixels" "$tmp/log" | sed 's/.*: \([0-9]*\) pixels/\1/' | sort -n | tail -1)
  [ "${worst:-0}" -le 4 ] || { echo "gl_scroll: $p: a moved frame differs from a whole replay in $worst pixels: $(grep 'gl verify' "$tmp/log" | head -3)"; fail=1; }
done
[ $fail -eq 0 ] && echo "gl_scroll: ok"
exit $fail
