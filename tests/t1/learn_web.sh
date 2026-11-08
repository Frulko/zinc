#!/bin/sh
# The lessons run in their docs page (ZN-774.25): every lesson page whose sample the gallery exports (site/public/play, tools/site-examples) has
# the Run block; in headless Chrome, lesson 01's Run puts the program in a frame in place of its picture (frames come, Restart and the picture
# button show, the live region says it runs); without import maps the picture stays and one line says the browser cannot run it; and the
# exported program's frame matches the native run of the same sample (tools/pngdiff).
# Skipped (77) without Chrome or the site's packages (cd site && pnpm install).
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || { echo "learn_web: no python3"; exit 77; }
python3 -I -c "import sys; sys.path.insert(0, 'tools'); from cdp import find_chrome; sys.exit(0 if find_chrome() else 1)" || { echo "learn_web: no Chrome"; exit 77; }
[ -d site/node_modules ] || { echo "learn_web: no site/node_modules (cd site && pnpm install)"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
(cd site && pnpm -s exec astro build --outDir "$tmp/root/zinc" >"$tmp/build.log" 2>&1) || { tail -20 "$tmp/build.log"; echo "learn_web: the site does not build"; exit 1; }
for f in docs/learn/[0-9][0-9]-*.md; do
  n=$(basename "$f" .md)
  grep -q "^$n|.*|docs/learn/samples/$n|" learn/catalog.txt || continue
  grep -q "id=\"learn-run\"[^>]*data-src=\"/zinc/play/$n/\"" "$tmp/root/zinc/docs/learn/$n/index.html" || { echo "learn_web: the page of $n has no Run block"; fail=1; }
done
page=/zinc/docs/learn/01-window-and-shape/
state="(() => { const f = document.querySelector('.learn-frame iframe'), img = document.querySelector('article.prose img'); const w = f && f.contentWindow; return [f ? (w.__zincFrames || 0) : -1, !!(w && w.document.querySelector('canvas')), document.querySelector('.learn-start').hidden, document.querySelector('.learn-reset').hidden, img.closest('p').hidden, document.querySelector('.learn-cannot').hidden, document.querySelector('.learn-live').textContent].join('|'); })()"
out=$(python3 -I tools/web-browser-test "$tmp/root" --path "$page" --wait 1 --size 1200x900 --click-text "Run it here" --after 3 --eval "$state") || { echo "learn_web: Chrome failed: $out"; exit 1; }
printf '%s\n' "$out" | python3 -I -c '
import json, sys
o = json.load(sys.stdin)
f = str(o.get("eval")).split("|")
ok = not o["errors"] and len(f) == 7 and int(f[0]) >= 10 and f[1:6] == ["true", "true", "false", "true", "true"] and f[6] == "The program is running."
print("learn_web: Run on lesson 01: %s%s" % (o.get("eval"), "" if ok else ", errors %s, console %s" % (o["errors"][:3], o["console"][:3])))
sys.exit(0 if ok else 1)' || fail=1
# a browser without import maps keeps the picture and says so
out=$(python3 -I tools/web-browser-test "$tmp/root" --path "$page" --wait 1 --size 1200x900 --init "HTMLScriptElement.supports = undefined" --eval "$state") || { echo "learn_web: Chrome failed: $out"; exit 1; }
printf '%s\n' "$out" | python3 -I -c '
import json, sys
o = json.load(sys.stdin)
f = str(o.get("eval")).split("|")
ok = len(f) == 7 and f[0] == "-1" and f[4:6] == ["false", "false"] and "cannot run the lesson" in o["text"]
print("learn_web: no import maps: %s%s" % (o.get("eval"), "" if ok else ", text %r" % o["text"][-300:]))
sys.exit(0 if ok else 1)' || fail=1
# the frame of the exported program against the native run of the sample (a still picture: any frame)
out=$(python3 -I tools/web-browser-test site/public/play/01-window-and-shape --wait 2 --size 640x400 --shot "$tmp/web.png") || { echo "learn_web: Chrome failed: $out"; exit 1; }
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=3 ZINC_SHOT="$tmp/native.png" timeout 60 "$ZINC" run docs/learn/samples/01-window-and-shape >/dev/null 2>&1 || { echo "learn_web: the native run of lesson 01 failed"; exit 1; }
python3 -I tools/pngdiff "$tmp/native.png" "$tmp/web.png" --tol 8 --max-diff 800 >"$tmp/cmp.out" 2>&1 || { echo "learn_web: lesson 01 in the browser differs from the native frame: $(cat "$tmp/cmp.out")"; fail=1; }
exit $fail
