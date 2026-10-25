#!/bin/sh
# The debug and measuring tools through the agent (ZN-821), on the loopback interface: zinc device profile runs an installed app with the
# frame profiler and brings its summary and its trace back; zinc device bench runs one scene of tools/zbench's render suite there and writes
# its JSON here; zinc dev --device forwards the inspector of a UI program to a port of this machine, whose CDP /json/list answers.
# Skips (77) without python3.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || exit 77
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d)
D="$tmp/device" W="$tmp/work" name="zn-t$$" fail=0
dev() { ZINC_HOME="$W" timeout 120 "$Z" device "$name" "$@"; }
bad() { echo "FAIL: $*"; fail=1; }
cleanup() {
  for f in "$D"/agent/run/*.pid; do [ -e "$f" ] && kill -- "-$(head -1 "$f")" 2>/dev/null; done   # apps outlive their agent
  kill $dpid $apid 2>/dev/null; wait $dpid $apid 2>/dev/null
  rm -rf "$tmp"
}
trap cleanup EXIT
until_grep() { n=0; while [ $n -lt 300 ] && ! grep -q "$1" "$2" 2>/dev/null; do sleep 0.1; n=$((n+1)); done; grep -q "$1" "$2" 2>/dev/null; }

ZINC_HOME="$D" ZINC_HEADLESS=1 ZINC_FRAMES=100000000 "$Z" agent --bind 127.0.0.1 --port 0 --no-mdns --name "$name" > "$tmp/agent.log" 2>&1 & apid=$!
until_grep "pairing code" "$tmp/agent.log" || { echo "the agent did not start: $(cat "$tmp/agent.log")"; exit 1; }
port=$(sed -n 's/.*listening on 127.0.0.1:\([0-9]*\).*/\1/p' "$tmp/agent.log")
ZINC_HOME="$W" "$Z" device pair "127.0.0.1:$port" "$(sed -n 's/.*pairing code: \([0-9]*\).*/\1/p' "$tmp/agent.log")" > /dev/null || { echo "pairing failed"; exit 1; }

# profile: installed without a start (deploy --no-run), then run for 30 frames with the profiler; the summary and the trace come back
P="$tmp/prof"
mkdir -p "$P/src"
printf '{"name":"prof","entry":"src/main.ts"}\n' > "$P/zinc.json"
printf "import { onFrame, clear } from 'zinc:gfx';\nonFrame((dt: number) => { clear(0x3366cc); });\n" > "$P/src/main.ts"
dev deploy "$P" --no-run > "$tmp/deploy.log" 2>&1 || bad "deploy --no-run: $(cat "$tmp/deploy.log")"
dev apps | grep -q "^prof .*stopped" || bad "deploy --no-run started the app: $(dev apps)"
dev profile prof --frames 30 -o "$tmp/trace.json" > "$tmp/profile.log" 2>&1 || bad "profile: $(cat "$tmp/profile.log")"
grep -q "^zinc profile: frames=" "$tmp/profile.log" || bad "no profile summary came back: $(cat "$tmp/profile.log")"
grep -q "^trace of prof on $name: .*perfetto" "$tmp/profile.log" || bad "profile does not say where the trace is: $(cat "$tmp/profile.log")"
python3 -c 'import json, sys; t = json.load(open(sys.argv[1])); sys.exit(0 if any(e.get("name") == "zinc frame" for e in t) else 1)' "$tmp/trace.json" 2>/dev/null || bad "the trace has no frame: $(head -c 300 "$tmp/trace.json" 2>&1)"
# a second profile of an app that draws nothing writes no trace: the last one is not taken for it
printf "console.log('no frames');\n" > "$P/src/main.ts"
dev deploy "$P" --no-run > /dev/null 2>&1
dev profile prof -o "$tmp/none.json" > "$tmp/none.log" 2>&1 && bad "profile of an app without frames succeeded: $(cat "$tmp/none.log")"
grep -q "ended without a trace" "$tmp/none.log" || bad "profile without frames: $(cat "$tmp/none.log")"

# bench: one scene of the render suite, one run of a few frames, its JSON here
dev bench --scene fill_opaque --runs 1 --frames 20 --skip 2 --out "$tmp/bench.json" > "$tmp/bench.log" 2>&1 || bad "bench: $(tail -20 "$tmp/bench.log")"
python3 -c 'import json, sys; d = json.load(open(sys.argv[1])); s = d["modes"]["uncapped"]["scenes"]["fill_opaque"]; sys.exit(0 if d["device"]["id"] == "agent" and s.get("ok_runs") == 1 and s.get("frames", 0) > 0 else 1)' "$tmp/bench.json" 2>/dev/null \
  || bad "the bench JSON has no measured scene: $(head -c 600 "$tmp/bench.json" 2>&1) $(tail -10 "$tmp/bench.log")"

# zinc dev --device: the inspector of a UI program on a port of this machine, answering the DevTools protocol's /json/list
U="$tmp/ui"
mkdir -p "$U/src"
cp tests/golden/ui-style/radius.tsx "$U/src/main.tsx"
printf '{"name":"inspected","entry":"src/main.tsx"}\n' > "$U/zinc.json"
ZINC_HOME="$W" "$Z" dev "$U" --device "$name" > "$tmp/dev.log" 2>&1 & dpid=$!
until_grep "the inspector of the program on $name is on localhost:" "$tmp/dev.log" || bad "zinc dev --device did not forward the inspector: $(cat "$tmp/dev.log")"
local=$(sed -n 's/.*is on localhost:\([0-9]*\) here.*/\1/p' "$tmp/dev.log" | head -1)
list= n=0
while [ -n "$local" ] && [ $n -lt 50 ]; do   # the program may still be starting there
  list=$(python3 -c "import sys, urllib.request; sys.stdout.write(urllib.request.urlopen(sys.argv[1], timeout=5).read().decode())" "http://127.0.0.1:$local/json/list" 2>/dev/null)
  case $list in *'"webSocketDebuggerUrl"'*) break;; esac
  sleep 0.2; n=$((n+1))
done
case $list in *'"webSocketDebuggerUrl"'*) ;; *) bad "the forwarded inspector does not answer /json/list on $local: $list $(cat "$tmp/dev.log")";; esac
kill $dpid; wait $dpid 2>/dev/null; dpid=

[ $fail -eq 0 ] && echo "agent_tools: ok"
exit $fail
