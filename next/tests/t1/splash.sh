#!/bin/sh
# The engine splash (ZN-446): zinc.json "splash" becomes the `.splash` entry of boot.zpk (ZSP1: background, fit, minMs, fadeMs, the image as
# ZIM1 rgba8), stored uncompressed even in a release pack, in a pack of its own when no group is named boot and with no assets directory;
# targets.<id>.splash replaces it on that target. A headless run of a project with a splash, interpreted or built ahead of time, draws and prints
# what it does without one and shows no splash. zinc export --target wasm puts the splash in the page: the canvas's CSS background, the image
# inline, painted with no script at all (headless Chrome, the page without app.js; skipped without the browser build or Chrome). The time from
# exec to the splash in a window: tools/splash-time (it opens windows, so it is not run here).
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home" ZINC_HEADLESS=1
fail=0
no() { echo "splash: $*"; fail=1; }
# zsp <pack> <background hex> <fit> <minMs> <image width or 0>: the splash entry of the pack has these, its bytes stored as they are
zsp() {
  python3 - "$@" <<'PY' || fail=1
import struct, sys
pack, bg, fit, min_ms, width = sys.argv[1], int(sys.argv[2], 16), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
d = open(pack, "rb").read(); at = d.find(b"ZSP1")
if at < 0: print("splash: no ZSP1 entry in %s" % pack); sys.exit(1)
got = struct.unpack("<IB3xII", d[at + 4:at + 20])
if got[:3] != (bg, fit, min_ms): print("splash: %s: background, fit, minMs %r, not %r" % (pack, got[:3], (bg, fit, min_ms))); sys.exit(1)
img = d[at + 20:at + 36]
if width and (img[:4] != b"ZIM1" or img[4] != 1 or struct.unpack("<I", img[8:12])[0] != width): print("splash: %s: the image is %r" % (pack, img)); sys.exit(1)
if not width and img[:4] == b"ZIM1": print("splash: %s: a background alone has an image" % pack); sys.exit(1)
PY
}

mkdir -p "$tmp/p/assets" "$tmp/p/src"
printf '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="2"><rect width="4" height="2" fill="#3060c0"/></svg>' > "$tmp/p/assets/splash.svg"
echo hello > "$tmp/p/assets/msg.txt"
cat > "$tmp/p/src/main.ts" <<'TS'
import { onFrame, clear, rect, width, height } from 'zinc:gfx';
let n = 0;
onFrame((dt: number) => { clear(0x204020); rect(10, 10, width() / 2, height() / 2, 0xe0a030); n++; if (n == 3) console.log('frames', n); });
TS
plain='{ "name": "p", "entry": "src/main.ts", "targets": { "macos": { "width": 320, "height": 200 } } }'
echo "$plain" > "$tmp/p/plain.json"
cat > "$tmp/p/zinc.json" <<'JSON'
{ "name": "p", "entry": "src/main.ts",
  "splash": { "image": "assets/splash.svg", "background": "#102030", "fit": "cover", "minMs": 250, "fadeMs": 100 },
  "targets": { "macos": { "width": 320, "height": 200 }, "linux": { "width": 320, "height": 200 }, "wasm": { "splash": { "background": "#0f0" } } } }
JSON

# the entry: dev and release packs, the report, the target's own splash
"$Z" assets build "$tmp/p" >/dev/null || no "the asset build failed"
out=$(ls -d "$tmp"/p/build/assets/*/ | head -1)
grep -qF '"name": ".splash", "importer": "splash", "group": "boot"' "$out/report.json" || no "no .splash row in the report"
zsp "$out/boot.zpk" ff102030 1 250 32   # the SVG drawn at 8 pixels a unit: 32 wide
"$Z" assets build "$tmp/p" --release >/dev/null && zsp "$out/boot.zpk" ff102030 1 250 32
"$Z" assets build "$tmp/p" --target wasm >/dev/null && zsp "$tmp/p/build/assets/wasm/boot.zpk" ff00ff00 0 0 0
mkdir -p "$tmp/bare"; echo '{ "splash": { "background": "#ff8000" } }' > "$tmp/bare/zinc.json"   # no assets directory
"$Z" assets build "$tmp/bare" >/dev/null && zsp "$(ls -d "$tmp"/bare/build/assets/*/ | head -1)/boot.zpk" ffff8000 0 0 0

