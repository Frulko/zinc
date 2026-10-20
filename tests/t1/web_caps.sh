#!/bin/sh
# The capability warnings of zinc export --target web (docs/targets/web.md, "Capabilities and limits"): the web-caps fixture has a plugin whose browser version needs WebUSB and Web
# Serial. --check names the browsers of the target set that cannot give them (W0601), a Chromium-only set has nothing to say, --werror fails on a warning, zinc.json targets.web.browsers
# is read, a missing browser backend is W0602, and zinc explain knows the codes. In headless Chrome the program asks zinc:browser what the browser has. No browser is needed for the first part.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
export ZINC_BACKGROUND=1
fail=0
out=$("$Z" export tests/fixtures/web-caps --target web --check 2>&1); rc=$?
[ $rc -eq 0 ] || { echo "web_caps: --check failed ($rc): $out"; fail=1; }
echo "$out" | grep -q "W0601: webusb (plugin fakeusb) is not available in firefox (never shipped), safari (never shipped)" || { echo "web_caps: no W0601 for webusb: $out"; fail=1; }
echo "$out" | grep -q "W0601: webserial" || { echo "web_caps: no W0601 for webserial"; fail=1; }
echo "$out" | grep -q "chrome >= 111, firefox >= 115, safari >= 16.4" || { echo "web_caps: zinc.json targets.web.browsers was not read"; fail=1; }
out=$("$Z" export tests/fixtures/web-caps --target web --check --browsers "chrome >= 120, edge >= 120" 2>&1)
echo "$out" | grep -q "W0601" && { echo "web_caps: Chromium browsers got a warning: $out"; fail=1; }
echo "$out" | grep -q "nothing to warn about" || { echo "web_caps: a Chromium-only set should be clean: $out"; fail=1; }
"$Z" export tests/fixtures/web-caps --target web --check --werror >/dev/null 2>&1 && { echo "web_caps: --werror did not fail on a warning"; fail=1; }
out=$("$Z" export tests/fixtures/web-caps --target web --check --browsers "firefox >= 100" 2>&1)
echo "$out" | grep -q "importmap" || { echo "web_caps: no warning that Firefox 100 lacks import maps: $out"; fail=1; }
out=$("$Z" export examples/webrtc-call --target web --check 2>&1)
echo "$out" | grep -q "W060" && { echo "web_caps: the web-ready call demo warns: $out"; fail=1; }
"$Z" explain W0601 | grep -q "browser of the target set" || { echo "web_caps: zinc explain W0601"; fail=1; }
"$Z" explain W0602 | grep -q "browser backend" || { echo "web_caps: zinc explain W0602"; fail=1; }
"$Z" explain W0603 | grep -q "native service" || { echo "web_caps: zinc explain W0603"; fail=1; }
# in the browser: ZnUnsupported instead of a crash, supports() from what Chrome has
if command -v python3 >/dev/null 2>&1 && python3 -I -c "import sys; sys.path.insert(0, 'tools'); from cdp import find_chrome; sys.exit(0 if find_chrome() else 1)"; then
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
  "$Z" export tests/fixtures/web-caps --target web -o "$tmp/caps" >/dev/null 2>&1 || { echo "web_caps: the export failed"; exit 1; }
  python3 -I tools/web-browser-test "$tmp/caps" --wait 3 --size 800x500 --expect-text "browser: yes, web backend" >"$tmp/o" 2>&1 || { echo "web_caps: the page: $(cat "$tmp/o")"; fail=1; }
  grep -q "webusb: yes" "$tmp/o" || { echo "web_caps: Chrome should have WebUSB: $(cat "$tmp/o")"; fail=1; }
  grep -q "getUserMedia: yes" "$tmp/o" || { echo "web_caps: Chrome should have getUserMedia: $(cat "$tmp/o")"; fail=1; }
else echo "web_caps: no Chrome: the browser part is skipped"; fi
exit $fail
