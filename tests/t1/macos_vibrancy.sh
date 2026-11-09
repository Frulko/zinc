#!/bin/sh
# Transparent windows and vibrancy on macOS (ZN-249): a window with app.window.transparent shows the key colour (black) as alpha 0 and everything else opaque (checked on a screencapture of the window
# itself, with its alpha channel), is not opaque for AppKit, and setVibrancy puts an NSVisualEffectView behind the content. The desktop pixels are not compared: they depend on the wallpaper and the displays;
# the blur is measured instead: on the screen, the area under the key colour loses most of its fine detail (mean luminance step between neighbours) once the vibrancy view is there.
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
rect=$(awk '/^RECT /{print $2","$3","$4","$5}' "$tmp/out.log")
[ -z "$rect" ] || screencapture -x -R "$rect" "$tmp/backdrop.png" 2>/dev/null   # the screen where the window is: the desktop shows through the key colour
n=0; while ! grep -q "vibrancy 1" "$tmp/out.log" && [ $n -lt 100 ]; do sleep 0.1; n=$((n+1)); done
sleep 0.5
[ -z "$rect" ] || screencapture -x -R "$rect" "$tmp/blurred.png" 2>/dev/null
rt=$(defaults read com.apple.universalaccess reduceTransparency 2>/dev/null)
# without the Screen Recording permission (System Settings > Privacy & Security) macOS captures no other app's window: the pixel check is skipped, the AppKit checks still run
[ -s "$tmp/window.png" ] || echo "WARN no capture of the window (this terminal has no Screen Recording permission): the alpha check is skipped"
[ ! -s "$tmp/window.png" ] || python3 - "$tmp/window.png" "$tmp/backdrop.png" "$tmp/blurred.png" "$rt" <<'P' || fail=1
import os, struct, sys, zlib
def load(path):
    d = open(path, 'rb').read()
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
    scale = w / 320.0   # the program's 320 units across the window; the capture is in pixels
    def px(x, y): r = rows[int(y * scale)]; o = int(x * scale) * bpp; return tuple(r[o:o + bpp])
    def detail():       # mean luminance step between neighbours over the key colour area (160,100)-(300,190): high on text and edges, near 0 once blurred
        total = count = 0
        for y in range(int(100 * scale), int(190 * scale), 2):
            r = rows[y]; lum = [(r[o] * 299 + r[o + 1] * 587 + r[o + 2] * 114) // 1000 for o in range(int(160 * scale) * bpp, int(300 * scale) * bpp, bpp)]
            total += sum(abs(lum[k + 1] - lum[k]) for k in range(len(lum) - 1)); count += len(lum) - 1
        return total / count
    return bpp, px, detail
bpp, px, _ = load(sys.argv[1])
if bpp != 4: print('the window screenshot has no alpha channel'); sys.exit(1)
yellow = px(60, 40)       # inside the yellow rectangle (20,20)-(120,80)
key = px(250, 150)        # black key colour area
if not (yellow[3] > 200 and yellow[0] > 200 and yellow[1] > 150 and yellow[2] < 80): print('the opaque rectangle is not opaque yellow:', yellow); sys.exit(1)
if key[3] > 40: print('the key colour area is not see-through: alpha', key[3], key); sys.exit(1)
if not (os.path.exists(sys.argv[2]) and os.path.exists(sys.argv[3])): print('WARN no capture of the screen region: the blur check is skipped'); sys.exit(0)
_, bpx, before = load(sys.argv[2]); _, apx, after = load(sys.argv[3]); before, after = before(), after()
if sys.argv[4] == '1': print('skipped the blur check: Reduce transparency is on (System Settings > Accessibility > Display), AppKit draws the material opaque; detail %.1f -> %.1f' % (before, after)); sys.exit(0)
if abs(apx(60, 40)[0] - yellow[0]) > 30 or abs(apx(60, 40)[2] - yellow[2]) > 30: print('WARN the window is covered on the screen: the blur check is skipped'); sys.exit(0)
if before < 2: print('skipped the blur check: the screen behind the window is too plain to show a blur (detail %.1f)' % before); sys.exit(0)
if after > before * 0.35: print('the backdrop is not blurred after setVibrancy: detail %.1f -> %.1f' % (before, after)); sys.exit(1)
print('blur: detail %.1f -> %.1f' % (before, after))
P
wait
grep -q "DUMP opaque 0 | vibrancy 0" "$tmp/out.log" || { echo "the window is opaque for AppKit: $(cat "$tmp/out.log")"; fail=1; }
grep -q "DUMP opaque 0 | vibrancy 1" "$tmp/out.log" || { echo "no visual effect view after setVibrancy: $(cat "$tmp/out.log")"; fail=1; }
[ $fail -eq 0 ] && echo "macos vibrancy: ok"
exit $fail
