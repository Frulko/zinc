#!/bin/sh
# zinc export --target web (docs/targets/web.md): examples/hero as a static site in canvas mode, and the web-hot fixture in DOM mode. The folders are checked (the page, hashed
# scripts and assets, the offline cache, precompressed copies, the headers), then each runs in headless Chrome (tools/web-browser-test): frames come, the console has no errors,
# the canvas is drawn, the DOM text is the text of the app. Skipped (77) without Chrome or python3. Firefox and Safari are not tested here.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
command -v python3 >/dev/null 2>&1 || { echo "web_export: no python3"; exit 77; }
python3 -I -c "import sys; sys.path.insert(0, 'tools'); from cdp import find_chrome; sys.exit(0 if find_chrome() else 1)" || { echo "web_export: no Chrome"; exit 77; }
export ZINC_BACKGROUND=1
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
"$Z" export ../examples/hero --target web -o "$tmp/hero" >/dev/null 2>"$tmp/err" || { echo "web_export: the hero export failed"; cat "$tmp/err"; exit 1; }
"$Z" export tests/fixtures/web-hot --target web --render dom -o "$tmp/hot" >/dev/null 2>&1 || { echo "web_export: the web-hot export failed"; exit 1; }
for f in index.html sw.js manifest.webmanifest _headers serve.py README.txt; do [ -s "$tmp/hero/$f" ] || { echo "web_export: $f is missing"; fail=1; }; done
ls "$tmp"/hero/zinc.*.js "$tmp"/hero/app.*.js "$tmp"/hero/native.*.js >/dev/null 2>&1 || { echo "web_export: the hashed scripts are missing"; fail=1; }
[ -s "$tmp/hero/assets/city.bin" ] && { echo "web_export: an asset kept its plain name (it is named by its content)"; fail=1; }
ls "$tmp"/hero/assets/city.*.bin >/dev/null 2>&1 || { echo "web_export: the hashed asset is missing"; fail=1; }
grep -q '<script type="importmap">' "$tmp/hero/index.html" || { echo "web_export: no import map in the page"; fail=1; }
grep -q 'zinc-config' "$tmp/hero/index.html" || { echo "web_export: no config in the page"; fail=1; }
grep -q 'Cross-Origin-Opener-Policy' "$tmp/hero/_headers" && { echo "web_export: COOP/COEP asked for, and nothing needs it"; fail=1; }
ls "$tmp"/hero/app.*.js.gz >/dev/null 2>&1 || { echo "web_export: no gzip copy of the app (gzip missing?)"; fail=1; }
ls "$tmp"/hero/dom.*.js >/dev/null 2>&1 && { echo "web_export: canvas mode ships the DOM painter"; fail=1; }
ls "$tmp"/hot/dom.*.js >/dev/null 2>&1 || { echo "web_export: DOM mode lacks the DOM painter"; fail=1; }
js=$(cat "$tmp"/hero/zinc.*.js "$tmp"/hero/app.*.js "$tmp"/hero/native.*.js | wc -c)
[ "$js" -lt 600000 ] || { echo "web_export: the hero's JavaScript is $js bytes (over 600000)"; fail=1; }
out=$(python3 -I tools/web-browser-test "$tmp/hero" --wait 3 --size 1000x640) || { echo "web_export: hero did not run in Chrome: $out"; exit 1; }
echo "$out" | python3 -I -c '
import json, sys
o = json.load(sys.stdin)
bad = []
if o["frames"] < 30: bad.append("only %d frames" % o["frames"])
if o["errors"] or o["console"]: bad.append("console: %s" % (o["errors"] + o["console"])[:2])
if o["nonblank"] < 0.3: bad.append("the canvas is %.2f drawn" % o["nonblank"])
sys.exit("web_export: hero canvas: " + "; ".join(bad) if bad else 0)' || fail=1
python3 -I tools/web-browser-test "$tmp/hot" --wait 3 --size 800x500 --expect-text "Label A: 0" >"$tmp/hot.out" || { echo "web_export: the DOM mode page did not hold the text of the app: $(cat "$tmp/hot.out")"; fail=1; }
python3 -I -c '
import json, sys
o = json.load(open(sys.argv[1]))
sys.exit("web_export: DOM page: %s" % (o["errors"] + o["console"])[:2] if o["errors"] or o["console"] or o["frames"] < 30 else 0)' "$tmp/hot.out" || fail=1
exit $fail
