#!/bin/sh
# zinc:3d on the GPU (ZN-657). Multisampling: a white cube turned on black (tests/data/zinc3d_aa/main.ts); among the pixels on its edges, the
# share that are all black or all white (stair steps) is at least 95% with ZINC_3D_MSAA=0 and at most 75% with 4 samples (the default).
# Filtering: a magnified 4 x 4 checkerboard (tex.ts) on two quads; the left material asks for the nearest texel and keeps two colours whatever
# the renderer's filter, the right one follows ZINC_3D_FILTER: grey levels with linear, two colours with nearest.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
shot() {   # name entry env...
  n=$1; e=$2; shift 2
  env "$@" ZINC_3D=gpu ZINC_RUN=interp ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=320x240 ZINC_FRAMES=2 ZINC_SHOT="$tmp/$n.png" "$ZINC" run "$e" >"$tmp/$n.log" 2>&1
  if grep -q "no GPU context" "$tmp/$n.log"; then echo "skipped: no GPU context here"; exit 77; fi
  [ -f "$tmp/$n.png" ] || { echo "$n: no frame: $(head -c 300 "$tmp/$n.log")"; fail=1; }
}
shot aa0 tests/data/zinc3d_aa ZINC_3D_MSAA=0
shot aa4 tests/data/zinc3d_aa ZINC_3D_MSAA=4
shot linear tests/data/zinc3d_aa/tex.ts ZINC_3D_FILTER=linear
shot nearest tests/data/zinc3d_aa/tex.ts ZINC_3D_FILTER=nearest
python3 - "$tmp" <<'PY' || fail=1
import sys, importlib.machinery, importlib.util
t = sys.argv[1]
spec = importlib.util.spec_from_loader('pd', importlib.machinery.SourceFileLoader('pd', 'tools/pngdiff')); pd = importlib.util.module_from_spec(spec); spec.loader.exec_module(pd)
def lum(n):
    w, h, bpp, d = pd.dec(f'{t}/{n}.png')
    return w, h, [d[(y * w + x) * bpp + 1] for y in range(h) for x in range(w)]
def stairs(n):
    w, h, l = lum(n); edge = steps = 0
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            v = l[y * w + x]; ring = [l[(y + dy) * w + x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))] + [v]
            if max(ring) - min(ring) < 128: continue
            edge += 1; steps += v < 16 or v > 239
    return 100 * steps / max(1, edge)
def greys(n, x0, x1):   # pixels inside a quad (columns [x0, x1), rows 70 to 170, away from its edges) that are neither black nor white
    w, h, l = lum(n)
    return sum(1 for y in range(70, 170) for x in range(x0, x1) if 40 < l[y * w + x] < 215)
bad = 0
a0, a4 = stairs('aa0'), stairs('aa4')
print(f'stair-stepped edge pixels: {a0:.1f}% without multisampling, {a4:.1f}% with 4 samples')
if a0 < 95 or a4 > 75: print('multisampling: expected at least 95% without and at most 75% with'); bad = 1
gl, gr, nl, nr = greys('linear', 40, 140), greys('linear', 180, 280), greys('nearest', 40, 140), greys('nearest', 180, 280)
print(f'grey pixels: linear option left {gl} right {gr}, nearest option left {nl} right {nr}')
if gl > 20 or nl > 20 or nr > 20 or gr < 2000: print('filtering: the nearest quads must keep two colours, the linear one must not'); bad = 1
sys.exit(bad)
PY
exit $fail
