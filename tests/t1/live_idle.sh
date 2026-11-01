#!/bin/sh
# A live viewer (zinc device screen --live, src/host/mirror.cpp) that connects to a screen that has been still for a while gets the
# whole current screen at once (HELLO, a full RECT, FRAME) and, still acknowledging, the whole screen again every 2 s: a still screen
# is no excuse for a black window. The program draws once and keep()s that frame, as the Pi shell's home page does once its animation rests.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || { echo "skipped: no python3"; exit 77; }
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'kill $ppid 2>/dev/null; rm -rf "$tmp"' EXIT
mkdir -p "$tmp/live"
ZINC_SHOT_REQUEST="$tmp/live/shot.request" ZINC_HEADLESS=1 ZINC_REALTIME=1 ZINC_FRAMES=100000000 ZINC_SIZE=64x48 \
  "$Z" run tests/data/live_idle > "$tmp/prog.log" 2>&1 & ppid=$!
sleep 3   # the screen has been still for a while
got=$(python3 - "$tmp/live" 2>&1 <<'PY'
import socket, struct, sys, time
d = sys.argv[1]; path = d + "/live.sock"
s = socket.socket(socket.AF_UNIX); s.bind(path); s.listen(1); s.settimeout(10)
open(d + "/live.request", "w").write(path + "\n")
c, _ = s.accept(); c.settimeout(0.2)
t0 = time.time(); buf = b""; W = H = 0; at = {}; red = False; frames = []
def rle(p, n):
    out = []; i = 0
    while len(out) < n:
        k = p[i]; i += 1
        if k < 128: out += [p[i + 3 * j:i + 3 * j + 3] for j in range(k + 1)]; i += 3 * (k + 1)
        else: out += [p[i:i + 3]] * (k - 126); i += 3
    return out
pic = None
while time.time() - t0 < 5.5:
    try: buf += c.recv(65536)
    except socket.timeout: pass
    while len(buf) >= 5 and len(buf) >= 5 + struct.unpack("<I", buf[1:5])[0]:
        t, n = buf[0], struct.unpack("<I", buf[1:5])[0]; m = buf[5:5 + n]; buf = buf[5 + n:]
        if t == 1: W, H = struct.unpack("<HH", m[:4]); pic = [b"\0\0\0"] * (W * H); at["hello"] = time.time() - t0
        elif t == 2:
            x, y, w, h = struct.unpack("<HHHH", m[:8]); px = rle(m[8:], w * h)
            for r in range(h): pic[(y + r) * W + x:(y + r) * W + x + w] = px[r * w:(r + 1) * w]
            at.setdefault("rect", (time.time() - t0, (x, y, w, h)))
        elif t == 3:
            frames.append(time.time() - t0); c.sendall(bytes([16]) + struct.pack("<I", 4) + m)
            if pic[15 * W + 15] == bytes([0x33, 0x33, 0xcc]) and pic[40 * W + 40] == bytes([0xcc, 0x66, 0x33]): red = True
ok = red and W == 64 and H == 48 and at.get("rect", (9, 0))[1] == (0, 0, 64, 48) and frames and frames[0] < 1.0 and len([f for f in frames if f > 1.5]) >= 1
print("ok" if ok else "bad", W, H, at, [round(f, 1) for f in frames], "picture ok" if red else "picture wrong")
sys.exit(0 if ok else 1)
PY
)
[ "${got%% *}" = ok ] || { echo "live idle: $got"; exit 1; }
echo "live idle: ok"
