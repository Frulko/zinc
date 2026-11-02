#!/bin/sh
# Low-latency pen ink on the Paper Pro (rmpp simulator, tests/native/rmpp/sim.cpp): Murdoku's ink canvas (zinc:ink overlay) while a scripted Marker
# stroke is pushed through the driver's evdev path (ZN_RMPP_SIM_STROKE: 4 samples per frame, 100 frames).
#   instant AppLoad (0006): the driver switches to the pen waveform for the stroke (one FAST), sends every frame's new segment at once (a few
#     hundred pixels, not the page nor the stroke's box), and settles the stroke's box in the app's mode (UI) after the Marker has been away.
#   no instant switch: the mode stays, but the stroke's updates go out every 33 ms, not every 125 ms (the UI waveform's 8 Hz).
cd "$(dirname "$0")/../.." || exit 2
root=$(pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
fail=0
run() {   # run <label> <extra env...>
  label=$1; shift
  d=$tmp/$label; mkdir -p "$d/plugins/display-rmpp-sim" "$d/out"
  ln -s "$root/examples/murdoku/src" "$d/src"
  sed -e 's/"driver": "rmpp"/"driver": "rmpp-sim"/' -e 's/1320/810/' -e 's/"height": 900/"height": 1080/' examples/murdoku/zinc.json > "$d/zinc.json"
  sed "s|\"RMPP_DRIVER\"|\"$root/plugins/display-rmpp/rmpp.cpp\"|" tests/native/rmpp/sim.cpp > "$d/plugins/display-rmpp-sim/sim.cpp"
  cat plugins/display-rmpp/*.cpp plugins/display-rmpp/*.h integrations/remarkable-ink/protocol.h | shasum | sed 's|^|// driver |' >> "$d/plugins/display-rmpp-sim/sim.cpp"
  cat > "$d/plugins/display-rmpp-sim/plugin.json" <<J
{ "name": "display-rmpp-sim", "kind": "display", "options": {},
  "targets": { "macos": { "sources": ["sim.cpp"], "flags": ["-I$root/tests/native/stubs", "-I$root/plugins/display-rmpp", "-I$root/integrations/remarkable-ink"] }, "linux": { "sources": ["sim.cpp"] } } }
J
  : > "$d/input"
  ( cd "$d" && env "ZINC_RMPP_MACHINE=reMarkable Ferrari" ZINC_EINK=1 ZN_RMPP_SIM_POLLS=1 ZN_RMPP_SIM_APPLOAD=dock ZINC_RMPP_HEADER=remarkable \
      "ZN_RMPP_SIM_STROKE=80-180:300,1000:4" ZN_RMPP_SIM_OUT="$d/out" ZINC_STORAGE="$d/storage.kv" ZINC_DISPLAY=rmpp-sim QTFB_KEY=7 ZINC_HEADLESS=1 \
      ZINC_BACKGROUND=1 ZINC_INPUT="$d/input" ZINC_FRAMES=260 "$@" timeout 200 "$ZINC" run "$d" >"$tmp/$label.log" 2>&1 ) || { echo "$label: run failed: $(tail -c 400 "$tmp/$label.log")"; fail=1; return 1; }
  grep -q " 0 errors" "$d/out/trace.txt" || { echo "$label: the model reports errors"; grep error "$d/out/trace.txt" | head -3; fail=1; return 1; }
}
# stats <label>: "<updates inside the stroke> <largest pixels> <largest gap in ms between two of them>", from the first update after the 20th sample
stats() {
  python3 - "$tmp/$1/out/trace.txt" <<'PY'
import re, sys
s, u = [], []
for row in open(sys.argv[1]):
    m = re.match(r'\s*([\d.]+) ms pen samples to', row)
    if m: s.append(float(m.group(1)))
    m = re.match(r'\s*([\d.]+) ms update PARTIAL \d+,\d+ (\d+)x(\d+)', row)
    if m and len(s) > 20: u.append((float(m.group(1)), int(m.group(2)) * int(m.group(3))))
last = s[-1]
u = [x for x in u if x[0] <= last]
print(len(u), max(p for _, p in u), int(max(b[0] - a[0] for a, b in zip(u, u[1:]))))
PY
}
if run instant ZN_RMPP_SIM_INSTANT=1; then
  set -- $(stats instant)
  [ "$1" -ge 70 ] && [ "$2" -le 4000 ] && [ "$3" -le 34 ] || { echo "instant: updates=$1 largest=$2 px gap=$3 ms (want >= 70, <= 4000 px, <= 34 ms)"; fail=1; }
  t=$tmp/instant/out/trace.txt
  [ "$(grep -c 'mode FAST' "$t")" -eq 1 ] || { echo "instant: expected one FAST switch for the stroke"; fail=1; }
  grep -q 'mode UI' "$t" || { echo "instant: no switch back to the app's mode after the stroke"; fail=1; }
  n=$(awk '/mode UI/ {f=1} f && /update PARTIAL/ {c++} END {print c+0}' "$t")
  [ "$n" -ge 1 ] || { echo "instant: the stroke's box is not settled in the app's mode"; fail=1; }
fi
if run slow; then
  set -- $(stats slow)
  [ "$1" -ge 35 ] && [ "$3" -le 50 ] || { echo "slow: updates=$1 gap=$3 ms (want >= 35, <= 50 ms)"; fail=1; }
  grep -q 'mode FAST' "$tmp/slow/out/trace.txt" && { echo "slow: switched modes without an instant AppLoad"; fail=1; }
fi
[ $fail -eq 0 ] && echo "rmpp ink latency: ok"
exit $fail
