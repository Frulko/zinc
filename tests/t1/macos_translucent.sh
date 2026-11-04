#!/bin/sh
# A transparent window without a key colour has an alpha per pixel: an opaque rectangle stays opaque, a half see-through one is half see-through and
# the cleared rest is fully see-through (read from the window's own capture, with its alpha channel). Needs the Screen Recording permission.
[ "$(uname)" = Darwin ] || { echo "skipped: macOS only"; exit 77; }
launchctl managername 2>/dev/null | grep -q Aqua || { echo "skipped: no GUI session"; exit 77; }
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cp -R tests/golden/macos/translucent "$tmp/app"
cd "$tmp/app" || exit 2
env -u ZINC_DETERMINISTIC ZINC_BACKGROUND=1 "$ZINC" --background run main.tsx > "$tmp/out.log" 2>&1 &
n=0; while [ ! -s window-number.txt ] && [ $n -lt 100 ]; do sleep 0.1; n=$((n+1)); done
id=$(cat window-number.txt 2>/dev/null)
[ -n "$id" ] || { echo "the window never came up: $(cat "$tmp/out.log")"; exit 1; }
sleep 0.3
screencapture -x -o -l "$id" "$tmp/window.png" 2>/dev/null
wait
[ -s "$tmp/window.png" ] || { echo "skipped: no Screen Recording permission for this terminal"; exit 77; }
python3 - "$tmp/window.png" <<'P'
import struct, sys, zlib
d = open(sys.argv[1], 'rb').read()
pos, idat = 8, b''
while pos < len(d):
    n, t = struct.unpack('>I4s', d[pos:pos + 8]); body = d[pos + 8:pos + 8 + n]; pos += 12 + n
    if t == b'IHDR': w, h, bd, ct = struct.unpack('>IIBB', body[:10])
    elif t == b'IDAT': idat += body
if ct != 6: print('the capture has no alpha channel, colour type', ct); sys.exit(1)
raw = zlib.decompress(idat); stride = w * 4; rows = []; prev = bytearray(stride); i = 0
for y in range(h):
    f = raw[i]; line = bytearray(raw[i + 1:i + 1 + stride]); i += 1 + stride
    for x in range(stride):
        a = line[x - 4] if x >= 4 else 0; b = prev[x]; c = prev[x - 4] if x >= 4 else 0
        if f == 1: line[x] = (line[x] + a) & 255
        elif f == 2: line[x] = (line[x] + b) & 255
        elif f == 3: line[x] = (line[x] + (a + b) // 2) & 255
        elif f == 4:
            p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c); line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
    rows.append(line); prev = line
scale = w / 320.0
def alpha(x, y): return rows[int(y * scale)][int(x * scale) * 4 + 3]
opaque, half, clear = alpha(60, 40), alpha(200, 40), alpha(60, 150)
ok = opaque > 245 and 100 < half < 156 and clear < 10
print('macos translucent:', 'ok' if ok else 'FAIL', 'opaque', opaque, 'half', half, 'clear', clear)
sys.exit(0 if ok else 1)
P
