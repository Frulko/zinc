#!/bin/sh
# zinc dev --device with a device of another zinc (ZINC_AGENT_ENGINE, the agent's test switch), on the loopback interface: a release of the
# same series runs the program with a note; another series is refused with the ways out (zinc device update, --force) and nothing runs;
# --force runs it anyway.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d)
name="zn-v$$" fail=0 apid='' dpid=''
bad() { echo "FAIL: $*"; fail=1; }
cleanup() { kill $dpid $apid 2>/dev/null; wait $dpid $apid 2>/dev/null; rm -rf "$tmp"; }
trap cleanup EXIT
until_grep() { n=0; while [ $n -lt 200 ] && ! grep -q -- "$1" "$2" 2>/dev/null; do sleep 0.05; n=$((n+1)); done; grep -q -- "$1" "$2" 2>/dev/null; }
series=$("$Z" --version | head -n 1 | awk '{ print $NF }' | cut -d. -f1,2)

# a device that says it runs zinc $1, paired with a new workstation
device() {
  kill $apid 2>/dev/null; wait $apid 2>/dev/null
  rm -rf "$tmp/D" "$tmp/W"
  ZINC_HOME="$tmp/D" ZINC_AGENT_ENGINE="$1" ZINC_HEADLESS=1 "$Z" agent --bind 127.0.0.1 --port 0 --no-mdns --name "$name" > "$tmp/agent.log" 2>&1 & apid=$!
  until_grep "pairing code" "$tmp/agent.log" || { echo "the agent did not start: $(cat "$tmp/agent.log")"; exit 1; }
  port=$(sed -n 's/.*listening on 127.0.0.1:\([0-9]*\).*/\1/p' "$tmp/agent.log")
  ZINC_HOME="$tmp/W" "$Z" device pair "127.0.0.1:$port" "$(sed -n 's/.*pairing code: \([0-9]*\).*/\1/p' "$tmp/agent.log")" > /dev/null || { echo "pairing failed"; exit 1; }
}

# zinc dev --device with $@ added; the log in $tmp/dev.log, the line of the program awaited, then the session ended
dev() {
  ZINC_HOME="$tmp/W" "$Z" dev "$tmp/p" --device "$name" "$@" > "$tmp/dev.log" 2>&1 & dpid=$!
  until_grep "^hello from the device" "$tmp/dev.log"; ran=$?
  kill $dpid 2>/dev/null; wait $dpid 2>/dev/null; dpid=''
  return $ran
}

mkdir -p "$tmp/p/src"
printf '{"name":"versions","entry":"src/main.ts"}\n' > "$tmp/p/zinc.json"
printf "console.log('hello from the device');\n" > "$tmp/p/src/main.ts"

device "$series.99"
dev || bad "a device of the same series did not run the program: $(cat "$tmp/dev.log")"
grep -q "runs zinc $series.99 .*one series, running anyway" "$tmp/dev.log" || bad "no note for a device of the same series: $(cat "$tmp/dev.log")"

device 9.9.0
ZINC_HOME="$tmp/W" timeout 30 "$Z" dev "$tmp/p" --device "$name" > "$tmp/dev.log" 2>&1 && bad "a device of another series was not refused: $(cat "$tmp/dev.log")"
if ! grep -q "zinc device $name update" "$tmp/dev.log" || ! grep -q -- "--force *tries anyway" "$tmp/dev.log"; then
  bad "the refusal does not give the ways out: $(cat "$tmp/dev.log")"
fi
grep -q "^hello from the device" "$tmp/dev.log" && bad "the refused program ran"
dev --force || bad "--force did not run the program: $(cat "$tmp/dev.log")"
grep -q "trying anyway (--force)" "$tmp/dev.log" || bad "--force does not say it tries anyway: $(cat "$tmp/dev.log")"

[ $fail = 0 ] && echo "ok: one series runs with a note, another is refused with the ways out, --force runs it"
exit $fail
