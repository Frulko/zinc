#!/bin/sh
# The web export in a real-input Chrome (docs/targets/web.md "Tests"): trusted mouse and key events at a device pixel ratio of 2, a window resize, every console error collected.
# Regressions found by it: a tab left behind that still listens to the window size blanked the screen on show at the next resize (an update of an unmounted component), typed text
# arrived twice in a canvas field, DOM mode drew nothing for a program with no zinc:ui tree, a 404 for /favicon.ico, an error thrown every frame flooded the console.
# Skipped (77) without Chrome or python3. Chrome only.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
command -v python3 >/dev/null 2>&1 || { echo "web_real: no python3"; exit 77; }
python3 -I -c "import sys; sys.path.insert(0, 'tools'); from cdp import find_chrome; sys.exit(0 if find_chrome() else 1)" || { echo "web_real: no Chrome"; exit 77; }
out=$(timeout 280 python3 -I - "$Z" <<'EOF'
import importlib.machinery, importlib.util, os, sys, json
sys.path.insert(0, "tools")
ld = importlib.machinery.SourceFileLoader("wrt", "tools/web-real-test")
spec = importlib.util.spec_from_loader("wrt", ld); wrt = importlib.util.module_from_spec(spec); ld.exec_module(wrt)
zinc = sys.argv[1]; fails = []
def opts(**k):
    o = wrt.parse([])[1]; o.update(k); return o

# 1. the fixture, canvas mode, ratio 2: switch tabs, type, resize (the Home tab's size listener fires while Form is shown)
def steps(c, click, key, pump, w, h, res):
    click(w * 0.75, h - 20); pump(0.4)                     # the Form tab
    click(w / 2, 70); pump(0.3)                            # the field
    for ch in "hi": key(ch, "Key" + ch.upper(), text=ch, vk=ord(ch.upper()))
    c.call("Emulation.setDeviceMetricsOverride", {"width": w - 200, "height": h - 100, "deviceScaleFactor": 2, "mobile": False}); pump(0.8)
    click((w - 200) * 0.25, (h - 100) - 20); pump(0.3); click((w - 200) * 0.75, (h - 100) - 20); pump(0.4)   # Home and back to Form: still alive
    res["shotBytes"] = len(c.call("Page.captureScreenshot", {"format": "png"}).get("data", ""))
for render in ("canvas", "dom"):
    r = wrt.run(zinc, "tests/fixtures/web-real", opts(render=render, size="800x600", script=steps))
    typed = [m for m in r.get("console", []) if m.startswith("typed:")]
    if r.get("problems"): fails.append(render + ": " + "; ".join(r["problems"])[:300])
    if typed[-1:] != ["typed:hi"] and render == "canvas": fails.append(render + ": typed " + repr(typed))
    if r.get("frames", 0) < 5: fails.append(render + ": no frames")
# 2. no favicon request fails (the page declares an empty icon)
r = wrt.run(zinc, "tests/fixtures/web-real", opts(size="800x600", wait=2.0, script=lambda *a: None))
if r.get("problems"): fails.append("page load: " + "; ".join(r["problems"])[:300])
# 3. a program with no zinc:ui tree in DOM mode shows its drawing, and takes clicks
def raw(c, click, key, pump, w, h, res):
    px = "(() => { const v = document.querySelector('#zinc-root canvas'); return v ? Array.from(v.getContext('2d').getImageData(10, 10, 1, 1).data) : null; })()"
    res["canvas"] = c.eval("(() => { const v = document.querySelector('#zinc-root canvas'); return v ? [v.width, v.height, v.clientWidth] : null; })()")
    res["before"] = c.eval(px); click(300, 300); pump(0.4); res["after"] = c.eval(px)
r = wrt.run(zinc, "tests/fixtures/web-raw", opts(render="dom", size="800x600", wait=2.5, script=raw, allow=[r"willReadFrequently"]))
if not r.get("canvas") or r["canvas"][2] < 700: fails.append("dom raw: no full-window canvas " + str(r.get("canvas")))
elif r["canvas"][0] != r["canvas"][2] * 2: fails.append("dom raw: canvas not at ratio 2 " + str(r["canvas"]))
if not r.get("before") or r["before"][1] > 0x40 or not r.get("after") or r["after"][1] < 0x90: fails.append("dom raw: picture/click %s -> %s" % (r.get("before"), r.get("after")))
if r.get("problems"): fails.append("dom raw: " + "; ".join(r["problems"])[:300])
print("; ".join(fails) if fails else "ok"); sys.exit(1 if fails else 0)
EOF
) || { echo "web_real: $out"; exit 1; }
exit 0
