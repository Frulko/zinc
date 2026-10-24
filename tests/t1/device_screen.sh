#!/bin/sh
# zinc device screen, on the loopback interface: the agent asks the program on the screen (its ZINC_SHOT_REQUEST, which the programs it
# starts inherit and a Zinc image's display session exports) for the frame it shows, idle or not, and the workstation receives it as a PNG;
# with nothing on the screen it says so instead of waiting. Skips (77) without python3.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || exit 77
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d)
D="$tmp/device" W="$tmp/work" fail=0
cleanup() { kill $apid $ppid 2>/dev/null; wait $apid $ppid 2>/dev/null; rm -rf "$tmp"; }
trap cleanup EXIT
until_grep() { n=0; while [ $n -lt 200 ] && ! grep -q "$1" "$2" 2>/dev/null; do sleep 0.05; n=$((n+1)); done; grep -q "$1" "$2" 2>/dev/null; }

ZINC_HOME="$D" "$Z" agent --bind 127.0.0.1 --port 0 --no-mdns --name screen > "$tmp/agent.log" 2>&1 & apid=$!
until_grep "pairing code" "$tmp/agent.log" || { echo "the agent did not start: $(cat "$tmp/agent.log")"; exit 1; }
port=$(sed -n 's/.*listening on 127.0.0.1:\([0-9]*\).*/\1/p' "$tmp/agent.log")
ZINC_HOME="$W" "$Z" device pair "127.0.0.1:$port" "$(sed -n 's/.*pairing code: \([0-9]*\).*/\1/p' "$tmp/agent.log")" > /dev/null || { echo "pairing failed"; exit 1; }

out=$(ZINC_HOME="$W" "$Z" device screen "$tmp/none.png" 2>&1) && { echo "a screen with no program answered: $out"; fail=1; }
case $out in *"no program on the screen answered"*) ;; *) echo "nothing on the screen: $out"; fail=1;; esac

# the program on the screen: what the display session starts, with the request the agent writes
ZINC_SHOT_REQUEST="$D/agent/run/shot.request" ZINC_HEADLESS=1 ZINC_REALTIME=1 ZINC_FRAMES=100000000 ZINC_SIZE=64x48 \
  "$Z" run tests/data/screen/main.ts > "$tmp/program.log" 2>&1 & ppid=$!
sleep 1
ZINC_HOME="$W" "$Z" device screen "$tmp/screen.png" > "$tmp/screen.log" 2>&1 || { echo "zinc device screen: $(cat "$tmp/screen.log" "$tmp/program.log")"; fail=1; }
px=$(python3 - "$PWD" "$tmp/screen.png" 2>&1 <<'PY'
import sys, importlib.machinery, importlib.util
l = importlib.machinery.SourceFileLoader("pd", sys.argv[1] + "/tools/pngdiff"); s = importlib.util.spec_from_loader("pd", l); m = importlib.util.module_from_spec(s); l.exec_module(m)
w, h, b, d = m.dec(sys.argv[2]); i = (w * (h // 2) + w // 2) * b
print(w, h, d[i], d[i + 1], d[i + 2])
PY
)
[ "$px" = "64 48 51 102 204" ] || { echo "the captured frame should be 64x48 of 51 102 204, got '$px'"; fail=1; }
[ ! -s "$D/agent/run/shot.request" ] || { echo "the request was not emptied"; fail=1; }

[ $fail -eq 0 ] && echo "device_screen: ok"
exit $fail
