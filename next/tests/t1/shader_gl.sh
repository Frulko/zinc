#!/bin/sh
# zinc:gfx runtime shaders (ZN-746): tests/data/shader/main.ts, three metaballs, as a SHADER command drawn by the GL replay (display-gl with
# ZINC_RENDERER=gl: from the second frame, once the display said it draws shaders) and as the program's CPU path on the software raster (the
# same field at a quarter of the resolution, ImageFlag.Smooth): the same picture within glcompare's tolerance, no pixel more than 24 away
# and a mean error under 1 (measured 0%, 0.30, max 13). The first GL frame is the CPU path: it must differ from the third (the shader drew).
# Opens a window: skipped (77) where there is none.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home}
p=tests/data/shader/main.ts
gl() { ZINC_BACKGROUND=1 ZINC_GL_STATS=1 ZINC_RENDERER=gl ZINC_DETERMINISTIC=1 ZINC_DISPLAY=gl ZINC_SIZE=400x240 ZINC_FRAMES=$1 ZINC_SHOT="$tmp/gl$1.bmp" timeout 90 "$ZINC" run $p >"$tmp/gl$1.log" 2>&1; }
gl 3; [ -s "$tmp/gl3.bmp" ] || exit 77
grep -q "renderer gl:" "$tmp/gl3.log" || { echo "shader_gl: ZINC_RENDERER=gl did not start the GL renderer"; exit 1; }
gl 1
k=$(python3 -c "import struct, sys; print(struct.unpack('<i', open(sys.argv[1], 'rb').read()[18:22])[0] // 400)" "$tmp/gl3.bmp")   # the density of the GL window
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE="$k" ZINC_SIZE=400x240 ZINC_FRAMES=3 ZINC_SHOT="$tmp/sw.png" "$ZINC" run $p >/dev/null 2>&1
o=$(python3 tools/glcompare "$tmp/gl3.bmp" "$tmp/sw.png") || { echo "shader_gl: $o"; exit 1; }
python3 - "$o" "$tmp/gl1.bmp" "$tmp/gl3.bmp" <<'PY' || exit 1
import re, sys
m = re.search(r"pixels over \d+: ([\d.]+)%, mae ([\d.]+)", sys.argv[1])
if not m or float(m.group(1)) > 0 or float(m.group(2)) > 1: print("shader_gl: the shader's frame differs from the CPU path's: %s" % sys.argv[1]); sys.exit(1)
if open(sys.argv[2], 'rb').read() == open(sys.argv[3], 'rb').read(): print("shader_gl: the third GL frame is the CPU path's: no SHADER drawn"); sys.exit(1)
PY
echo "shader_gl: ok ($o)"
