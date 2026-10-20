#!/bin/sh
# The WebRTC chat demo (examples/webrtc-chat): its three screens in the light and the dark theme render to their recorded frame hashes
# (tests/golden/webrtc-chat/hashes.txt: mode, scheme, hash; no connection, WEBRTC_AUTOCONNECT=0), a compiled run gives the interpreter's
# hash of the first (QuickJS runs no JSX: tests/t1/webrtc.sh covers the plugin there); the scripted session in real time (two peers in the window, a line each way, a 64 KB file, the
# round-trip time, the fake microphone's level) prints the lines of session.out (sorted: the two peers race); two copies of the app meet
# in a room of signal-server.ts on a free port and hear each other. The server is stopped at the end. ZN_UPDATE_GOLDEN=1 records again.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
app=$PWD/examples/webrtc-chat; golden=$PWD/tests/golden/webrtc-chat
tmp=$(mktemp -d); server=
trap '[ -n "$server" ] && kill $server 2>/dev/null; rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1
fail=0
hash() { echo "$1" | sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p'; }
shot() {   # shot <mode> <scheme> [flags]: the frame hash of a screen, deterministic, not connected
  hash "$(cd "$app" && env ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=20 ZINC_FRAMEHASH=last WEBRTC_AUTOCONNECT=0 WEBRTC_MODE=$1 WEBRTC_SCHEME=$2 timeout 120 "$ZINC" $3 run . 2>&1)"
}
: > "$tmp/hashes"
while read -r mode scheme want; do
  got=$(shot "$mode" "$scheme")
  echo "$mode $scheme $got" >> "$tmp/hashes"
  [ "$got" = "$want" ] || { [ -n "$ZN_UPDATE_GOLDEN" ] || echo "webrtc-chat $mode $scheme: $got, recorded $want"; fail=1; }
done < "$golden/hashes.txt"
read -r mode scheme want < "$golden/hashes.txt"
got=$(shot "$mode" "$scheme" --native)
[ "$got" = "$want" ] || { echo "webrtc-chat compiled: $got, interpreter recorded $want"; fail=1; }

# the scripted session, in real time
(cd "$app" && env -u ZINC_DETERMINISTIC ZINC_FAKE_MICROPHONE=1 ZINC_FRAMES=100000 WEBRTC_DEMO=1 WEBRTC_DEMO_LOG=1 timeout 60 "$ZINC" run . 2>/dev/null) | grep -v '^zinc' | sort > "$tmp/session"

# two copies of the app in a room of the signalling server
env -u ZINC_DETERMINISTIC SIGNAL_PORT=0 timeout 120 "$ZINC" run "$app/signal-server.ts" > "$tmp/server.log" 2>/dev/null &
server=$!   # timeout passes the kill below on to zinc
port=
for i in $(seq 1 100); do port=$(sed -n 's/^signalling on ws:\/\/0.0.0.0:\([0-9]*\).*/\1/p' "$tmp/server.log"); [ -n "$port" ] && break; sleep 0.1; done
if [ -z "$port" ]; then echo "the signalling server did not start: $(cat "$tmp/server.log")"; fail=1
else
  pids=
  for who in one two; do
    (cd "$app" && env -u ZINC_DETERMINISTIC ZINC_FRAMES=100000 WEBRTC_DEMO=room WEBRTC_DEMO_LOG=1 WEBRTC_SIGNAL=ws://127.0.0.1:$port timeout 60 "$ZINC" run . 2>/dev/null > "$tmp/$who.log") &
    pids="$pids $!"
  done
  wait $pids
  for who in one two; do grep -q '^heard the other peer' "$tmp/$who.log" || { echo "room peer $who: $(grep -v '^zinc' "$tmp/$who.log" | tr '\n' ' ')"; fail=1; }; done
fi
kill $server 2>/dev/null; wait $server 2>/dev/null; server=

if [ -n "$ZN_UPDATE_GOLDEN" ]; then mkdir -p "$golden"; cp "$tmp/hashes" "$golden/hashes.txt"; cp "$tmp/session" "$golden/session.out"; echo "webrtc-chat: goldens recorded"; exit 0; fi
cmp -s "$tmp/session" "$golden/session.out" || { echo "webrtc-chat session differs:"; diff "$golden/session.out" "$tmp/session" | head -12; fail=1; }
exit $fail
