#!/bin/sh
# examples/ipod-web serves a fake iPod (a folder with iPod_Control/Device/SysInfo, no USB): the page names it, /pod.json gives its
# model and serial, another path is a 404. Port 8687 (a fixed port: run alone). Skipped (77) without the plugin's libraries.
cd "$(dirname "$0")/../.." || exit 2
pkg-config --exists glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0 2>/dev/null || { echo "skipped: the libraries of zinc:ipod are not installed"; exit 77; }
tmp=$(mktemp -d); pid=''
trap '[ -n "$pid" ] && kill $pid 2>/dev/null; rm -rf "$tmp"' EXIT
mkdir -p "$tmp/ZINCPOD/iPod_Control/Device"
printf 'ModelNumStr: xB029\npszSerialNumber: 8K1234ABCDE\nFirewireGuid: 0x000A27001234ABCD\n' > "$tmp/ZINCPOD/iPod_Control/Device/SysInfo"
ZINC_NATIVE=real ZINC_IPOD_ROOTS=$tmp ZINC_IPOD_NO_USB=1 "$ZINC" run examples/ipod-web -- --port 8687 >"$tmp/log" 2>&1 &
pid=$!
for i in $(seq 1 120); do curl -s -o /dev/null localhost:8687/ && break; sleep 0.5; done
fail=0
page=$(curl -s localhost:8687/)
case $page in *'<h2>ZINCPOD</h2>'*'Classic (Silver)'*) ;; *) echo "the page: $(echo "$page" | tail -c 300) $(tail -3 "$tmp/log")"; fail=1 ;; esac
js=$(curl -s localhost:8687/pod.json)
case $js in *'"Model": "Classic (Silver)"'*'"Serial number": "8K1234ABCDE"'*) ;; *) echo "the JSON: $js"; fail=1 ;; esac
code=$(curl -s -o /dev/null -w '%{http_code}' localhost:8687/nope)
[ "$code" = 404 ] || { echo "another path: $code"; fail=1; }
exit $fail
