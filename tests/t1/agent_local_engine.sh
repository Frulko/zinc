#!/bin/sh
# zinc device update --local (ZN-818), on the loopback interface: a package of an engine sent to the agent runs it (the agent starts again
# in place on it, "local engine"), --remove brings the installed one back, and an engine that cannot serve is set aside at the next start
# of the service (here: the agent started again by hand). The agent says it is a Linux machine (ZINC_AGENT_AS). Skips (77) without python3.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || exit 77
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d)
D="$tmp/device" W="$tmp/work" fail=0
cleanup() { kill $apid 2>/dev/null; wait $apid 2>/dev/null; [ -n "$KEEP" ] && cp "$tmp/agent.log" "$KEEP"; rm -rf "$tmp"; }
trap cleanup EXIT
count() { grep -c "$1" "$tmp/agent.log" 2>/dev/null; }
until_n() { n=0; while [ $n -lt 300 ] && [ "$(count "$1")" -lt "$2" ]; do sleep 0.05; n=$((n+1)); done; [ "$(count "$1")" -ge "$2" ]; }
port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
agent() { ZINC_HOME="$D" ZINC_AGENT_AS="linux x86_64 desktop" "$Z" agent --bind 127.0.0.1 --port "$port" --no-mdns --name local >> "$tmp/agent.log" 2>&1 & apid=$!; }
agent
until_n "pairing code" 1 || { echo "the agent did not start: $(cat "$tmp/agent.log")"; exit 1; }
ZINC_HOME="$W" "$Z" device pair "127.0.0.1:$port" "$(sed -n 's/.*pairing code: \([0-9]*\).*/\1/p' "$tmp/agent.log" | head -1)" > /dev/null || { echo "pairing failed"; exit 1; }

# a package as tools/build-linux makes it: one directory with bin/zinc
mkdir -p "$tmp/pkg/zinc-9.9.9-linux-x86_64/bin"
cp "$Z" "$tmp/pkg/zinc-9.9.9-linux-x86_64/bin/zinc"
tar -czf "$tmp/zinc.tar.gz" -C "$tmp/pkg" zinc-9.9.9-linux-x86_64
out=$(ZINC_HOME="$W" "$Z" device local update --local "$tmp/zinc.tar.gz" 2>&1) || { echo "update --local: $out"; fail=1; }
case $out in *"(local build) runs local's agent"*) ;; *) echo "update --local said: $out"; fail=1;; esac
until_n "listening on .*, local engine" 1 || { echo "the agent did not start again on the local engine: $(cat "$tmp/agent.log")"; fail=1; }
info=$(ZINC_HOME="$W" "$Z" device local info 2>&1)
[ -e "$D/agent/engine.trial" ] && { echo "the local engine serves, its trial mark is still there"; fail=1; }

out=$(ZINC_HOME="$W" "$Z" device local update --local --remove 2>&1) || { echo "--remove: $out"; fail=1; }
until_n "listening on" 3 || { echo "the agent did not start again: $(cat "$tmp/agent.log")"; fail=1; }
tail -1 "$tmp/agent.log" | grep -q "local engine" && { echo "after --remove the local engine still runs: $(tail -3 "$tmp/agent.log")"; fail=1; }
[ -d "$D/agent/engine" ] && { echo "--remove left the engine"; fail=1; }

# an engine that answers --version but cannot serve: the agent hands over, it ends; the next start sets it aside
mkdir -p "$tmp/bad/zinc-0.0.1-linux-x86_64/bin"
printf '#!/bin/sh\n[ "$1" = --version ] && { echo "zinc-next 0.0.1"; exit 0; }\nexit 3\n' > "$tmp/bad/zinc-0.0.1-linux-x86_64/bin/zinc"
chmod +x "$tmp/bad/zinc-0.0.1-linux-x86_64/bin/zinc"
tar -czf "$tmp/bad.tar.gz" -C "$tmp/bad" zinc-0.0.1-linux-x86_64
ZINC_HOME="$W" "$Z" device local update --local "$tmp/bad.tar.gz" > /dev/null 2>&1
n=0; while [ $n -lt 100 ] && kill -0 $apid 2>/dev/null; do sleep 0.05; n=$((n+1)); done
kill -0 $apid 2>/dev/null && { echo "the agent did not hand over to the broken engine"; fail=1; kill $apid; }
wait $apid 2>/dev/null
agent   # what the service does
until_n "the local engine did not start" 1 || { echo "the failed engine was not set aside: $(tail -5 "$tmp/agent.log")"; fail=1; }
until_n "listening on" 4 || { echo "the installed agent does not serve after the failed engine: $(tail -5 "$tmp/agent.log")"; fail=1; }
[ -d "$D/agent/engine.failed" ] || { echo "the failed engine is not kept aside"; fail=1; }

[ $fail -eq 0 ] && echo "agent_local_engine: ok"
exit $fail
