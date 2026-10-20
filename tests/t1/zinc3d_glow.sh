#!/bin/sh
# Blending and emissive colours in zinc:3d (ZN-696): tests/data/zinc3d_glow (an unlit floor of 40, two unlit glows added to it that overlap,
# a blue quad at half opacity, a lit quad with an emissive colour added to the floor). The software frame equals its golden and its pixels
# are the sums (the overlap of the red and green glows is both: 140, 140, 40); the GPU frame has the same pixels within 2.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
for r in software gpu; do
  ZINC_3D=$r ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=2 ZINC_SHOT="$tmp/$r.png" "$ZINC" run tests/data/zinc3d_glow >"$tmp/$r.log" 2>&1
  if grep -q "no GPU context" "$tmp/$r.log"; then echo "skipped the GPU: no context here"; continue; fi
  [ -f "$tmp/$r.png" ] || { echo "$r: no frame: $(head -c 300 "$tmp/$r.log")"; fail=1; continue; }
  python3 - "$tmp/$r.png" $([ $r = gpu ] && echo 2 || echo 0) <<'PY' || fail=1
import sys, importlib.machinery, importlib.util
spec = importlib.util.spec_from_loader('pd', importlib.machinery.SourceFileLoader('pd', 'tools/pngdiff')); pd = importlib.util.module_from_spec(spec); spec.loader.exec_module(pd)
w, h, bpp, d = pd.dec(sys.argv[1]); tol = int(sys.argv[2]); bad = []
for name, (x, y), want in [('floor', (10, 10), (40, 40, 40)), ('red glow', (80, 80), (140, 40, 40)), ('both glows', (120, 80), (140, 140, 40)),
                           ('green glow', (160, 80), (40, 140, 40)), ('half blue', (120, 180), (20, 20, 148)), ('lit + emissive', (300, 120), (184, 184, 184))]:
    got = tuple(d[(y * w + x) * bpp:(y * w + x) * bpp + 3])
    if any(abs(got[c] - want[c]) > tol for c in range(3)): bad.append(f'{name} {got} instead of {want}')
if bad: print(sys.argv[1].split('/')[-1] + ': ' + '; '.join(bad)); sys.exit(1)
PY
done
[ -f "$tmp/software.png" ] && { tools/pngdiff "$tmp/software.png" tests/golden/zinc3d-glow/frame.png >"$tmp/d" || { echo "the software frame differs from its golden: $(head -1 "$tmp/d")"; fail=1; }; }
exit $fail
