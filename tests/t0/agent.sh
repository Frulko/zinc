#!/bin/sh
# The device agent (ZN-729.01, ZN-729.02) on the loopback interface, a device's home and a workstation's home side by side: discovery over
# mDNS, pairing by code (a wrong code refused, the pairing closed after three, a key the device does not know refused, a workstation
# forgotten), info, the shell (exit status, stdin, stderr apart, a terminal, eight sessions at once), push and pull of a tree (modes kept, into a directory, a name
# that leaves the destination refused). The apps and the forwarded ports are tests/t1/agent_apps.sh.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d)
D="$tmp/device" W="$tmp/work" name="zn-t$$" fail=0
trap 'kill $apid 2>/dev/null; wait $apid 2>/dev/null; rm -rf "$tmp"' EXIT
agent() { ZINC_HOME="$D" SHELL=/bin/sh "$Z" agent "$@"; }
dev() { ZINC_HOME="$W" timeout 30 "$Z" device "$@"; }
bad() { echo "FAIL: $*"; fail=1; }

ZINC_HOME="$D" SHELL=/bin/sh "$Z" agent --bind 127.0.0.1 --port 0 --name "$name" > "$tmp/agent.log" 2>&1 & apid=$!   # not through agent(): $! must be the agent
n=0; while [ $n -lt 100 ] && ! grep -q "pairing code" "$tmp/agent.log"; do sleep 0.05; n=$((n+1)); done
port=$(sed -n 's/.*listening on 127.0.0.1:\([0-9]*\).*/\1/p' "$tmp/agent.log")
id=$(sed -n 's/.* (\([0-9a-f]*\)) listening.*/\1/p' "$tmp/agent.log")
code=$(sed -n 's/.*pairing code: \([0-9]*\).*/\1/p' "$tmp/agent.log")
[ -n "$port" ] && [ -n "$code" ] && [ -n "$id" ] || { echo "the agent did not start: $(cat "$tmp/agent.log")"; exit 1; }

# discovery: the agent answers the mDNS question for _zinc._tcp, and says its pairing is open
dev list --wait 700 > "$tmp/list" 2>&1
grep -q "^$name .*pairing open" "$tmp/list" || bad "zinc device list does not show the agent with its pairing open: $(cat "$tmp/list")"

# pairing: three wrong codes close it, even for the right code after them
wrong=000000; [ "$code" = 000000 ] && wrong=111111
for i in 1 2 3; do
  out=$(dev pair "127.0.0.1:$port" $wrong 2>&1) && bad "a wrong code paired"
  case $out in *"wrong code"*) ;; *) bad "wrong code $i: $out";; esac
done
out=$(dev pair "127.0.0.1:$port" "$code" 2>&1) && bad "the right code paired after three wrong ones"
case $out in *"pairing is closed"*) ;; *) bad "after three wrong codes: $out";; esac
[ -e "$W/devices.json" ] && bad "a failed pairing left a device"

# a key the device never gave is refused
mkdir -p "$W"
printf '{"devices":[{"id":"%s","name":"%s","client":"0123456789abcdef","key":"%064d","host":"127.0.0.1","port":%s}]}\n' "$id" "$name" 0 "$port" > "$W/devices.json"
out=$(dev info 2>&1) && bad "a made-up key was accepted"
case $out in *"does not accept this workstation's key"*) ;; *) bad "made-up key: $out";; esac
rm -f "$W/devices.json"

# a new code, and the device found by its name
code=$(agent pair | sed -n 's/^pairing code: //p')
out=$(dev pair "$name" "$code" 2>&1) || bad "pairing with the right code: $out"
dev list --wait 500 | grep -q "^$name .* paired " || bad "the device is not listed as paired"
[ "$(ls -l "$W/devices.json" | cut -c1-10)" = "-rw-------" ] || bad "the workstation's keys are readable by others"
[ "$(ls -l "$D/agent/clients.json" | cut -c1-10)" = "-rw-------" ] || bad "the device's keys are readable by others"

