#!/bin/sh
# Sidecar in an ink session (L2, xochitl stopped by the lease): display-rmpp's stream thread writes into the vendor engine's RGB32 buffer and
# the app's main thread swaps each rectangle in the Pen mode, against a stand-in engine shim (tests/native/sidecar/fakequill.c). The scripted
# Mac (send.py) gets the whole panel (no header), its 1-bit block lands black at its place, its grey rectangle and full refresh go out, and
# every swap comes from one thread (the vendor engine is driven from the main thread only).
cd "$(dirname "$0")/../.." || exit 2
root=$(pwd)
tmp=$(mktemp -d); trap 'kill $app 2>/dev/null; rm -rf "$tmp"' EXIT
proj=$tmp/sidecar; mkdir -p "$proj/plugins/display-rmpp-sim" "$proj/out"
ln -s "$root/app/sidecar/src" "$proj/src"
sed -e 's/"driver": "rmpp"/"driver": "rmpp-sim", "ink": "session"/' app/sidecar/zinc.json > "$proj/zinc.json"
sed "s|\"RMPP_DRIVER\"|\"$root/plugins/display-rmpp/rmpp.cpp\"|" tests/native/rmpp/sim.cpp > "$proj/plugins/display-rmpp-sim/sim.cpp"
cat plugins/display-rmpp/*.cpp plugins/display-rmpp/*.h integrations/remarkable-ink/protocol.h | shasum | sed 's|^|// driver |' >> "$proj/plugins/display-rmpp-sim/sim.cpp"
cat > "$proj/plugins/display-rmpp-sim/plugin.json" <<J
{ "name": "display-rmpp-sim", "kind": "display", "options": {},
  "targets": { "macos": { "sources": ["sim.cpp"], "flags": ["-I$root/tests/native/stubs", "-I$root/plugins/display-rmpp", "-I$root/integrations/remarkable-ink"] } } }
J
cc -shared -O1 tests/native/sidecar/fakequill.c -o "$tmp/fakequill.dylib" || exit 1
port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
( cd "$proj" && ZN_RMPP_SIM_OUT="$proj/out" ZINC_RMPP_MACHINE="reMarkable Ferrari" ZINC_LEASE=1 ZINC_RMPP_INK=session \
    ZINC_VENDOR_SHA256=07aa9327f725288a5df5aebc33ea4b151c27d97d3b850279947ddddf3dd8ddec ZINC_RMPP_SHIM="$tmp/fakequill.dylib" ZINC_RMPP_ENGINE="$tmp" \
    FAKEQUILL_LOG="$tmp/swaps.txt" ZINC_SIDECAR_PORT=$port ZINC_STORAGE="$proj/kv" ZINC_DISPLAY=rmpp-sim ZINC_HEADLESS=1 ZINC_FRAMES=900 \
    "$ZINC" run "$proj" >"$tmp/app.log" 2>&1 ) & app=$!
timeout 60 python3 tests/native/sidecar/send.py $port notap > "$tmp/mac.log" 2>&1 || { echo "sidecar_session: the Mac's side failed: $(cat "$tmp/mac.log") $(tail -c 300 "$tmp/app.log")"; exit 1; }
wait $app || { echo "sidecar_session: the app failed: $(tail -c 400 "$tmp/app.log")"; exit 1; }
s=$tmp/swaps.txt
fail=0
[ -n "$SIDECAR_KEEP" ] && cp "$s" "$tmp/mac.log" "$tmp/app.log" "$SIDECAR_KEEP"/
check() { grep -q -- "$2" "$3" || { echo "sidecar_session: no '$2' ($1)"; fail=1; }; }
check "ink session" "ink session on" "$tmp/app.log"
check "the whole panel" "hello RMPP 1620 2160 Paper Pro" "$tmp/mac.log"
check acks "ack 2" "$tmp/mac.log"
check "1-bit block, black, Pen mode" "swap 96,200 64x16 mode 0 full 0 content 0 thread [0-9a-f]* pixel ff000000" "$s"
check "grey levels" "swap 0,0 10x2 mode 0 full 0" "$s"
check "full refresh" "swap 0,0 1620x2160 mode 4 full 1" "$s"
check "lz4 block" "swap 200,300 16x8 mode 0 full 0 content 0 thread [0-9a-f]* pixel ff000000" "$s"
check "one picture, one update" "swap 400,400 16x4 mode 0" "$s"
check "the pointer, drawn here" "swap 599,599 3x3 mode 0 full 0 content 0 thread [0-9a-f]* pixel ff000000" "$s"
check "a scroll's copy" "swap 200,340 16x8 mode 0 full 0 content 0 thread [0-9a-f]* pixel ff000000" "$s"
check "what the tablet reads" "+ptr +lz4 +copy" "$tmp/mac.log"
# the session ends with the app's page, then a full refresh: nothing of the stream is left on the glass
awk '/1620x2160 mode 0 full 0/ { back = 1 } back && /full 1/ { ok = 1 } END { exit !ok }' "$s" || { echo "sidecar_session: no full refresh after the app's page came back"; fail=1; }
[ "$(sed 's/.*thread \([0-9a-f]*\).*/\1/' "$s" | sort -u | wc -l | tr -d ' ')" = 1 ] || { echo "sidecar_session: swaps from more than one thread"; fail=1; }
[ $fail = 0 ] && echo "sidecar_session: ok"
exit $fail
