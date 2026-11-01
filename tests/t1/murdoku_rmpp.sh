#!/bin/sh
# Murdoku on the Paper Pro (the rmpp simulator, tests/native/rmpp/sim.cpp): the app sizes its surface 810x1080 (1080x810 in landscape) and the driver
# draws it at 2 physical pixels per pixel (HalDisplay.pixel_scale), so the UI is the right size at 229 ppi. Taps in the panel's pixels, as AppLoad
# forwards them, must reach the app turned and divided: a suspect letter, a witness card and the help button each change the page. Docked under
# xochitl's header (AppLoad 0005) the header strip (the left of the turned surface) is the safe area: the title starts below it, not under it.
cd "$(dirname "$0")/../.." || exit 2
root=$(pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
proj=$tmp/p; mkdir -p "$proj/plugins/display-rmpp-sim" "$proj/out"
ln -s "$root/examples/murdoku/src" "$proj/src"
sed -e 's/"driver": "rmpp"/"driver": "rmpp-sim"/' -e 's/1320/810/' -e 's/"height": 900/"height": 1080/' examples/murdoku/zinc.json > "$proj/zinc.json"
sed "s|\"RMPP_DRIVER\"|\"$root/plugins/display-rmpp/rmpp.cpp\"|" tests/native/rmpp/sim.cpp > "$proj/plugins/display-rmpp-sim/sim.cpp"
cat plugins/display-rmpp/*.cpp plugins/display-rmpp/*.h integrations/remarkable-ink/protocol.h | shasum | sed 's|^|// driver |' >> "$proj/plugins/display-rmpp-sim/sim.cpp"
cat > "$proj/plugins/display-rmpp-sim/plugin.json" <<J
{ "name": "display-rmpp-sim", "kind": "display", "options": {},
  "targets": { "macos": { "sources": ["sim.cpp"], "flags": ["-I$root/tests/native/stubs", "-I$root/plugins/display-rmpp", "-I$root/integrations/remarkable-ink"] }, "linux": { "sources": ["sim.cpp"] } } }
J
: > "$proj/input"
( cd "$proj" && env "ZINC_RMPP_MACHINE=reMarkable Ferrari" ZINC_EINK=1 ZN_RMPP_SIM_POLLS=1 "ZN_RMPP_SIM_TAP=100:285,192;150:939,1800;200:1555,2052" \
    ZN_RMPP_SIM_OUT="$proj/out" ZINC_STORAGE="$proj/storage.kv" ZINC_DISPLAY=rmpp-sim QTFB_KEY=7 ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 \
    ZINC_INPUT="$proj/input" ZINC_FRAMES=300 timeout 200 "$ZINC" run "$proj" >"$tmp/log" 2>&1 ) || { echo "murdoku rmpp: run failed: $(tail -c 400 "$tmp/log")"; exit 1; }
t=$proj/out/trace.txt
grep -q "landscape, the Paper Pro turned 90 degrees, 2 physical" "$tmp/log" || { echo "murdoku rmpp: not landscape at 2x: $(tail -c 300 "$tmp/log")"; exit 1; }
grep -q " 0 errors" "$t" || { echo "murdoku rmpp: the model reports errors"; grep error "$t" | head -3; exit 1; }
n=$(grep -c "touch press" "$t"); [ "$n" -eq 3 ] || { echo "murdoku rmpp: $n touches of 3"; exit 1; }
# the first update is the page; every tap that reached the app (card, cell, help) changes it: three more
u=$(grep -c "update PARTIAL" "$t"); [ "$u" -ge 4 ] || { echo "murdoku rmpp: $u updates, the taps did not reach the app"; cat "$t" | cut -c1-90; exit 1; }
# docked under the header: the 120 px strip of the panel's top is the app's left safe area (60 logical px), the layout fits what is left
d=$tmp/dock; mkdir -p "$d/out"; cp -R "$proj/plugins" "$proj/zinc.json" "$d/"; ln -s "$root/examples/murdoku/src" "$d/src"; : > "$d/input"
( cd "$d" && env "ZINC_RMPP_MACHINE=reMarkable Ferrari" ZINC_EINK=1 ZN_RMPP_SIM_POLLS=1 ZN_RMPP_SIM_APPLOAD=dock ZINC_RMPP_HEADER=remarkable ZINC_RMPP_REFRESH_MODE=fast ZN_RMPP_SIM_RESTORE=0 ZN_RMPP_SIM_FULL=1 "ZN_RMPP_SIM_TAP=200:1555,1932" \
    ZN_RMPP_SIM_OUT="$d/out" ZINC_STORAGE="$d/storage.kv" ZINC_DISPLAY=rmpp-sim QTFB_KEY=7 ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 \
    ZINC_INPUT="$d/input" ZINC_FRAMES=300 timeout 200 "$ZINC" run "$d" >"$tmp/dlog" 2>&1 ) || { echo "murdoku rmpp docked: run failed: $(tail -c 400 "$tmp/dlog")"; exit 1; }
t=$d/out/trace.txt
grep -q "docked under a 120 px header" "$t" || { echo "murdoku rmpp docked: not docked"; exit 1; }
grep -q " 0 errors" "$t" || { echo "murdoku rmpp docked: the model reports errors"; grep error "$t" | head -3; exit 1; }
python3 - "$d/out/glass.ppm" <<'PY' || { echo "murdoku rmpp docked: the app draws in the header strip's safe area"; exit 1; }
import sys
b = open(sys.argv[1], 'rb').read(); w, h = map(int, b.split(b'\n')[1].split()); px = b[len(b) - w * h * 3:]
dark = sum(1 for y in range(120, 148) for x in range(1520, 1600) if px[(y * w + x) * 3] < 128)   # the title's column, just under the header: its padding
title = sum(1 for y in range(150, 400) for x in range(1520, 1600) if px[(y * w + x) * 3] < 128)   # and the title is there, at the top of the turned surface
sys.exit(0 if dark == 0 and title > 200 else 1)
PY
echo "murdoku rmpp: 1080x810 surface at 2 physical pixels, taps reach the app turned and divided, docked it keeps off the header"
