#!/bin/sh
# The site's gallery of graded examples (ZN-774.36): the committed web exports of site/public/play match learn/catalog.txt and the examples' sources
# (tools/site-examples --check); the site builds the gallery (every entry, the module and grade filters) and a page per example with its source and
# copy buttons; and in headless Chrome the hello page runs its program in its frame (it prints its line, frames come and the canvas is drawn), and so
# does the 3d page (zinc:3d on WebGL 2).
# Skipped (77) without Chrome or the site's packages (cd site && pnpm install).
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || { echo "site_examples: no python3"; exit 77; }
python3 -I -c "import sys; sys.path.insert(0, 'tools'); from cdp import find_chrome; sys.exit(0 if find_chrome() else 1)" || { echo "site_examples: no Chrome"; exit 77; }
[ -d site/node_modules ] || { echo "site_examples: no site/node_modules (cd site && pnpm install)"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
python3 tools/site-examples --check || fail=1
n=$(grep -vc '^#' learn/catalog.txt)
for name in $(grep -v '^#' learn/catalog.txt | cut -d'|' -f1); do [ -s "site/public/play/$name/index.html" ] || { echo "site_examples: site/public/play/$name is not exported"; fail=1; }; done
# the site, under /zinc as on GitHub Pages
(cd site && pnpm -s exec astro build --outDir "$tmp/root/zinc" >"$tmp/build.log" 2>&1) || { tail -20 "$tmp/build.log"; echo "site_examples: the site does not build"; exit 1; }
g="$tmp/root/zinc/examples/index.html"; p="$tmp/root/zinc/examples/hello/index.html"
[ "$(grep -o 'data-module="[a-z]*" data-stars="[1-4]"' "$g" | wc -l | tr -d ' ')" = "$n" ] || { echo "site_examples: the gallery does not list the $n entries of the catalogue"; fail=1; }
for m in drawing scene canvas interface; do grep -q "data-module=\"$m\"[^>]*>$m</button>" "$g" || { echo "site_examples: no $m filter"; fail=1; }; done
for s in 1 2 3 4; do grep -q "data-stars=\"$s\" aria-label" "$g" || { echo "site_examples: no $s-star filter"; fail=1; }; done
[ "$(ls "$tmp/root/zinc/examples" | wc -l | tr -d ' ')" = "$((n + 1))" ] || { echo "site_examples: not one page per example"; fail=1; }
grep -q 'src="/zinc/play/hello/"' "$p" || { echo "site_examples: the hello page does not run its program"; fail=1; }
grep -q "console.log(&#39;Hello from Zinc&#39;)" "$p" || { echo "site_examples: the hello page does not show its source"; fail=1; }
grep -q 'class="copy" type="button" data-copy="// Hello' "$p" || { echo "site_examples: the source has no copy button"; fail=1; }
grep -q 'src="/zinc/play/3d/"' "$tmp/root/zinc/examples/3d/index.html" || { echo "site_examples: the 3d page does not run its program (zinc:3d on WebGL 2)"; fail=1; }
# the hello page in headless Chrome: its frame runs the program
frame="(() => { const w = document.getElementById('ex-app').contentWindow, cv = w.document.querySelector('canvas'); if (!cv) return 'no canvas'; const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height; const g = t.getContext('2d'); g.drawImage(cv, 0, 0); const d = g.getImageData(0, 0, t.width, t.height).data; let k = 0; for (let i = 4; i < d.length; i += 4) if (d[i] !== d[0] || d[i+1] !== d[1] || d[i+2] !== d[2]) k++; return (w.__zincFrames || 0) + ' frames, ' + (k / (d.length / 4)).toFixed(3) + ' drawn'; })()"
out=$(python3 -I tools/web-browser-test "$tmp/root" --path /zinc/examples/hello/ --wait 3 --size 1200x800 --eval "$frame") || { echo "site_examples: Chrome failed: $out"; exit 1; }
printf '%s\n' "$out" | python3 -I -c '
import json, re, sys
o = json.load(sys.stdin)
m = re.match(r"(\d+) frames, ([0-9.]+) drawn", str(o.get("eval")))
ok = "Hello from Zinc" in o["console"] and not o["errors"] and m and int(m.group(1)) >= 10 and float(m.group(2)) > 0.005
print("site_examples: hello in its page: %s, console %s%s" % (o.get("eval"), o["console"][:3], "" if ok else ", errors %s" % o["errors"][:3]))
sys.exit(0 if ok else 1)' || fail=1
# the 3d page (ZN-563.03): zinc:3d draws on the page's WebGL 2 (plugins/3d/web/render3d.js), its frames come and its canvas is drawn (the cube and the ring over the background)
out=$(python3 -I tools/web-browser-test "$tmp/root" --path /zinc/examples/3d/ --wait 3 --size 1200x800 --eval "$frame") || { echo "site_examples: Chrome failed: $out"; exit 1; }
printf '%s\n' "$out" | python3 -I -c '
import json, re, sys
o = json.load(sys.stdin)
m = re.match(r"(\d+) frames, ([0-9.]+) drawn", str(o.get("eval")))
ok = not o["errors"] and m and int(m.group(1)) >= 10 and float(m.group(2)) > 0.02
print("site_examples: 3d in its page: %s%s" % (o.get("eval"), "" if ok else ", errors %s, console %s" % (o["errors"][:3], o["console"][:3])))
sys.exit(0 if ok else 1)' || fail=1
exit $fail
