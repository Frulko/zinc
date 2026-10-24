#!/bin/sh
# zinc device screen, on the loopback interface: the agent asks the program on the screen (its ZINC_SHOT_REQUEST, which the programs it
# starts inherit and a Zinc image's display session exports) for the frame it shows, idle or not, and the workstation receives it as a PNG;
# with nothing on the screen it says so instead of waiting. Skips (77) without python3.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || exit 77
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d)
D="$tmp/device" W="$tmp/work" fail=0
cleanup() { kill $apid $ppid 2>/dev/null; wait $apid $ppid 2>/dev/null; rm -rf "$tmp"; }
trap cleanup EXIT
until_grep() { n=0; while [ $n -lt 200 ] && ! grep -q "$1" "$2" 2>/dev/null; do sleep 0.05; n=$((n+1)); done; grep -q "$1" "$2" 2>/dev/null; }

ZINC_HOME="$D" "$Z" agent --bind 127.0.0.1 --port 0 --no-mdns --name screen > "$tmp/agent.log" 2>&1 & apid=$!
until_grep "pairing code" "$tmp/agent.log" || { echo "the agent did not start: $(cat "$tmp/agent.log")"; exit 1; }
port=$(sed -n 's/.*listening on 127.0.0.1:\([0-9]*\).*/\1/p' "$tmp/agent.log")
ZINC_HOME="$W" "$Z" device pair "127.0.0.1:$port" "$(sed -n 's/.*pairing code: \([0-9]*\).*/\1/p' "$tmp/agent.log")" > /dev/null || { echo "pairing failed"; exit 1; }

out=$(ZINC_HOME="$W" "$Z" device screen "$tmp/none.png" 2>&1) && { echo "a screen with no program answered: $out"; fail=1; }
case $out in *"no program on the screen answered"*) ;; *) echo "nothing on the screen: $out"; fail=1;; esac

# the program on the screen: what the display session starts, with the request the agent writes
ZINC_SHOT_REQUEST="$D/agent/run/shot.request" ZINC_HEADLESS=1 ZINC_REALTIME=1 ZINC_FRAMES=100000000 ZINC_SIZE=64x48 \
  "$Z" run tests/data/screen/main.ts > "$tmp/program.log" 2>&1 & ppid=$!
