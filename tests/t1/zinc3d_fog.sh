#!/bin/sh
# Fog in zinc:3d: tests/data/zinc3d_fog (white quads at view depths 5, 30 and 60 under a blue fog from 10 to 50). In software and on the
# GPU: the near quad stays white, the middle one is half way to blue, the far one is the fog colour.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
for r in software gpu; do
  ZINC_3D=$r ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_FRAMES=2 ZINC_SHOT="$tmp/$r.png" "$ZINC" run tests/data/zinc3d_fog >"$tmp/$r.log" 2>&1
  if grep -q "no GPU context" "$tmp/$r.log"; then echo "skipped the GPU: no context here"; continue; fi
  [ -f "$tmp/$r.png" ] || { echo "$r: no frame: $(head -c 300 "$tmp/$r.log")"; fail=1; continue; }
  python3 - "$tmp/$r.png" <<'PY' || fail=1
import sys, importlib.machinery, importlib.util
spec = importlib.util.spec_from_loader('pd', importlib.machinery.SourceFileLoader('pd', 'tools/pngdiff')); pd = importlib.util.module_from_spec(spec); spec.loader.exec_module(pd)
w, h, bpp, d = pd.dec(sys.argv[1]); bad = []
for name, x, want in [('near', 100, (255, 255, 255)), ('middle', 200, (128, 128, 255)), ('far', 300, (0, 0, 255))]:
    got = tuple(d[(120 * w + x) * bpp:(120 * w + x) * bpp + 3])
    if any(abs(got[c] - want[c]) > 4 for c in range(3)): bad.append(f'{name} {got} instead of {want}')
if bad: print(sys.argv[1].split('/')[-1] + ': ' + '; '.join(bad)); sys.exit(1)
PY
done
exit $fail
