#!/bin/sh
# Murdoku on the Paper Pro (the rmpp simulator, tests/native/rmpp/sim.cpp): the app sizes its surface 810x1080 (1080x810 in landscape) and the driver
# draws it at 2 physical pixels per pixel (HalDisplay.pixel_scale), so the UI is the right size at 229 ppi. Taps in the panel's pixels, as AppLoad
# forwards them, must reach the app turned and divided: a suspect card, a cell of the plan and the help button each change the page.
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
( cd "$proj" && env "ZINC_RMPP_MACHINE=reMarkable Ferrari" ZINC_EINK=1 ZN_RMPP_SIM_POLLS=1 "ZN_RMPP_SIM_TAP=100:1274,205;150:1080,1188;200:1555,2052" \
    ZN_RMPP_SIM_OUT="$proj/out" ZINC_STORAGE="$proj/storage.kv" ZINC_DISPLAY=rmpp-sim QTFB_KEY=7 ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 \
    ZINC_INPUT="$proj/input" ZINC_FRAMES=300 timeout 200 "$ZINC" run "$proj" >"$tmp/log" 2>&1 ) || { echo "murdoku rmpp: run failed: $(tail -c 400 "$tmp/log")"; exit 1; }
t=$proj/out/trace.txt
grep -q "landscape, the Paper Pro turned 90 degrees, 2 physical" "$tmp/log" || { echo "murdoku rmpp: not landscape at 2x: $(tail -c 300 "$tmp/log")"; exit 1; }
grep -q " 0 errors" "$t" || { echo "murdoku rmpp: the model reports errors"; grep error "$t" | head -3; exit 1; }
n=$(grep -c "touch press" "$t"); [ "$n" -eq 3 ] || { echo "murdoku rmpp: $n touches of 3"; exit 1; }
# the first update is the page; every tap that reached the app (card, cell, help) changes it: three more
u=$(grep -c "update PARTIAL" "$t"); [ "$u" -ge 4 ] || { echo "murdoku rmpp: $u updates, the taps did not reach the app"; cat "$t" | cut -c1-90; exit 1; }
echo "murdoku rmpp: 1080x810 surface at 2 physical pixels, taps reach the app turned and divided"
