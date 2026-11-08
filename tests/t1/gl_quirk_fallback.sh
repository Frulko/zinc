#!/bin/sh
# A GL quirk that turns the GPU replay off (ZN-183, runtime/gl_caps.h): ZINC_GL_QUIRK=no-replay makes display-gl and the SDL window draw with
# the software raster and say so in one line, and the frame is the software one. A name that is no quirk is reported. Opens windows:
# skipped where there is none.
cd "$(dirname "$0")/../.." || exit 2
[ -z "$ZINC_CI" ] || { echo "skipped: needs a real GPU"; exit 77; }
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home} ZINC_BACKGROUND=1 ZINC_AUDIO=null ZINC_FRAMES=10
p=tests/visual/clock.ts
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SHOT="$tmp/sw.png" timeout 60 "$ZINC" run $p >/dev/null 2>&1
# display-gl
ZINC_GL_QUIRK=no-replay ZINC_DETERMINISTIC=1 ZINC_RENDERER=gl ZINC_DISPLAY=gl ZINC_SHOT="$tmp/q.bmp" timeout 120 "$ZINC" run $p >"$tmp/d.log" 2>&1
[ -s "$tmp/q.bmp" ] || { echo "skipped: no GL window here ($(head -c 200 "$tmp/d.log"))"; exit 77; }
n=$(grep -c "no-replay" "$tmp/d.log")
[ "$n" = 1 ] && grep -q "display-gl: renderer gl: the quirk no-replay (ZINC_GL_QUIRK) on .*, using cpu" "$tmp/d.log" || { echo "display-gl: wanted one line naming the quirk, got $n: $(grep -i 'quirk\|renderer' "$tmp/d.log" | tr '\n' ' ')"; exit 1; }
out=$(python3 tools/glcompare "$tmp/q.bmp" "$tmp/sw.png") || { echo "display-gl: $out"; exit 1; }
python3 - "$out" <<'PY' || exit 1
import re, sys
m = re.search(r"over \d+: ([\d.]+)%, mae ([\d.]+)", sys.argv[1])
if not m or float(m.group(1)) > 0.5 or float(m.group(2)) > 1: print("display-gl: the frame without the replay is not the software one: " + sys.argv[1]); sys.exit(1)
PY
# the SDL window (macOS: ZINC_RENDERER=gl), and a name that is no quirk
ZINC_GL_QUIRK=no-replay,nope ZINC_RENDERER=gl timeout 120 "$ZINC" run $p >"$tmp/w.log" 2>&1 || { echo "window: the run failed: $(tail -3 "$tmp/w.log")"; exit 1; }
if [ "$(uname)" = Darwin ]; then
  [ "$(grep -c 'no-replay' "$tmp/w.log")" = 1 ] && grep -q "window renderer gl: the quirk no-replay (ZINC_GL_QUIRK) on .*, drawing with the software raster" "$tmp/w.log" || { echo "window: wanted one line naming the quirk: $(grep -i 'quirk\|renderer' "$tmp/w.log" | tr '\n' ' ')"; exit 1; }
  grep -q "ZINC_GL_QUIRK: no quirk named 'nope'" "$tmp/w.log" || { echo "window: the unknown quirk was not reported"; exit 1; }
fi
echo "gl_quirk_fallback: ok (one line each, software frame: $out)"
