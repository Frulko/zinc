#!/bin/sh
# zinc:video (ZN-109): with FFmpeg's libraries present the plugin decodes for real (VideoToolbox on macOS, V4L2 M2M or software elsewhere); otherwise the player is the fake of video.next.ts and the
# test says so. The first frame of a clip equals the prototype's build (tests/golden/host/video_first.png, captured with it), two clips play as a playlist without a gap, and the bounce,
# looper and quad examples run.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home}
M=$PWD/../examples/video/bounce/media/fractal.mp4
A=$PWD/../examples/video/looper/media/02-bars.mp4
B=$PWD/../examples/video/looper/media/03-life.mp4
if command -v pkg-config >/dev/null && pkg-config --exists libavformat libavcodec libavutil libswscale && command -v c++ >/dev/null; then
  real=1
  out=$(env -u ZINC_DETERMINISTIC ZINC_NATIVE=real VIDEO_FILE=$M VIDEO_SHOT="$tmp/first.png" ZINC_SCALE=1 ZINC_SIZE=320x240 ZINC_HEADLESS=1 ZINC_FRAMES=3000000 timeout 120 "$ZINC" run tests/golden/host/video_first.ts 2>&1)
  echo "$out" | grep -q "^decoder " || { echo "no real decode: $(echo "$out" | head -c 300)"; fail=1; }
  tools/pngdiff "$tmp/first.png" tests/golden/host/video_first.png >/dev/null || { echo "the first frame differs from the prototype's"; fail=1; }
  out=$(env -u ZINC_DETERMINISTIC ZINC_NATIVE=real VIDEO_A=$A VIDEO_B=$B ZINC_HEADLESS=1 ZINC_FRAMES=3000000 timeout 200 "$ZINC" run tests/golden/host/video_playlist.ts 2>&1)
  echo "$out" | grep -q "index sequence 0,1,0 blank frames 0 playing true" || { echo "the playlist is not gapless: $(echo "$out" | head -c 300)"; fail=1; }
else
  real=0
  echo "note: no FFmpeg libraries or no compiler: the examples run on the fake player (video.next.ts)" >&2
fi
for e in bounce looper quad; do
  if [ $real = 1 ]; then env -u ZINC_DETERMINISTIC ZINC_NATIVE=real ZINC_HEADLESS=1 ZINC_FRAMES=600 timeout 120 "$ZINC" run "../examples/video/$e" >"$tmp/o.txt" 2>&1; rc=$?
  else ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 timeout 120 "$ZINC" run "../examples/video/$e" >"$tmp/o.txt" 2>&1; rc=$?; fi
  [ $rc -eq 0 ] || { echo "examples/video/$e: exit $rc: $(head -c 200 "$tmp/o.txt")"; fail=1; }
done
exit $fail
