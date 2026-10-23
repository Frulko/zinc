#!/bin/sh
# A real Mac GPU proof, separate from headless preview goldens. No exact GPU hash across drivers.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ZINC_BACKGROUND=1 ZINC_RENDERER=gl ZINC_DISPLAY=gl ZINC_GL_STATS=1 ZINC_DETERMINISTIC=1
unset ZINC_HEADLESS
for size in 900x720 360x640 800x480; do
  for look in light dark; do
    dark=0; [ "$look" != dark ] || dark=1
    GLASS_DARK=$dark ZINC_SIZE=$size ZINC_FRAMES=6 ZINC_SHOT="$tmp/$size-$look.bmp" \
      timeout 30 "$ZINC" run tests/data/glass-icon-reveal/gpu.ts > "$tmp/$size.log" 2>&1 || { cat "$tmp/$size.log"; exit 1; }
    grep -q 'renderer gl:' "$tmp/$size.log" || { cat "$tmp/$size.log"; exit 1; }
    if grep -Eq 'does not compile|ERROR:|error:' "$tmp/$size.log"; then cat "$tmp/$size.log"; exit 1; fi
  done
  python3 - "$tmp/$size-light.bmp" "$tmp/$size-dark.bmp" <<'PY'
import struct, sys
for path in sys.argv[1:]:
    data = open(path, 'rb').read()
    assert data[:2] == b'BM', 'missing real GPU capture'
    offset = struct.unpack_from('<I', data, 10)[0]
    width, height = struct.unpack_from('<ii', data, 18)
    bits = struct.unpack_from('<H', data, 28)[0]
    assert bits in (24, 32)
    background = data[offset:offset + 3]
    assert (max(background) < 30) == ('-dark.bmp' in path), (path, 'wrong theme', background)
    stride = ((width * bits + 31) // 32) * 4
    cyan = warm = 0
    for y in range(abs(height) // 4, abs(height) * 3 // 4):
        for x in range(width // 4, width * 3 // 4):
            pos = offset + y * stride + x * (bits // 8)
            b, g, r = data[pos:pos + 3]
            cyan += b > r + 35 and g > r + 25
            warm += r > b + 35 and r > g + 15
    assert cyan > 25 and warm > 25, (path, 'missing spectral refraction', cyan, warm)
assert open(sys.argv[1], 'rb').read() != open(sys.argv[2], 'rb').read(), 'theme did not change'
PY
  if [ -n "${KEEP:-}" ]; then mkdir -p "$KEEP"; cp "$tmp/$size-light.bmp" "$tmp/$size-dark.bmp" "$KEEP/"; fi
done
echo 'glass_icon_reveal_gpu: real shader, spectral corners, light/dark, portrait/landscape ok'
