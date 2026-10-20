#!/bin/sh
# Pixel comparator with edge mask (ZN-172): the same scene against itself passes, edge-only noise passes, a rounded box moved by three pixels (the 1 px edge ring absorbs a 1 px move: that is anti-aliasing noise by definition) fails on the interior.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
g=tests/golden/pixel_compare
render() {   # program name -> $t/name.scn, $t/name.png
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=300x100 ZINC_FRAMES=2 ZINC_SHOT="$t/$2.png" ZINC_SCENE_DUMP="$t/$2.scn" "$ZINC" run "$1" >/dev/null 2>&1 || { echo "cannot run $1"; exit 1; }
}
render $g/scene.ts scene; render $g/moved.ts moved
fail=0
tools/pixel-compare "$t/scene.png" "$t/scene.png" --scene "$t/scene.scn" >/dev/null || { echo "identical images do not pass"; fail=1; }
python3 - "$t" <<'P' || fail=1
import sys, importlib.machinery, importlib.util, os
t = sys.argv[1]
def load(n):
    l = importlib.machinery.SourceFileLoader(n, "tools/" + n); s = importlib.util.spec_from_loader(n, l); m = importlib.util.module_from_spec(s); l.exec_module(m); return m
pc, pd = load("pixel-compare"), load("pngdiff")
w, h, ba, da = pd.dec(t + "/scene.png")
ww, hh, cmds = pc.read_scene(t + "/scene.scn")
cls = pc.classes(ww, hh, cmds)
assert (ww, hh) == (w, h), "scene and image sizes differ"
edge = sum(1 for c in cls if c == 1)
assert edge > 200, "the edge mask is empty (%d)" % edge
noisy = bytearray(da)
for i, c in enumerate(cls):
    if c == 1: noisy[i * ba] = min(255, noisy[i * ba] + 20)   # edge-only noise within the edge tolerance
pd.write_rgb(t + "/noisy.png", w, h, bytes(b for i in range(w * h) for b in noisy[i * ba:i * ba + 3]))
a, b = pd.dec(t + "/scene.png"), pd.dec(t + "/noisy.png")
m = pc.metrics(a, b, cls); bad = pc.verdict(m, {"share_gt8": 1.0})
if bad: print("edge-only noise must pass:", bad); sys.exit(1)
mv = pc.metrics(a, pd.dec(t + "/moved.png"), cls)
if not pc.verdict(mv, {"edge_max": 255, "share_gt8": 1.0}) : print("a box moved by three pixels (the 1 px edge ring absorbs a 1 px move: that is anti-aliasing noise by definition) must fail on the interior:", mv); sys.exit(1)
P
[ $fail -eq 0 ] && echo "pixel_compare: ok"
exit $fail
