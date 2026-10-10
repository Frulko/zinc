#!/bin/sh
# The HAR of a killed program (ZN-636): `zinc run --har` rewrites the file while the program runs (whole, then renamed over it), so a program stopped by
# SIGTERM, and one stopped by SIGKILL, both leave a valid HAR 1.2 with the request they made. Skips (77) without python3.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || exit 77
tmp=$(mktemp -d); trap 'kill $server $app 2>/dev/null; rm -rf "$tmp"' EXIT
port=$(python3 tests/free_ports.py)
python3 tests/netlog_servers.py "$port" & server=$!
cat > "$tmp/prog.ts" <<'P'
// one request, then the program runs until it is killed
import { fetch } from 'zinc:net';
import * as sys from 'zinc:sys';
async function main(): Promise<void> {
  const r = await fetch(`http://127.0.0.1:${sys.args()[0]}/hello`);
  console.log('fetched', r.status);
  setInterval(() => {}, 60000);
}
main();
P
check() {   # the file is a HAR 1.2 that lists the request and its answer
  python3 - "$1" <<'P'
import json, sys
log = json.load(open(sys.argv[1]))["log"]
entries = log["entries"]
sys.exit(0 if log["version"] == "1.2" and len(entries) == 1 and entries[0]["request"]["url"].endswith("/hello") and entries[0]["response"]["status"] == 200 else 1)
P
}
sleep 1   # the server listens
fail=0
for sig in TERM KILL; do
  har="$tmp/$sig.har"
  ZINC_REALTIME=1 "$ZINC" run --har "$har" "$tmp/prog.ts" -- "$port" > "$tmp/$sig.log" 2>&1 & app=$!
  n=0; while [ $n -lt 100 ] && ! check "$har" 2>/dev/null; do sleep 0.1; n=$((n+1)); done   # the file follows the running program
  kill -0 $app 2>/dev/null || { echo "the program did not keep running: $(cat "$tmp/$sig.log")"; fail=1; }
  kill -$sig $app; wait $app 2>/dev/null
  check "$har" 2>/dev/null || { echo "SIG$sig left no valid HAR with the request: $(head -c 300 "$har" 2>/dev/null) | $(cat "$tmp/$sig.log")"; fail=1; }
done
[ $fail -eq 0 ] && echo "netlog_kill: ok (a valid HAR after SIGTERM and after SIGKILL)"
exit $fail
