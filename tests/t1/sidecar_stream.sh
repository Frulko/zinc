#!/bin/sh
# Sidecar (app/sidecar): a Mac's screen streamed into the reMarkable app's window by display-rmpp's own thread (stream.h), against the fake AppLoad of
# tests/native/rmpp/sim.cpp. The scripted Mac (tests/native/sidecar/send.py) connects, gets the docked size, and its rectangles land as partial updates
# below the header in the pen's waveform; its full refresh goes out; a tap reaches the Mac in its pixels, not the app; when it leaves, the app's
# whole page is drawn again.
cd "$(dirname "$0")/../.." || exit 2
root=$(pwd)
tmp=$(mktemp -d); trap 'kill $app 2>/dev/null; rm -rf "$tmp"' EXIT
proj=$tmp/sidecar; mkdir -p "$proj/plugins/display-rmpp-sim" "$proj/out"
ln -s "$root/app/sidecar/src" "$proj/src"
sed -e 's/"driver": "rmpp"/"driver": "rmpp-sim"/' app/sidecar/zinc.json > "$proj/zinc.json"
sed "s|\"RMPP_DRIVER\"|\"$root/plugins/display-rmpp/rmpp.cpp\"|" tests/native/rmpp/sim.cpp > "$proj/plugins/display-rmpp-sim/sim.cpp"
cat plugins/display-rmpp/*.cpp plugins/display-rmpp/*.h integrations/remarkable-ink/protocol.h | shasum | sed 's|^|// driver |' >> "$proj/plugins/display-rmpp-sim/sim.cpp"
cat > "$proj/plugins/display-rmpp-sim/plugin.json" <<J
{ "name": "display-rmpp-sim", "kind": "display", "options": {},
  "targets": { "macos": { "sources": ["sim.cpp"], "flags": ["-I$root/tests/native/stubs", "-I$root/plugins/display-rmpp", "-I$root/integrations/remarkable-ink"] } } }
J
port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
( cd "$proj" && ZN_RMPP_SIM_OUT="$proj/out" ZINC_RMPP_MACHINE="reMarkable Ferrari" ZN_RMPP_SIM_APPLOAD=dock ZN_RMPP_SIM_RESTORE=0 ZINC_RMPP_HEADER=remarkable ZINC_SIDECAR_PORT=$port ZN_RMPP_SIM_TAP="100:300,520;140:300,520;180:300,520;220:300,520;260:300,520;300:300,520;340:300,520;380:300,520;420:300,520;460:300,520;500:300,520;540:300,520;580:300,520;620:300,520;660:300,520;700:300,520;740:300,520;780:300,520;820:300,520;860:300,520;900:300,520;940:300,520;980:300,520;1020:300,520;1060:300,520;1100:300,520;1140:300,520;1180:300,520;1220:300,520;1260:300,520;1300:300,520;1340:300,520;1380:300,520;1420:300,520;1460:300,520;1500:300,520;1540:300,520;1580:300,520;1620:300,520;1660:300,520;1700:300,520;1740:300,520;1780:300,520;1820:300,520;1860:300,520;1900:300,520;1940:300,520;1980:300,520" ZINC_STORAGE="$proj/kv" \
    ZINC_DISPLAY=rmpp-sim QTFB_KEY=7 ZINC_HEADLESS=1 ZINC_FRAMES=900 "$ZINC" run "$proj" >"$tmp/app.log" 2>&1 ) & app=$!
timeout 60 python3 tests/native/sidecar/send.py $port > "$tmp/mac.log" 2>&1 || { echo "sidecar: the Mac's side failed: $(cat "$tmp/mac.log") $(tail -c 300 "$tmp/app.log")"; exit 1; }
wait $app || { echo "sidecar: the app failed: $(tail -c 400 "$tmp/app.log")"; exit 1; }
t=$proj/out/trace.txt
fail=0
[ -n "$SIDECAR_KEEP" ] && cp "$t" "$tmp/mac.log" "$tmp/app.log" "$SIDECAR_KEEP"/
check() { grep -q -- "$2" "$3" || { echo "sidecar: no '$2' ($1)"; fail=1; }; }
check hello "hello RMPP 1620 2040 Paper Pro" "$tmp/mac.log"
check acks "ack 2" "$tmp/mac.log"
check "the tap, in the stream's pixels (AppLoad's 640 less the header)" "input 0x1[01] 300,520" "$tmp/mac.log"
check dock "docked under a 120 px header" "$t"
check waveform "mode FAST" "$t"
check "1-bit block below the header" "update PARTIAL 96,320 64x16" "$t"
check "grey levels" "update PARTIAL 0,120 10x2" "$t"
check "full refresh" "full refresh" "$t"
check "the app's page again" "update PARTIAL 0,120 1620x2040" "$t"
grep -q " 0 errors" "$t" || { echo "sidecar: the model reports errors:"; grep error "$t" | head -5; fail=1; }
[ $fail = 0 ] && echo "sidecar_stream: ok"
exit $fail