# headless: the same frame and output as without a splash, and no splash shown
run() { ZINC_FRAMES=3 ZINC_SHOT="$tmp/$1.png" ZINC_LOG=run=debug "$Z" run "$tmp/p" >"$tmp/$1.out" 2>"$tmp/$1.err"; }
run with || no "the headless run failed: $(head -c 300 "$tmp/with.err")"
cp "$tmp/p/zinc.json" "$tmp/p/splash.json"; cp "$tmp/p/plain.json" "$tmp/p/zinc.json"
run without || no "the run without a splash failed"
cmp -s "$tmp/with.png" "$tmp/without.png" || no "a headless run draws another frame with a splash"
cmp -s "$tmp/with.out" "$tmp/without.out" || no "a headless run prints something else with a splash"
grep -q splash "$tmp/with.err" && no "a headless run showed the splash: $(grep splash "$tmp/with.err" | head -3)"
cp "$tmp/p/splash.json" "$tmp/p/zinc.json"
if [ -n "$CXX" ] || command -v c++ >/dev/null; then   # built ahead of time: its main asks for the splash of its packs first
  "$Z" build "$tmp/p/src/main.ts" -o "$tmp/p/build/app" >/dev/null 2>"$tmp/build.err" || no "zinc build failed: $(head -c 300 "$tmp/build.err")"
  got=$(cd "$tmp" && ZINC_FRAMES=3 ZINC_LOG=run=debug "$tmp/p/build/app" 2>&1)
  [ "$got" = "frames 3" ] || no "the built program, headless, printed '$got'"
fi

# the browser: the splash in the page, before the script, and painted without it
if [ -f build-wasm/vm-web.wasm ]; then
  sed -i.bak 's/"wasm": { "splash": { "background": "#0f0" } }/"wasm": { "width": 200, "height": 100 }/' "$tmp/p/zinc.json"
  "$Z" export "$tmp/p" --target wasm -o "$tmp/site" >/dev/null 2>"$tmp/export.err" || no "the wasm export failed: $(head -c 300 "$tmp/export.err")"
  page=$(tr -d '\n' < "$tmp/site/index.html")
  case "$page" in
    *'<canvas id="c" style="background: #102030 url(data:image/svg+xml;base64,'*') center / cover no-repeat"'*'<script type="module" src="./app.js">'*) ;;
    *) no "the page has no splash before its script: $(head -c 400 "$tmp/site/index.html")" ;;
  esac
  CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  [ -x "$CHROME" ] || CHROME=$(command -v google-chrome chromium chromium-browser 2>/dev/null | head -1)
  if [ -n "$CHROME" ] && [ -x "$CHROME" ]; then
    grep -v 'app.js' "$tmp/site/index.html" > "$tmp/site/nojs.html"
    "$CHROME" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$tmp/chrome" --force-device-scale-factor=1 --window-size=300,200 \
      --screenshot="$tmp/page.png" "file://$tmp/site/nojs.html" >/dev/null 2>&1
    python3 - "$tmp/page.png" <<'PY' || fail=1
import importlib.machinery, importlib.util, sys
loader = importlib.machinery.SourceFileLoader("pngdiff", "tools/pngdiff"); spec = importlib.util.spec_from_loader("pngdiff", loader); pd = importlib.util.module_from_spec(spec); loader.exec_module(pd)
w, h, bpp, d = pd.dec(sys.argv[1])
px = lambda x, y: tuple(d[(y * w + x) * bpp:(y * w + x) * bpp + 3])
if px(100, 50) != (0x30, 0x60, 0xc0): print("splash: the page without its script shows %r in the canvas, not the splash" % (px(100, 50),)); sys.exit(1)
PY
  else echo "splash: no Chrome, the page is not painted"
  fi
else echo "splash: no build-wasm/vm-web.wasm (tools/build-wasm), the page is not checked"
fi
exit $fail
