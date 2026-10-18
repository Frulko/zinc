#!/bin/sh
# The semantic DOM of the web target (docs/targets/web.md, "The semantic DOM"): tests/fixtures/web-dom exported with --render dom and driven in headless Chrome by tools/web-dom-test:
# real elements (header, nav, main, headings, links, ul/li, a form with real inputs), few inline styles and no absolute positioning, the accessibility tree Chrome builds from it,
# the browser's own keyboard (Tab order, typing with the caret kept through updates, Enter submits the form, Page Down scrolls), a resize laid out by CSS, a modal layer as a
# <dialog> closed by Escape, a Canvas as a <canvas>, and an update that keeps the elements. Skipped (77) without Chrome or python3. Firefox and Safari are not tested here.
[ -z "$ZINC_CI" ] || { echo "skipped: headless Chrome on a loaded hosted runner scrolls the 5000-row list off its measured position"; exit 77; }
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
command -v python3 >/dev/null 2>&1 || { echo "web_dom: no python3"; exit 77; }
python3 -I -c "import sys; sys.path.insert(0, 'tools'); from cdp import find_chrome; sys.exit(0 if find_chrome() else 1)" || { echo "web_dom: no Chrome"; exit 77; }
export ZINC_BACKGROUND=1
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
"$Z" export tests/fixtures/web-dom --target web --render dom -o "$tmp/dom" >/dev/null 2>"$tmp/err" || { echo "web_dom: the export failed: $(cat "$tmp/err")"; exit 1; }
"$Z" export tests/fixtures/web-dom-list --target web --render dom -o "$tmp/list" >/dev/null 2>"$tmp/err" || { echo "web_dom: the list export failed: $(cat "$tmp/err")"; exit 1; }
"$Z" export tests/fixtures/web-dom-nav --target web --render dom -o "$tmp/nav" >/dev/null 2>"$tmp/err" || { echo "web_dom: the navigation export failed: $(cat "$tmp/err")"; exit 1; }
python3 -I tools/web-dom-test "$tmp/dom" "$tmp/list" "$tmp/nav" >"$tmp/out" 2>"$tmp/err"
rc=$?
[ $rc -eq 77 ] && exit 77
python3 -I -c '
import json, sys
try: o = json.load(open(sys.argv[1]))
except Exception: sys.exit("web_dom: no result: " + open(sys.argv[2]).read()[:400])
bad = ["%s %s" % (n, d) for n, ok, d in o["checks"] if not ok]
if bad or o["errors"]: sys.exit("web_dom: %d of %d checks failed: %s %s" % (len(bad), len(o["checks"]), "; ".join(bad)[:900], o["errors"]))
' "$tmp/out" "$tmp/err" || exit 1
# --prerender: the first screen is in index.html (readable without running a script), and the page adopts those elements instead of building them again
"$Z" export tests/fixtures/web-dom --target web --render dom --prerender -o "$tmp/pre" >"$tmp/pre.log" 2>&1 || { echo "web_dom: the prerendered export failed: $(cat "$tmp/pre.log")"; exit 1; }
grep -q "prerendered" "$tmp/pre.log" || { echo "web_dom: --prerender did not run: $(cat "$tmp/pre.log")"; exit 1; }
grep -q "DOM fixture" "$tmp/pre/index.html" || { echo "web_dom: the heading of the first screen is not in index.html"; exit 1; }
python3 -I tools/web-browser-test "$tmp/pre" --wait 2 --size 1000x700 --init "document.addEventListener('DOMContentLoaded', () => { window.__preH1 = document.querySelector('h1'); window.__preMarked = document.querySelectorAll('[data-z]').length; })" --eval "JSON.stringify([document.querySelector('h1') === window.__preH1, window.__preMarked > 20, document.querySelectorAll('[data-z]').length])" >"$tmp/pre.out" 2>&1 || { echo "web_dom: the prerendered page failed: $(cut -c1-300 "$tmp/pre.out")"; exit 1; }
grep -q '\[true,true,0\]' "$tmp/pre.out" || { echo "web_dom: the page did not adopt its prerendered elements: $(cut -c1-200 "$tmp/pre.out")"; exit 1; }
