#!/bin/sh
# zinc:osc (ZN-085): loopback send/listen, then bundles, timetags and malformed datagrams from an outside sender.
ZINC=${ZINC:-build/zinc}
"$ZINC" run tests/golden/host/osc.ts 2>&1 | diff -q - tests/golden/host/osc.out >/dev/null || { echo "zinc:osc loopback output differs"; exit 1; }
out=$(mktemp)
"$ZINC" run tests/golden/host/osc_listen.ts >"$out" 2>&1 &
pid=$!
python3 - <<'PY'
import socket, struct, time
def s(x): b = x.encode() + b'\0'; return b + b'\0' * (-len(b) % 4)
def msg(addr, tags, body=b''): return s(addr) + s(',' + tags) + body
def bundle(*els): return s('#bundle').ljust(8, b'\0')[:8] + struct.pack('>Q', 1) + b''.join(struct.pack('>i', len(e)) + e for e in els)
u = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
time.sleep(0.5)
send = lambda d: u.sendto(d, ('127.0.0.1', 19322))
send(b'junk')                                   # no address: dropped
send(s('/cut') + s(',s'))                       # string argument missing: still a message with no arguments
send(bundle(msg('/x', 'TFd', struct.pack('>d', 2.5)), bundle(msg('/y', 'hrb', struct.pack('>q', -5) + bytes([1, 2, 3, 4]) + struct.pack('>i', 3) + b'abc\0') + b'')))
send(msg('/z', 'sN', s('end')))
PY
wait $pid
diff -u - "$out" <<'EXP' || { echo "zinc:osc bundle decoding differs"; rm -f "$out"; exit 1; }
/cut [] []
/x [1,0,2.5] []
/y [-5,1,2,3,4] []
/z [] ["end"]
EXP
rm -f "$out"
