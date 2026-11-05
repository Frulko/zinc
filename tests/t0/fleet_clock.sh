#!/bin/sh
# zinc:fleet: a clock served by another process, this one's five seconds wrong: the wall clock of the machine, which both share, says what the offset must be. tests/run sets a virtual clock: this test needs the real one.
cd "$(dirname "$0")/../.." || exit 2
export ZINC_DETERMINISTIC=0
tmp=$(mktemp -d); trap 'kill $server 2>/dev/null; rm -rf "$tmp"' EXIT
port=$(python3 -c "import socket;s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);s.bind(('127.0.0.1',0));print(s.getsockname()[1]);s.close()")
cat >"$tmp/server.ts" <<TS
import { serveClock } from 'zinc:fleet';
console.log(\`\${Date.now() - performance.now()}\`);
serveClock($port);
// A loop that reads its sockets late, like a window's: the answers must not count that wait.
setInterval(() => { const start = performance.now(); while (performance.now() - start < 30) {} }, 1);
setTimeout(() => {}, 20000);
TS
cat >"$tmp/client.ts" <<TS
import { joinClock, FleetClock } from 'zinc:fleet';
import { exit } from 'zinc:sys';
joinClock('127.0.0.1', $port).then((clock: FleetClock) => {
  setTimeout(() => {
    console.log(\`\${clock.synced} \${clock.rtt} \${clock.offset} \${Date.now() - performance.now()}\`);
    exit(0);
  }, 700);
});
TS
"$ZINC" run --interp "$tmp/server.ts" >"$tmp/server.log" 2>&1 & server=$!
n=0; while [ $n -lt 300 ] && [ ! -s "$tmp/server.log" ]; do sleep 0.1; n=$((n+1)); done
out=$(ZINC_FLEET_SKEW_US=5000000 timeout 30 "$ZINC" run --interp "$tmp/client.ts" 2>&1 | tail -1)
python3 - "$out" "$(tail -1 "$tmp/server.log")" <<'PY' || { echo "fleet clock: $out; server: $(tail -c 300 "$tmp/server.log")"; exit 1; }
import sys
synced, rtt, offset, base = sys.argv[1].split()
want = float(base) - float(sys.argv[2]) - 5000   # shared time - this clock: (wall - server base) - (wall - base + 5000)
sys.exit(0 if synced == "true" and float(rtt) < 10 and abs(float(offset) - want) < 20 else 1)
PY
# The native socket (ZINC_NATIVE=real, what a program with plugins runs) stamps its datagrams too.
cat >"$tmp/age.ts" <<TS
import { udp, Datagram, UdpSocket } from 'zinc:socket';
import { exit } from 'zinc:sys';
udp(0, '127.0.0.1').then((socket: UdpSocket) => {
  socket.onMessage((m: Datagram) => { console.log(\`age \${m.age}\`); exit(0); });
  socket.send('127.0.0.1', socket.port, 'hi');
  const start = performance.now();
  while (performance.now() - start < 60) {}
});
TS
# QuickJS too, whose time must move inside a turn (the program waits on it).
check_age() {
  age=$(timeout 60 "$@" 2>/dev/null | tail -1)
  python3 -c "import sys; sys.exit(0 if 50 < float(sys.argv[1].split()[1]) < 1000 else 1)" "$age" || { echo "datagram age ($*): $age"; exit 1; }
}
check_age "$ZINC" run "$tmp/age.ts"
ZINC_NATIVE=real check_age "$ZINC" run "$tmp/age.ts"
check_age "$ZINC" run "$tmp/age.ts" --engine quickjs
