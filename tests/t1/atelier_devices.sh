#!/bin/sh
# The devices panel of Zinc Atelier (ZN-729.06): the app runs headless on one scripted session against an agent on the loopback interface
# (no mDNS: the device is reached by its address, and the list waits for no answer of the network, so a real agent nearby is not in it).
#   the panel opens on an empty list and says how to start; a wrong code is said in plain words; the right code, typed in its field, pairs:
#   the device is listed and Run goes to it; its figures arrive every second; Run installs and starts the sketch there and its lines are in the console; Stop ends
#   it on the device. Tools > Open the Inspector with nothing running starts the sketch again in debug: the deploy that puts the inspector in
#   front (ZN-734). The transfer's progress is a line of the console and the status line. The golden is the window at the end, compared over the panel without its right column (addresses and figures, which
#   change with the machine and the moment: the session's own lines prove them).
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d)
D="$tmp/device" W="$tmp/work" fail=0
# the workstation's home is new (its paired devices are the test's own) but for the pinned tools and the plugin cache, which Atelier's
# native plugins need: without them a run outside tests/run (which names the pinned zig) would download a compiler, and any run build them
H=${ZINC_HOME:-$HOME/.zinc}
mkdir -p "$W"; for d in toolchains cache; do [ -e "$H/$d" ] && ln -s "$H/$d" "$W/$d"; done
bad() { echo "atelier devices: $*"; fail=1; }
cleanup() {
  for f in "$D"/agent/run/*.pid; do [ -e "$f" ] && kill -- "-$(head -1 "$f")" 2>/dev/null; done   # apps outlive their agent
  kill $apid 2>/dev/null; wait $apid 2>/dev/null
  rm -rf "$tmp"
}
trap cleanup EXIT

# the device keeps the real clock: with the runner's ZINC_DETERMINISTIC its apps would run on the virtual one, and the sketch's timer
# would fire without a pause (thousands of lines, a whole core)
env -u ZINC_DETERMINISTIC ZINC_HOME="$D" "$Z" agent --bind 127.0.0.1 --port 0 --no-mdns --name bench > "$tmp/agent.log" 2>&1 & apid=$!
n=0; while [ $n -lt 100 ] && ! grep -q "pairing code" "$tmp/agent.log"; do sleep 0.1; n=$((n+1)); done
port=$(sed -n 's/.*listening on 127.0.0.1:\([0-9]*\).*/\1/p' "$tmp/agent.log")
code=$(sed -n 's/.*pairing code: \([0-9]*\).*/\1/p' "$tmp/agent.log")
[ -n "$port" ] && [ -n "$code" ] || { echo "the agent did not start: $(cat "$tmp/agent.log")"; exit 1; }
wrong=$(printf '%06d' $(( (1$code + 1) % 1000000 )))   # 1 before the code: one that starts with 0 is not an octal number

mkdir -p "$tmp/blink"
printf "console.log('Hello from the device');\nlet n = 0;\nsetInterval(() => { n++; console.log('tick ' + n); }, 200);\n" > "$tmp/blink/main.ts"
# the wrong code goes through the form's own function; the right one is typed (frames 8 to 12): a press in the code field, its text
# selected, the code, Enter. The address is still in its field, as for someone who mistyped the code
cat > "$tmp/session" <<EOF
2 devices
3 wait:No device found yet
4 pair:127.0.0.1:$port $wrong
5 wait:Wrong code
14 wait:bench Connected
15 run
16 wait:tick 2
17 wait:blink running
18 stop
19 wait:blink stopped
20 wait:Stopped
21 inspector
22 wait:Debugging on bench
23 wait:blink running
24 stop
25 wait:blink stopped
26 wait:Stopped
EOF
printf '%s\n' "8 move 954 364" "8 down" "9 up" "10 key a meta" "11 text $code" "12 key Enter" > "$tmp/keys"
ZINC_HOME="$W" ZINC_ATELIER_HOME="$tmp/book" ZINC_ATELIER_ECHO=1 ZINC_ATELIER_BROWSE=0 ZINC_ATELIER_SCRIPT="$tmp/session" ZINC_INPUT="$tmp/keys" ZINC_SYSTEM_LOG=/dev/null \
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 ZINC_SCALE=1 ZINC_SHOT="$tmp/panel.png" ZINC_SHOT_FRAMES=30 \
  timeout 50 "$Z" run app/atelier -- "$tmp/blink" >"$tmp/out" 2>"$tmp/err" || bad "the session failed: $(tail -2 "$tmp/out") $(tail -c 300 "$tmp/err")"
has() { grep -Eq -- "$1" "$tmp/out" || bad "$2: $(grep -E -- "$3" "$tmp/out" | tail -3)"; }
grep -q '^atelier script:' "$tmp/out" && bad "the session waited in vain: $(grep '^atelier script:' "$tmp/out" | head -3)"
has '^\[devices\] list: none$' "the first list is not empty" '^\[devices\] list'
has '^\[devices\] Wrong code: type the 6 digits the device shows' "a wrong code is not said in plain words" '^\[devices\]'
has '^\[devices\] Paired with bench' "the right code did not pair" '^\[devices\]'
has '^\[devices\] list: bench \(paired' "the paired device is not listed" '^\[devices\] list'
has '^\[console\] \$ zinc device bench deploy \. --name blink$' "Run did not go to the device" '^\[console\] \$'
has '^\[console\] installed blink on bench' "the sketch was not installed on the device" '^\[console\]'
has '^\[status\] Running on bench$' "the status line does not say where the sketch runs" '^\[status\]'
has '^\[console\] Hello from the device$' "the sketch's output is not in the console" '^\[console\]'
has '^\[console\] tick 2$' "the followed log does not arrive in the console" '^\[console\]'
has '^\[status\] Stopped$' "Stop did not end the run" '^\[status\]'
# what the deploy says: the note of what is sent is a step of the console (not the command's error), the transfer its progress, there and on the status line
has '^\[console\]   device  +bench is macos .*: packing a \.zapp$' "the note of the deploy is not a step line of the console" '^\[console\]  '
has '^\[console\]   send  +100%  [0-9]+ [KM]iB of [0-9]+ [KM]iB  [0-9.]+ MiB/s' "the transfer's progress is not in the console" '^\[console\]  '
has '^\[status\] Sending to bench: 100%, [0-9]+ [KM]iB of [0-9]+ [KM]iB, [0-9.]+ MiB/s' "the transfer's progress is not on the status line" '^\[status\]'
# the inspector asked with no debug run: the sketch starts again in debug, deployed with the inspector in front
has '^\[console\] \$ zinc device bench deploy \. --name blink --inspect$' "Open the Inspector did not start a debug run on the device" '^\[console\] \$'
has '^\[status\] Debugging on bench$' "the status line does not say the sketch is debugged on the device" '^\[status\]'
grep -q "import 'zinc:devtools'" "$tmp/out" && bad "the console still asks for an import: $(grep devtools "$tmp/out" | head -2)"
# the figures: a sample a second, so several over the session; the sketch is seen running, then stopped
figure='^\[devices\] bench: load [0-9]+\.[0-9]+, memory [0-9.]+ [GM]iB free of [0-9.]+ [GM]iB, temperature '
[ "$(grep -Ec "$figure" "$tmp/out")" -ge 2 ] || bad "the figures are not renewed: $(grep -Ec "$figure" "$tmp/out") sample(s)"
has "${figure}.*apps blink running" "the figures do not show the sketch running" '^\[devices\] bench:'
has "${figure}.*apps blink stopped" "the figures do not show the sketch stopped" '^\[devices\] bench:'
ZINC_HOME="$W" timeout 20 "$Z" device apps > "$tmp/apps" 2>&1
grep -q '^blink .*stopped' "$tmp/apps" || bad "the sketch still runs on the device after Stop: $(cat "$tmp/apps")"
g=tests/golden/atelier/devices-30.png
# the page's left part (the devices, the note, what is shown of the device, its apps), then the code field and the Pair button
tools/pngdiff "$tmp/panel-30.png" "$g" --crop 432,150,425,420 >/dev/null && tools/pngdiff "$tmp/panel-30.png" "$g" --crop 900,340,165,48 >/dev/null \
  || bad "the Devices page differs from $g"
[ -n "$ATELIER_KEEP" ] && cp "$tmp/out" "$ATELIER_KEEP.out" && cp "$tmp/panel-30.png" "$ATELIER_KEEP"   # what this run said and its frame, to look at them or to renew the golden
exit $fail
