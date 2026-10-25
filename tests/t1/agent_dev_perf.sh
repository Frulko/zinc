#!/bin/sh
# zinc dev --device --perf (ZN-819), on the loopback interface: the program on the device starts with the performance panel
# (ZINC_PERF_HUD=1 in its environment, read with ps) and the start is told phase by phase up to its first frame there (ZN-824); --live starts zinc device <d> screen --live beside the session and ends it with
# the session; --live without --device is refused with the way out.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d)
D="$tmp/device" W="$tmp/work" name="zn-p$$" fail=0
cleanup() { kill $dpid $apid 2>/dev/null; wait $dpid $apid 2>/dev/null; [ -n "$KEEP" ] && cp "$tmp/dev.log" "$KEEP"; rm -rf "$tmp"; }
trap cleanup EXIT
until_grep() { n=0; while [ $n -lt 200 ] && ! grep -q "$1" "$2" 2>/dev/null; do sleep 0.05; n=$((n+1)); done; grep -q "$1" "$2" 2>/dev/null; }

ZINC_HOME="$D" ZINC_HEADLESS=1 ZINC_REALTIME=1 ZINC_FRAMES=100000000 "$Z" agent --bind 127.0.0.1 --port 0 --no-mdns --name "$name" > "$tmp/agent.log" 2>&1 & apid=$!
until_grep "pairing code" "$tmp/agent.log" || { echo "the agent did not start: $(cat "$tmp/agent.log")"; exit 1; }
port=$(sed -n 's/.*listening on 127.0.0.1:\([0-9]*\).*/\1/p' "$tmp/agent.log")
ZINC_HOME="$W" "$Z" device pair "127.0.0.1:$port" "$(sed -n 's/.*pairing code: \([0-9]*\).*/\1/p' "$tmp/agent.log")" > /dev/null || { echo "pairing failed"; exit 1; }

P="$tmp/perfd"
mkdir -p "$P/src"
printf '{"name":"perfd","entry":"src/main.ts"}\n' > "$P/zinc.json"
cat > "$P/src/main.ts" <<'TS'
import { onFrame, clear } from 'zinc:gfx';
console.log('ready');
onFrame((dt: number) => { clear(0x3366cc); });
TS
ZINC_HOME="$W" "$Z" dev "$P" --device "$name" --perf > "$tmp/dev.log" 2>&1 & dpid=$!
until_grep "^ready" "$tmp/dev.log" || { echo "the project did not start on the device: $(cat "$tmp/dev.log")"; exit 1; }
pid=$(pgrep -f "$D/agent/dev/.*/program.zbc" | head -1)
[ -n "$pid" ] || { echo "no program of the session on the device"; exit 1; }
ps eww -p "$pid" | grep -q "ZINC_PERF_HUD=1" || { echo "the program on the device has no ZINC_PERF_HUD=1"; fail=1; }
ps eww -p "$pid" | grep -q "ZINC_DEV_BAR=1" || { echo "the program on the device has no ZINC_DEV_BAR=1 (its dev bar)"; fail=1; }
# the startup timeline (ZN-824): the workstation's phases, the device's steps up to its first frame, the total
until_grep "on the screen of $name .* after the save" "$tmp/dev.log" || { echo "no total of the start: $(cat "$tmp/dev.log")"; fail=1; }
grep -q "zinc dev: packed here in .*, sent in .*, started on $name" "$tmp/dev.log" || { echo "no phases of the start: $(cat "$tmp/dev.log")"; fail=1; }
grep -q "frame *first frame on the screen" "$tmp/dev.log" || { echo "no first-frame step from the device: $(cat "$tmp/dev.log")"; fail=1; }
kill $dpid; wait $dpid 2>/dev/null

ZINC_HOME="$W" ZINC_HEADLESS=1 "$Z" dev "$P" --device "$name" --live > "$tmp/live.log" 2>&1 & dpid=$!
until_grep "^ready" "$tmp/live.log" || { echo "the --live session did not start: $(cat "$tmp/live.log")"; exit 1; }
n=0; while [ $n -lt 60 ] && ! pgrep -f "device $name screen --live" > /dev/null; do sleep 0.05; n=$((n+1)); done
pgrep -f "device $name screen --live" > /dev/null || { echo "no live viewer beside the session: $(cat "$tmp/live.log")"; fail=1; }
kill $dpid; wait $dpid 2>/dev/null; sleep 0.3
pgrep -f "device $name screen --live" > /dev/null && { echo "the live viewer outlived the session"; pkill -f "device $name screen --live"; fail=1; }

# the dev bar's Restart (ZN-822): the program ends with code 75 and the agent starts it again in the same session
R="$tmp/restartd"
mkdir -p "$R/src"
printf '{"name":"restartd","entry":"src/main.ts"}\n' > "$R/zinc.json"
printf "import { exit } from 'zinc:sys';\nconsole.log('started');\nexit(75);\n" > "$R/src/main.ts"
ZINC_HOME="$W" "$Z" dev "$R" --device "$name" > "$tmp/restart.log" 2>&1 & dpid=$!
until_grep "restarted from the dev bar" "$tmp/restart.log" || { echo "exit 75 was not restarted: $(cat "$tmp/restart.log")"; fail=1; }
grep -q "program exited (75)" "$tmp/restart.log" && { echo "exit 75 ended the session's program: $(cat "$tmp/restart.log")"; fail=1; }
kill $dpid; wait $dpid 2>/dev/null

out=$(ZINC_HOME="$W" "$Z" dev "$P" --live 2>&1) && { echo "--live without --device ran: $out"; fail=1; }
case $out in *"goes with --device"*) ;; *) echo "--live without --device: $out"; fail=1;; esac

[ $fail -eq 0 ] && echo "agent_dev_perf: ok"
exit $fail
