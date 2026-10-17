#!/bin/sh
# How close the semantic DOM is to the canvas picture (docs/targets/web.md, "The semantic DOM", "Differences"): the same apps exported with --render canvas and --render dom, opened in
# headless Chrome at the same size, driven by the same clicks, and compared pixel by pixel (tools/web-compare): the hero demo (intro, then home with live numbers, masked), the
# desktop-app template (home, notes, settings) and the nuxt-ui example. The thresholds are the measured differences (fonts are the system's in both, CSS rounds text and lines a
# little differently) with a margin: a layout that moves, a colour that is lost or a missing element makes them fail. Skipped (77) without Chrome, python3, PIL or numpy.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
command -v python3 >/dev/null 2>&1 || { echo "web_dom_visual: no python3"; exit 77; }
python3 -c "import PIL, numpy" 2>/dev/null || { echo "web_dom_visual: no PIL or numpy"; exit 77; }
python3 -I -c "import sys; sys.path.insert(0, 'tools'); from cdp import find_chrome; sys.exit(0 if find_chrome() else 1)" || { echo "web_dom_visual: no Chrome"; exit 77; }
export ZINC_BACKGROUND=1
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
both() {   # <name> <project>
  for r in canvas dom; do "$Z" export "$2" --target web --render "$r" -o "$tmp/$1-$r" >/dev/null 2>"$tmp/err" || { echo "web_dom_visual: export of $1 ($r) failed: $(tail -3 "$tmp/err")"; return 1; }; done
}
judge() {   # <name> <json> <mean,gt16 per step...>
  name=$1; json=$2; shift 2
  python3 -I -c '
import json, sys
res = json.loads(sys.argv[2]); lim = [tuple(float(v) for v in a.split(",")) for a in sys.argv[3:]]
bad = []
for r, (m, g) in zip(res, lim):
    if "error" in r: bad.append("%s: %s" % (r["step"], r["error"]))
    elif r["mean"] > m or r["gt16"] > g: bad.append("%s: mean %.2f (max %g), %.1f%% of the pixels differ (max %g%%)" % (r["step"], r["mean"], m, r["gt16"] * 100, g * 100))
sys.exit("web_dom_visual: %s: %s" % (sys.argv[1], "; ".join(bad)) if bad else 0)' "$name" "$json" "$@" || fail=1
}
both hero ../examples/hero || exit 1
out=$(python3 tools/web-compare "$tmp/hero-canvas" "$tmp/hero-dom" --size 1200x800 --steps "wait:1;click-text:Get started;wait:2" --mask "264,176,904,110;264,308,590,330;1050,20,70,30;60,10,90,20" 2>"$tmp/err") || { echo "web_dom_visual: hero: $(cat "$tmp/err") $out"; exit 1; }
judge hero "$out" 2.0,0.03 3.0,0.06 3.0,0.06
"$Z" new desktop-app "$tmp/notes" >/dev/null 2>&1 || { echo "web_dom_visual: zinc new desktop-app failed"; exit 1; }
both notes "$tmp/notes" || exit 1
out=$(python3 tools/web-compare "$tmp/notes-canvas" "$tmp/notes-dom" --size 1100x700 --steps "wait:1;click-text:Open notes;wait:1;click-text:Settings;wait:1" 2>"$tmp/err") || { echo "web_dom_visual: notes: $(cat "$tmp/err") $out"; exit 1; }
judge notes "$out" 1.8,0.025 1.8,0.025 1.8,0.025 2.2,0.03 2.2,0.03
both nuxt ../examples/nuxt-ui || exit 1
out=$(python3 tools/web-compare "$tmp/nuxt-canvas" "$tmp/nuxt-dom" --size 1100x720 --steps "wait:1.5" 2>"$tmp/err") || { echo "web_dom_visual: nuxt-ui: $(cat "$tmp/err") $out"; exit 1; }
judge nuxt-ui "$out" 6.0,0.06
exit $fail
