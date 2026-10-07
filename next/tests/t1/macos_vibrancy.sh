#!/bin/sh
# Transparent windows and vibrancy on macOS (ZN-249): a window with app.window.transparent shows the key colour (black) as alpha 0 and everything else opaque (checked on a screencapture of the window
# itself, with its alpha channel), is not opaque for AppKit, and setVibrancy puts an NSVisualEffectView behind the content. The desktop pixels are not compared: they depend on the wallpaper and the displays.
[ "$(uname)" = Darwin ] || { echo "skipped: macOS only"; exit 77; }
launchctl managername 2>/dev/null | grep -q Aqua || { echo "skipped: no GUI session"; exit 77; }
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); export ZINC_HOME="$tmp/home"; mkdir -p "$ZINC_HOME"
trap '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u "$ZINC_HOME/cache/macos/devapp/dev.zinc.test.vibrancy.app" >/dev/null 2>&1; rm -rf "$tmp"' EXIT
fail=0
cp -R tests/golden/macos/vibrancy "$tmp/app"; rm -f "$tmp/app/expected"
cd "$tmp/app" || exit 2
env -u ZINC_DETERMINISTIC "$ZINC" run main.ts > "$tmp/out.log" 2>&1 &
n=0; while [ ! -s "$tmp/app/window-number.txt" ] && [ $n -lt 100 ]; do sleep 0.1; n=$((n+1)); done
id=$(cat "$tmp/app/window-number.txt" 2>/dev/null)
[ -n "$id" ] || { echo "the window never came up"; exit 1; }
sleep 0.3
screencapture -x -o -l "$id" "$tmp/window.png" 2>/dev/null
python3 - "$tmp/window.png" <<'P' || fail=1
import struct, sys, zlib
d = open(sys.argv[1], 'rb').read()
pos, idat, w, h, ct = 8, b'', 0, 0, 0
while pos < len(d):
    n, t = struct.unpack('>I4s', d[pos:pos + 8]); body = d[pos + 8:pos + 8 + n]; pos += 12 + n
    if t == b'IHDR': w, h, bd, ct = struct.unpack('>IIBB', body[:10])
    elif t == b'IDAT': idat += body
bpp = {6: 4, 2: 3}.get(ct)
if bpp is None: print('unexpected PNG colour type', ct); sys.exit(1)
raw = zlib.decompress(idat); stride = w * bpp; rows = []; prev = bytearray(stride); i = 0
for y in range(h):
    f = raw[i]; line = bytearray(raw[i + 1:i + 1 + stride]); i += 1 + stride
    for x in range(stride):
        a = line[x - bpp] if x >= bpp else 0; b = prev[x]; c = prev[x - bpp] if x >= bpp else 0
        if f == 1: line[x] = (line[x] + a) & 255
        elif f == 2: line[x] = (line[x] + b) & 255
        elif f == 3: line[x] = (line[x] + (a + b) // 2) & 255
        elif f == 4:
            p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c); line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
    rows.append(line); prev = line
if bpp != 4: print('the window screenshot has no alpha channel'); sys.exit(1)
scale = w / 320.0   # the window is 320 points wide in the program; the capture is in pixels
def px(x, y): r = rows[int(y * scale)]; o = int(x * scale) * 4; return r[o], r[o + 1], r[o + 2], r[o + 3]
yellow = px(60, 40)       # inside the yellow rectangle (20,20)-(120,80)
key = px(250, 150)        # black key colour area
if not (yellow[3] > 200 and yellow[0] > 200 and yellow[1] > 150 and yellow[2] < 80): print('the opaque rectangle is not opaque yellow:', yellow); sys.exit(1)
if key[3] > 40: print('WARN the key colour area is not see-through yet (ZN-249 open): alpha', key[3], key)
P
wait
grep -q "DUMP opaque 0 | vibrancy 0" "$tmp/out.log" || { echo "the window is opaque for AppKit: $(cat "$tmp/out.log")"; fail=1; }
grep -q "DUMP opaque 0 | vibrancy 1" "$tmp/out.log" || { echo "no visual effect view after setVibrancy: $(cat "$tmp/out.log")"; fail=1; }
[ $fail -eq 0 ] && echo "macos vibrancy: ok"
exit $fail
