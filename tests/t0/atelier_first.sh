#!/bin/sh
# The first result of each style (ZN-774.23, docs/start/styles.md), from Atelier's starters run headless with a scripted pointer:
# Drawing (the first sketch) a circle that follows the pointer and grows while pressed, Scene a ball that changes colour when tapped,
# Canvas a circle in the middle, Interface a number a button adds one to. Every `// @t key` comment of a starter (the first sketch's
# lesson) is a text of each language's i18n/<lang>/atelier.json.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
fail=0
for f in app/atelier/starters/*; do
  for k in $(sed -n 's/^ *\/\/ @t \([a-z0-9._]*\)$/\1/p' "$f"); do
    for l in en fr es it de; do grep -q "\"$k\":" "i18n/$l/atelier.json" || { echo "atelier_first: $f: $k has no $l text"; fail=1; }; done
  done
done
# shot <style> <input> <frames>: runs starters/<style> with that pointer script, frames <style>-<n>.png
shot() {
  printf "$2" >"$t/in"
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=${3##*,} ZINC_INPUT="$t/in" ZINC_SHOT_FRAMES="$3" ZINC_SHOT="$t/$1.png" ZINC_SCENE_DUMP="$t/$1" \
    timeout 60 "$ZINC" run app/atelier/starters/$1.ts* >"$t/out" 2>&1 || { echo "atelier_first: $1 does not run: $(tail -3 "$t/out")"; fail=1; }
}
shot drawing '3 move 200 150\n6 move 400 300\n7 down\n' 5,9
shot scene '6 move 640 400\n7 down\n8 up\n' 5,11
shot canvas '' 5
shot interface '6 move 640 442\n7 down\n8 up\n' 5,11
[ "$(python3 tools/scene-texts "$t/interface-5" | tr '\n' ' ')" = "0 +1 " ] && [ "$(python3 tools/scene-texts "$t/interface-11" | tr '\n' ' ')" = "1 +1 " ] \
  || { echo "atelier_first: the interface's button does not count: $(python3 tools/scene-texts "$t/interface-11" | tr '\n' ' ')"; fail=1; }
# px <png> <x> <y> <rrggbb>: that pixel is that colour, within 12 per channel
cat >"$t/px.py" <<'EOF'
import sys, importlib.machinery, importlib.util
spec = importlib.util.spec_from_loader('pngdiff', importlib.machinery.SourceFileLoader('pngdiff', 'tools/pngdiff'))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
fail = 0
for a in sys.argv[1:]:
    p, x, y, want = a.split(':'); x = int(x); y = int(y)
    w, h, bpp, px = m.dec(p); i = (y * w + x) * bpp; got = px[i:i + 3]
    if max(abs(got[c] - int(want[2 * c:2 * c + 2], 16)) for c in range(3)) > 12:
        print(f'atelier_first: {p.split("/")[-1]} at {x},{y} is {got.hex()}, not {want} ({w}x{h})'); fail = 1
sys.exit(fail)
EOF
python3 "$t/px.py" \
  "$t/drawing-5.png:200:150:9388ff" "$t/drawing-5.png:200:195:1c1b20" "$t/drawing-5.png:400:300:1c1b20" \
  "$t/drawing-9.png:400:300:9388ff" "$t/drawing-9.png:400:355:9388ff" "$t/drawing-9.png:200:150:1c1b20" \
  "$t/scene-5.png:640:400:9388ff" "$t/scene-5.png:20:20:1c1b20" "$t/scene-11.png:640:400:5ec2f2" \
  "$t/canvas-5.png:640:400:9388ff" "$t/canvas-5.png:20:20:1c1b20" \
  "$t/interface-5.png:20:20:1c1b20" || fail=1
[ $fail -eq 0 ] && echo "atelier_first: ok"
exit $fail
