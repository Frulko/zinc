#!/bin/sh
# Museum table panoramas (ZN-650.09). The viewer (examples/museum-table/src/pano.ts) replays a scripted session (tests/data/museum_panorama/
# session.input: look around with a drag the view continues, two wheel steps in, open the point "steps", follow its link): its view log is
# expected.log and the frames 1, 60, 230, 320 and 370 have the hashes of tests/golden/museum-panorama/frames.txt (software, recorded on the
# Intel Mac). attach.ts puts red squares at five directions of a synthetic panorama: at five views each is drawn within 2 pixels of where
# PanoramaView.project says. The sample's panorama is there with its source and licence.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_RUN=interp
ZINC_INPUT=tests/data/museum_panorama/session.input ZINC_SIZE=1280x720 ZINC_FRAMES=370 ZINC_FRAMEHASH=all "$ZINC" run ../examples/museum-table/src/pano.ts >"$tmp/log" 2>"$tmp/err"
diff tests/data/museum_panorama/expected.log "$tmp/log" >"$tmp/d" || { echo "the view log differs: $(head -6 "$tmp/d")"; fail=1; }
grep -E "framehash (1|60|230|320|370) " "$tmp/err" | awk '{print $3, $5}' >"$tmp/frames"
diff tests/golden/museum-panorama/frames.txt "$tmp/frames" >"$tmp/d" || { echo "frames differ from their hashes: $(head -6 "$tmp/d") $(grep -v framehash "$tmp/err" | head -3)"; fail=1; }
ZINC_SIZE=960x540 ZINC_FRAMES=5 ZINC_SHOT="$tmp/at.png" ZINC_SHOT_FRAMES=1,2,3,4,5 "$ZINC" run tests/data/museum_panorama/attach.ts >"$tmp/attach" 2>&1
python3 - "$tmp" <<'PY' || fail=1
import sys, importlib.machinery, importlib.util
t = sys.argv[1]
spec = importlib.util.spec_from_loader('pd', importlib.machinery.SourceFileLoader('pd', 'tools/pngdiff')); pd = importlib.util.module_from_spec(spec); spec.loader.exec_module(pd)
seen, bad = 0, 0
for line in open(t + '/attach'):
    p = line.split()
    if len(p) != 6 or p[0] != 'view': continue
    v, i, x, y = int(p[1]), int(p[3]), float(p[4]), float(p[5])
    w, h, bpp, d = pd.dec(f'{t}/at-{v + 1}.png')
    sx = sy = n = 0
    for yy in range(max(0, int(y) - 40), min(h, int(y) + 40)):
        for xx in range(max(0, int(x) - 40), min(w, int(x) + 40)):
            o = (yy * w + xx) * bpp
            if d[o] > 180 and d[o + 1] < 80 and d[o + 2] < 80: sx += xx + 0.5; sy += yy + 0.5; n += 1
    seen += 1
    off = ((sx / n - x) ** 2 + (sy / n - y) ** 2) ** 0.5 if n else 1e9
    if off > 2: bad += 1; print(f'view {v}: point {i} drawn {off:.1f} px from where it is projected ({x:.1f}, {y:.1f})')
if seen < 6: print(f'attach.ts printed {seen} points, 6 expected'); sys.exit(1)
sys.exit(1 if bad else 0)
PY
[ -s ../examples/museum-table/assets/panoramas/ninomaru.jpg ] || { echo "the sample panorama is missing"; fail=1; }
grep -q '"source": "https://polyhaven.com/a/ninomaru_teien"' ../examples/museum-table/assets/project.json && grep -q '"licence": "CC0 1.0"' ../examples/museum-table/assets/project.json || { echo "the panorama's source or licence is not recorded"; fail=1; }
exit $fail
