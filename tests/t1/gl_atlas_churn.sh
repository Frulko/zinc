#!/bin/sh
# The GL replay's glyph atlas under churn (ZN-182): tests/data/gl_atlas_churn draws 200 characters at four sizes a frame, the sizes moving
# each frame, on 128 px pages (ZINC_GL_ATLAS) so the atlas grows to its four pages and evicts some in the middle of a frame. The run must
# end, report its pages and evictions (ZINC_GL_STATS), and its last frame be the one drawn with the default 1024 px page, where nothing is
# evicted (the software frame differs by its text, made at the window's scale on the GPU: gl_renderer.sh compares those).
# Opens a window (display-gl's replay): skipped where there is none.
cd "$(dirname "$0")/../.." || exit 2
[ -z "$ZINC_CI" ] || { echo "skipped: needs a real GPU"; exit 77; }
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home} ZINC_BACKGROUND=1 ZINC_AUDIO=null ZINC_DETERMINISTIC=1 ZINC_FRAMES=12 ZINC_SIZE=900x700
p=tests/data/gl_atlas_churn/main.ts
ZINC_RENDERER=gl ZINC_DISPLAY=gl ZINC_SHOT="$tmp/ref.bmp" timeout 120 "$ZINC" run $p >/dev/null 2>&1
ZINC_GL_ATLAS=128 ZINC_GL_STATS=1 ZINC_RENDERER=gl ZINC_DISPLAY=gl ZINC_SHOT="$tmp/gl.bmp" timeout 120 "$ZINC" run $p >"$tmp/gl.log" 2>&1
code=$?
[ -s "$tmp/gl.bmp" ] && [ -s "$tmp/ref.bmp" ] || { grep -q "renderer gl:" "$tmp/gl.log" && { echo "gl_atlas_churn: no frame (exit $code)"; exit 1; }; echo "skipped: no GL window here ($(head -c 200 "$tmp/gl.log"))"; exit 77; }
[ $code -eq 0 ] || { echo "gl_atlas_churn: exit $code: $(tail -3 "$tmp/gl.log")"; exit 1; }
line=$(grep "glyph atlas:" "$tmp/gl.log")
out=$(python3 tools/glcompare "$tmp/gl.bmp" "$tmp/ref.bmp") || { echo "gl_atlas_churn: $out"; exit 1; }
python3 - "$line" "$out" <<'PY'
import re, sys
line, out = sys.argv[1], sys.argv[2]
m = re.search(r"(\d+) of 4 pages of 128 px, (\d+) glyphs, ([\d.]+)% of their rows in use, (\d+) pages evicted", line)
if not m: print("gl_atlas_churn: no atlas line: " + line); sys.exit(1)
pages, glyphs, occ, ev = int(m.group(1)), int(m.group(2)), float(m.group(3)), int(m.group(4))
if pages != 4 or ev < 1: print("gl_atlas_churn: wanted 4 pages and evictions: " + line); sys.exit(1)
c = re.search(r"over \d+: ([\d.]+)%, mae ([\d.]+)", out)
if not c or float(c.group(1)) > 0 or float(c.group(2)) > 0.1: print("gl_atlas_churn: the frame drawn with evictions differs from the one without: " + out); sys.exit(1)
print("gl_atlas_churn: ok (%d pages, %d glyphs, %.0f%% in use, %d evicted; %s)" % (pages, glyphs, occ, ev, out))
PY
