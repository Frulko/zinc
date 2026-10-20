#!/bin/sh
# zinc:link (ZN-756) with two programs on this machine (tests/data/link): a wrong code refused at an address typed by hand (and counted by
# the advertiser), the advertiser found over DNS-SD with its pairing open, the right code paired, JSON and bytes both ways; then both restarted with no code: the
# stored keys open the session, and after the advertiser restarts on another port the same channel reconnects by itself (found again by
# discovery) and talks again. The key files are mode 0600.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d)
export LINK_SERVICE="zn-test-$$"   # its own service: two runs on one network never meet
fail=0
bad() { echo "FAIL: $*"; fail=1; }
trap 'kill $spid $cpid 2>/dev/null; wait $spid $cpid 2>/dev/null; rm -rf "$tmp"' EXIT
until_grep() { n=0; while [ $n -lt 300 ] && ! grep -q "$1" "$2" 2>/dev/null; do sleep 0.1; n=$((n+1)); done; grep -q "$1" "$2" 2>/dev/null; }
# real time: the channel's retries and the questions of discovery are timers (tests/run exports ZINC_DETERMINISTIC)
run() { LINK_STORE="$tmp/$1.keys" ZINC_REALTIME=1 timeout 60 "$Z" run "tests/data/link/$1.ts" -- $2 $3; }
# a simple command in the background, so $! is the program itself (killed below to restart it)
server() {
  LINK_STORE="$tmp/server.keys" ZINC_REALTIME=1 "$Z" run tests/data/link/server.ts -- $1 > "$tmp/server$2.log" 2>&1 & spid=$!
  until_grep "^ready" "$tmp/server$2.log" || { echo "the advertiser did not start: $(cat "$tmp/server$2.log")"; exit 1; }
}

server pair 1
code=$(sed -n 's/^ready port [0-9]* code \([0-9]*\).*/\1/p' "$tmp/server1.log")
[ -n "$code" ] || { echo "no code: $(cat "$tmp/server1.log")"; exit 1; }
wrong=000000; [ "$code" = 000000 ] && wrong=111111

port=$(sed -n 's/^ready port \([0-9]*\).*/\1/p' "$tmp/server1.log")
LINK_ADDR="127.0.0.1:$port" run client pair $wrong > "$tmp/wrong.log" 2>&1   # the address typed by hand
unset LINK_ADDR   # an assignment before a function stays in the shell
grep -q "^refused zinc:link: wrong code" "$tmp/wrong.log" || bad "a wrong code was not refused: $(cat "$tmp/wrong.log")"
until_grep "^pairing try 1" "$tmp/server1.log" || bad "the advertiser did not count the wrong code: $(cat "$tmp/server1.log")"

run client pair "$code" > "$tmp/pair.log" 2>&1 || bad "pairing with the right code: $(cat "$tmp/pair.log")"
grep -q "^found Tablet pairing" "$tmp/pair.log" || bad "the advertiser was not found with its pairing open: $(cat "$tmp/pair.log")"
grep -q "^paired Tablet" "$tmp/pair.log" || bad "the client did not pair: $(cat "$tmp/pair.log")"
grep -q "^message echo 2" "$tmp/pair.log" || bad "no JSON answer: $(cat "$tmp/pair.log")"
grep -q "^bytes 8 250,3,2,1" "$tmp/pair.log" || bad "no bytes answer: $(cat "$tmp/pair.log")"
grep -q "^paired Client" "$tmp/server1.log" && grep -q "^got hi 1" "$tmp/server1.log" || bad "the advertiser's side: $(cat "$tmp/server1.log")"
for f in server client; do [ "$(ls -l "$tmp/$f.keys" | cut -c1-10)" = "-rw-------" ] || bad "$f.keys is readable by others"; done

# both restarted: no code, the stored keys; the advertiser restarts again under the open channel, on another port
kill $spid; wait $spid 2>/dev/null
server '' 2
run client again > "$tmp/again.log" 2>&1 & cpid=$!
until_grep "^round 1" "$tmp/again.log" || bad "no session with the stored key: $(cat "$tmp/again.log")"
kill $spid; wait $spid 2>/dev/null
server '' 3
wait $cpid; rc=$?
[ $rc -eq 0 ] && grep -q "^round 2" "$tmp/again.log" && grep -q "^message echo 12" "$tmp/again.log" || bad "the channel did not reconnect after the restart (status $rc): $(cat "$tmp/again.log")"
grep -q "^accept Client" "$tmp/server3.log" || bad "the restarted advertiser did not accept the client: $(cat "$tmp/server3.log")"
grep -q "pairing" "$tmp/server2.log" "$tmp/server3.log" && bad "a pairing happened without a code"
exit $fail