sleep 1
ZINC_HOME="$W" "$Z" device screen "$tmp/screen.png" > "$tmp/screen.log" 2>&1 || { echo "zinc device screen: $(cat "$tmp/screen.log" "$tmp/program.log")"; fail=1; }
px=$(python3 - "$PWD" "$tmp/screen.png" 2>&1 <<'PY'
import sys, importlib.machinery, importlib.util
l = importlib.machinery.SourceFileLoader("pd", sys.argv[1] + "/tools/pngdiff"); s = importlib.util.spec_from_loader("pd", l); m = importlib.util.module_from_spec(s); l.exec_module(m)
w, h, b, d = m.dec(sys.argv[2]); i = (w * (h // 2) + w // 2) * b
print(w, h, d[i], d[i + 1], d[i + 2])
PY
)
[ "$px" = "64 48 51 102 204" ] || { echo "the captured frame should be 64x48 of 51 102 204, got '$px'"; fail=1; }
[ ! -s "$D/agent/run/shot.request" ] || { echo "the request was not emptied"; fail=1; }

# --live, the program's side (src/host/mirror.cpp): a viewer's socket named in live.request gets HELLO and the frames, acknowledged; its
# INPUT (the pointer down at the middle, a typed é) reaches the program, which then draws red
kill $ppid 2>/dev/null; wait $ppid 2>/dev/null
ZINC_SHOT_REQUEST="$tmp/live/shot.request" ZINC_HEADLESS=1 ZINC_REALTIME=1 ZINC_FRAMES=100000000 ZINC_SIZE=64x48 \
  "$Z" run tests/data/screen/input.ts > "$tmp/input.log" 2>&1 & ppid=$!
mkdir -p "$tmp/live"
got=$(python3 - "$tmp/live" 2>&1 <<'PY'
import os, socket, struct, sys, time
d = sys.argv[1]; path = d + "/live.sock"
s = socket.socket(socket.AF_UNIX); s.bind(path); s.listen(1); s.settimeout(10)
open(d + "/live.request", "w").write(path + "\n")
c, _ = s.accept(); c.settimeout(10)
buf = b""; pic = None; W = H = 0; frames = 0; sent = False
def rle(p, w, h):
    out = []; i = 0
    while i < len(p):
        k = p[i]; i += 1
        if k < 128: out += [p[i + 3 * j:i + 3 * j + 3] for j in range(k + 1)]; i += 3 * (k + 1)
        else: out += [p[i:i + 3]] * (k - 126); i += 3
    return out
end = time.time() + 10
while time.time() < end:
    buf += c.recv(65536)
    while len(buf) >= 5 and len(buf) >= 5 + struct.unpack("<I", buf[1:5])[0]:
        t, n = buf[0], struct.unpack("<I", buf[1:5])[0]; m = buf[5:5 + n]; buf = buf[5 + n:]
        if t == 1: W, H = struct.unpack("<HH", m[:4]); pic = [b"\0\0\0"] * (W * H)
        elif t == 2:
            x, y, w, h = struct.unpack("<HHHH", m[:8]); px = rle(m[8:], w, h)
            for r in range(h): pic[(y + r) * W + x:(y + r) * W + x + w] = px[r * w:(r + 1) * w]
        elif t == 3:
            frames += 1; c.sendall(bytes([16]) + struct.pack("<I", 4) + m)
            mid = pic[(H // 2) * W + W // 2]
            if not sent:   # after the first frame (a still screen sends no other): INPUT: x y down pbuttons mods buttons wheel wheel_x, 1 key (TEXT é), 0 clicks
                t8 = "é".encode()
                body = struct.pack("<ffBBIIff", 0.5, 0.5, 1, 1, 0, 0, 0, 0) + struct.pack("<H", 1) + struct.pack("<IIiH", 0, 0, 3, len(t8)) + t8 + struct.pack("<H", 0)
                c.sendall(bytes([22]) + struct.pack("<I", len(body)) + body); sent = True
            if sent and mid == bytes([0x33, 0x33, 0xcc]):
                print(W, H, "red after", frames); sys.exit(0)
print("no red frame:", W, H, frames, pic and pic[(H // 2) * W + W // 2]); sys.exit(1)
PY
)
[ "${got%% after*}" = "64 48 red" ] || { echo "live, the program's side: $got"; fail=1; }
sleep 0.3
grep -q "down at 32 24" "$tmp/input.log" && grep -q "typed é" "$tmp/input.log" || { echo "the viewer's input did not reach the program: $(cat "$tmp/input.log")"; fail=1; }

# --live through the agent: a headless viewer receives the frames of the program on the screen and says what it saw
kill $ppid 2>/dev/null; wait $ppid 2>/dev/null
ZINC_SHOT_REQUEST="$D/agent/run/shot.request" ZINC_HEADLESS=1 ZINC_REALTIME=1 ZINC_FRAMES=100000000 ZINC_SIZE=64x48 \
  "$Z" run tests/data/screen/main.ts > "$tmp/program.log" 2>&1 & ppid=$!
sleep 1
ZINC_HOME="$W" ZINC_HEADLESS=1 ZINC_FRAMES=300 "$Z" device screen --live > "$tmp/live.log" 2>&1 || { echo "zinc device screen --live: $(cat "$tmp/live.log")"; fail=1; }
grep -q "frames received, 64x48, centre #3366cc" "$tmp/live.log" || { echo "the live viewer: $(cat "$tmp/live.log")"; fail=1; }
[ ! -s "$D/agent/run/live.request" ] || { echo "live.request was not emptied"; fail=1; }

[ $fail -eq 0 ] && echo "device_screen: ok"
exit $fail
