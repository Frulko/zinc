#!/bin/sh
# zinc:gfx updatePixels (u32 a pixel): rows 0 and 1 of the frame (updateImage bytes, updatePixels) are the same picture, row 2 (alpha forced
# opaque) shows the same colours, and the interpreter, the default engine and QuickJS draw the same frame.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
run() { ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=200x100 ZINC_SCALE=1 ZINC_SHOT="$t/$2.png" "$ZINC" run tests/data/update_pixels/main.ts $1 2>&1; }
run --interp i; run "" d; run "--engine quickjs" q
python3 - "$t" <<'PY' || exit 1
import sys, importlib.util, importlib.machinery
loader = importlib.machinery.SourceFileLoader('pngdiff', 'tools/pngdiff')
spec = importlib.util.spec_from_loader('pngdiff', loader); m = importlib.util.module_from_spec(spec); loader.exec_module(m)
t = sys.argv[1]; fail = []
def px(p, x, y):
    w, h, bpp, d = m.dec(p); o = (y * w + x) * bpp; return tuple(d[o:o + 3])
for e in 'idq':
    p = '%s/%s.png' % (t, e)
    for x in (25, 75, 125, 175):
        a, b = px(p, x, 15), px(p, x, 50)
        if a != b: fail.append('%s: bytes %s and packed %s differ at x=%d' % (e, a, b, x))
    if px(p, 25, 85) != (255, 0, 0) or px(p, 125, 85) != (0, 0, 255): fail.append('%s: forced-opaque row is %s %s' % (e, px(p, 25, 85), px(p, 125, 85)))
if not (px(t + '/i.png', 175, 50) == px(t + '/d.png', 175, 50) == px(t + '/q.png', 175, 50)): fail.append('engines blend the half alpha pixel differently')
print('\n'.join('update_pixels: ' + f for f in fail)) if fail else None
sys.exit(1 if fail else 0)
PY
echo "update_pixels: ok"
