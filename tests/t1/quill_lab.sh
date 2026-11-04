#!/bin/sh
# The Quill lab under an ink session (L2), the real display-rmpp against a stand-in engine shim (tests/native/sidecar/fakequill.c): "Modes comparés"
# shows each column in its raw engine mode (setWaveform: 1, 3, 4, 5, colour content), the map's footprints go out as small Pen updates, and a tap
# on Quitter ends the app. Without the session setWaveform answers false and the same demo still draws (qtfb has one waveform).
cd "$(dirname "$0")/../.." || exit 2
root=$(pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
proj=$tmp/lab; mkdir -p "$proj/plugins/display-rmpp-sim" "$proj/out"
ln -s "$root/examples/remarkable/quill-lab/src" "$proj/src"; ln -s "$root/examples/remarkable/quill-lab/assets" "$proj/assets"
cp examples/remarkable/quill-lab/icon.svg "$proj/"
sed -e 's/"driver": "rmpp"/"driver": "rmpp-sim"/' examples/remarkable/quill-lab/zinc.json > "$proj/zinc.json"
sed "s|\"RMPP_DRIVER\"|\"$root/plugins/display-rmpp/rmpp.cpp\"|" tests/native/rmpp/sim.cpp > "$proj/plugins/display-rmpp-sim/sim.cpp"
cat plugins/display-rmpp/*.cpp plugins/display-rmpp/*.h integrations/remarkable-ink/protocol.h | shasum | sed 's|^|// driver |' >> "$proj/plugins/display-rmpp-sim/sim.cpp"
cat > "$proj/plugins/display-rmpp-sim/plugin.json" <<J
{ "name": "display-rmpp-sim", "kind": "display", "options": {},
  "targets": { "macos": { "sources": ["sim.cpp"], "flags": ["-I$root/tests/native/stubs", "-I$root/plugins/display-rmpp", "-I$root/integrations/remarkable-ink"] } } }
J
cc -shared -O1 tests/native/sidecar/fakequill.c -o "$tmp/fakequill.dylib" || exit 1
session() {   # demo index, frames, swap log
  ( cd "$proj" && QUILL_LAB_DEMO=$1 ZN_RMPP_SIM_OUT="$proj/out" ZINC_RMPP_MACHINE="reMarkable Ferrari" ZINC_LEASE=1 ZINC_RMPP_INK=session \
      ZINC_VENDOR_SHA256=07aa9327f725288a5df5aebc33ea4b151c27d97d3b850279947ddddf3dd8ddec ZINC_RMPP_SHIM="$tmp/fakequill.dylib" ZINC_RMPP_ENGINE="$tmp" \
      FAKEQUILL_LOG="$3" ZINC_STORAGE="$proj/kv" ZINC_DISPLAY=rmpp-sim ZINC_HEADLESS=1 ZINC_REALTIME=1 ZINC_FRAMES=$2 timeout 120 "$ZINC" run "$proj" >"$tmp/app.log" 2>&1 ) ||
    { echo "quill_lab: demo $1 failed: $(tail -c 400 "$tmp/app.log")"; exit 1; }
  grep -q "ink session on" "$tmp/app.log" || { echo "quill_lab: no ink session: $(tail -c 300 "$tmp/app.log")"; exit 1; }
}
fail=0
session 8 400 "$tmp/modes.txt"
for m in 1 3 4 5; do
  grep -Eq "swap [0-9]+,[0-9]+ [0-9]+x[0-9]+ mode $m full 0 content 1" "$tmp/modes.txt" || { echo "quill_lab: no colour swap in mode $m"; fail=1; }
done
session 2 200 "$tmp/map.txt"
grep -E "mode 0 full 0" "$tmp/map.txt" | awk '{ split($3, s, "x"); if (s[1] * s[2] < 100000) n++ } END { exit !(n >= 2) }' ||
  { echo "quill_lab: the footprints are not small Pen updates: $(head -5 "$tmp/map.txt")"; fail=1; }
exit $fail
