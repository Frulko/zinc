#!/bin/sh
# ZN-795: `zinc monitor --udp` listens on 127.0.0.1 unless --host opens it, and prints what arrives with its control characters escaped
# (\u001b), so a datagram cannot drive the terminal (clear it, set its title, write the clipboard); a file keeps its bytes.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d)
port=$((20000 + $$ % 20000))
"$ZINC" monitor --udp "$port" > "$tmp/out" 2> "$tmp/err" &
mon=$!
trap 'kill $mon 2>/dev/null; wait $mon 2>/dev/null; rm -rf "$tmp"' EXIT
python3 - "$port" <<'PY'
import socket, sys, time
port = int(sys.argv[1])
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
time.sleep(0.4)   # the monitor binds its port
s.sendto(b'{"type":"event","payload":{"name":"x\\u001b[2J","data":"y"}}\n', ('127.0.0.1', port))
s.sendto(b'raw \x1b]0;title\x07 \xc2\x9b end\n', ('127.0.0.1', port))
time.sleep(0.3)
PY
kill $mon 2>/dev/null; wait $mon 2>/dev/null
grep -q "listening on udp://127.0.0.1:$port" "$tmp/err" || { echo "monitor_udp: not on 127.0.0.1 by default: $(cat "$tmp/err")"; fail=1; }
grep -qF 'event   x\u001b[2J  y' "$tmp/out" || { echo "monitor_udp: a JSON string's escape reached the terminal: $(od -c "$tmp/out" | head -5)"; fail=1; }
grep -qF 'raw \u001b]0;title\u0007 \u009b end' "$tmp/out" || { echo "monitor_udp: raw control characters reached the terminal: $(od -c "$tmp/out" | head -5)"; fail=1; }
if command -v lsof >/dev/null 2>&1; then   # the socket itself: bound to loopback, then opened with --host
  "$ZINC" monitor --udp "$port" --host 0.0.0.0 > /dev/null 2> "$tmp/err2" &
  mon=$!
  sleep 0.3
  lsof -nP -a -p "$mon" -iUDP 2>/dev/null | grep -q "\*:$port" || { echo "monitor_udp: --host 0.0.0.0 did not open every interface: $(lsof -nP -a -p "$mon" -iUDP 2>&1 | tail -1)"; fail=1; }
fi
"$ZINC" monitor --udp "$port" --host nowhere > /dev/null 2>&1; [ $? -eq 2 ] || { echo "monitor_udp: a bad --host is not refused"; fail=1; }
printf 'colour \033[32mgreen\033[0m\n' > "$tmp/serial.log"   # a file (a device's own log) keeps its colours
"$ZINC" monitor "$tmp/serial.log" | grep -q "$(printf '\033\\[32m')" || { echo "monitor_udp: a file lost its escape sequences"; fail=1; }
exit $fail