# info
dev info > "$tmp/info" 2>&1 || bad "info: $(cat "$tmp/info")"
grep -q "^$name ($id)" "$tmp/info" && grep -q "cores" "$tmp/info" && grep -q "engine       zinc " "$tmp/info" && grep -q "memory .* free of " "$tmp/info" || bad "info lacks a line: $(cat "$tmp/info")"
dev info --json | grep -q "\"name\":\"$name\".*\"memTotal\":[1-9]" || bad "info --json"

# shell: output, stdin, stderr apart, the exit status; a terminal with -t
out=$(echo data | dev shell 'cat; echo oops >&2; exit 7' 2>"$tmp/err"); rc=$?
[ "$out" = data ] && [ $rc -eq 7 ] && [ "$(cat "$tmp/err")" = oops ] || bad "shell: out '$out' status $rc stderr '$(cat "$tmp/err")'"
out=$(dev shell 'yes | head -1' 2>&1)
[ "$out" = y ] || bad "a pipeline closed early complains (SIGPIPE left ignored in the device's programs): $out"
out=$(dev shell -t tty < /dev/null | tr -d '\r')
case $out in */dev/*) ;; *) bad "shell -t is not a terminal: $out";; esac   # the terminal echoes the end of input (^D) before it

# eight sessions at once: each thread of the agent has its own, and they share one TLS library
pids=; for i in 1 2 3 4 5 6 7 8; do dev shell "echo session-$i" > "$tmp/par.$i" 2>&1 & pids="$pids $!"; done; wait $pids
for i in 1 2 3 4 5 6 7 8; do [ "$(cat "$tmp/par.$i")" = "session-$i" ] || bad "parallel session $i: $(cat "$tmp/par.$i")"; done

# files: a tree there and back, modes kept; a file into a directory; a sender that names a file outside the destination
mkdir -p "$tmp/src/sub/deep" "$tmp/src/empty-dir"
printf '#!/bin/sh\necho tool\n' > "$tmp/src/tool.sh"; chmod 755 "$tmp/src/tool.sh"
: > "$tmp/src/sub/empty"; head -c 300000 /dev/urandom > "$tmp/src/sub/deep/blob"
out=$(dev push "$tmp/src" "$tmp/remote" 2>&1) || bad "push: $out"
diff -r "$tmp/src" "$tmp/remote" > /dev/null && [ -x "$tmp/remote/tool.sh" ] || bad "the pushed tree differs ($out)"
out=$(dev pull "$tmp/remote" "$tmp/back" 2>&1) || bad "pull: $out"
diff -r "$tmp/src" "$tmp/back" > /dev/null && [ -x "$tmp/back/tool.sh" ] || bad "the pulled tree differs ($out)"
dev push "$tmp/src/tool.sh" "$tmp/remote/sub" > /dev/null 2>&1 && cmp -s "$tmp/src/tool.sh" "$tmp/remote/sub/tool.sh" || bad "push of a file into a directory"
out=$(ZINC_AGENT_FAULT=escape dev push "$tmp/src/tool.sh" "$tmp/jail/in" 2>&1) && bad "a name outside the destination was accepted"
case $out in *"leaves the destination"*) ;; *) bad "escaping name: $out";; esac
[ ! -e "$tmp/jail/escaped" ] && [ ! -e "$tmp/escaped" ] || bad "a file was written outside the destination"
dev pull "$tmp/nothing-here" "$tmp/x" > /dev/null 2>&1 && bad "pull of a missing file succeeded"

# the device forgets the workstation: its key stops working at once
agent forget "$(agent clients | cut -d' ' -f1)" || bad "zinc agent forget"
out=$(dev info 2>&1) && bad "a forgotten workstation still gets in"
case $out in *"does not accept this workstation's key"*) ;; *) bad "after forget: $out";; esac

[ $fail -eq 0 ] && echo "agent: ok (port $port)"
exit $fail
