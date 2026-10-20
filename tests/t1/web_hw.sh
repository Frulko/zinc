#!/bin/sh
# The browser-API plugins of the web target (docs/targets/web.md, "Plugins"), in headless Chrome:
#  - zinc:serial (Web Serial), zinc:midi (Web MIDI), zinc:gphoto2 (WebUSB, PTP) and zinc:osc (OSC over a WebSocket relay) run against MOCKS of the hardware APIs
#    (tests/fixtures/web-hw/mocks.js, injected before the page: the same shape as the real APIs, real PTP containers, an echoing port; no real device was used);
#  - zinc:map on MapLibre GL JS: six offline tiles of Paris in the fixture's assets are drawn (the palette of the style is found in the pixels, labels come from the glyph server and
#    are not checked).
# The export also reports each plugin's browsers (W0601). Skipped (77) without Chrome or python3. Chrome only: Firefox and Safari are not tested here.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
command -v python3 >/dev/null 2>&1 || { echo "web_hw: no python3"; exit 77; }
python3 -I -c "import sys; sys.path.insert(0, 'tools'); from cdp import find_chrome; sys.exit(0 if find_chrome() else 1)" || { echo "web_hw: no Chrome"; exit 77; }
export ZINC_BACKGROUND=1
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
"$Z" export tests/fixtures/web-hw --target web -o "$tmp/hw" >"$tmp/hw.log" 2>&1 || { echo "web_hw: the export failed: $(cut -c1-400 "$tmp/hw.log")"; exit 1; }
for w in "webserial (plugin serial)" "webmidi (plugin midi)" "webusb (plugin gphoto2)"; do grep -q "W0601: $w" "$tmp/hw.log" || { echo "web_hw: no W0601 for $w"; fail=1; }; done
python3 -I tools/web-browser-test "$tmp/hw" --wait 2 --after 6 --size 900x500 --init "$(cat tests/fixtures/web-hw/mocks.js)" --click-text Run --eval 'JSON.stringify({codes: __usb.sent, set: __usb.setValue, sent: __midi.sent})' >"$tmp/hw.out" 2>&1 || { echo "web_hw: the page did not run: $(cut -c1-400 "$tmp/hw.out")"; exit 1; }
python3 -I - "$tmp/hw.out" <<'EOF' || fail=1
import json, sys
o = json.loads(open(sys.argv[1]).read().splitlines()[-1])
t = o["text"]
want = ["serial: 1 port web-serial:0 (usb 2341:43), echo hello, open true",
        "midi: in Mock Keys, out Mock Synth, notes 60/100/2 60/0/2",
        "midi virtual: Error: midi: a web page cannot create virtual MIDI ports",
        "osc: /fader/1 0.5", "osc udp: ZnUnsupported",
        "gphoto2: 1 camera, Mock Cam 1, 5 summary lines, 2 settings, iso 400 of 100/400/800, picture downloaded"]
bad = ["web_hw: missing in the page: " + w for w in want if w not in t]
e = json.loads(o["eval"])
if e["set"] != [32, 3]: bad.append("web_hw: SetDevicePropValue carried %s, not [32, 3] (800)" % e["set"])
if o["errors"]: bad.append("web_hw: errors: %s" % o["errors"])
if bad: print("\n".join(bad) + "\n" + t); sys.exit(1)
EOF
"$Z" export tests/fixtures/web-map --target web -o "$tmp/map" >"$tmp/map.log" 2>&1 || { echo "web_hw: the map export failed: $(cut -c1-400 "$tmp/map.log")"; exit 1; }
ls "$tmp"/map/maplibre.*.js >/dev/null 2>&1 || { echo "web_hw: the map export has no maplibre-gl script (web.scripts)"; fail=1; }
python3 -I tools/web-browser-test "$tmp/map" --wait 5 --size 960x600 --shot "$tmp/map.png" --eval '(() => { const c = document.getElementById("zinc-canvas"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let water = 0, park = 0, road = 0, bg = 0; for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i+1], b = d[i+2]; if (Math.abs(r - 170) < 8 && Math.abs(g - 211) < 8 && Math.abs(b - 223) < 8) water++; else if (Math.abs(r - 200) < 10 && Math.abs(g - 250) < 8 && Math.abs(b - 204) < 10) park++; else if (r > 240 && g > 150 && g < 200 && b < 140) road++; else if (r === 242 && g === 239 && b === 233) bg++; } return JSON.stringify({ water, park, road, bg }); })()' >"$tmp/map.out" 2>&1 || { echo "web_hw: map: $(cut -c1-300 "$tmp/map.out")"; fail=1; }
python3 -I - "$tmp/map.out" <<'EOF' || fail=1
import json, sys
o = json.loads(open(sys.argv[1]).read().splitlines()[-1])
p = json.loads(o["eval"])
bad = []
if p["water"] < 20000: bad.append("the river is %d pixels" % p["water"])
if p["park"] < 2000: bad.append("the parks are %d pixels" % p["park"])
if p["bg"] > 576000 * 0.5: bad.append("%d pixels are still the empty background" % p["bg"])
if o["errors"]: bad.append("errors: %s" % o["errors"])
if bad: print("web_hw: map: " + "; ".join(bad) + " " + json.dumps(p)); sys.exit(1)
EOF
exit $fail
