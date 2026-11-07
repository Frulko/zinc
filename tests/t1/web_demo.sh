#!/bin/sh
# The demo bar of an exported page (docs/targets/web.md, "Demo pages"): examples/museum-table (its Cdp, Process and Three native sides have no browser backend) and
# examples/ipod (its iPod plugin, processes and network servers) start in headless Chrome without an uncaught error, and the bar names what needs the desktop app.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
export ZINC_BACKGROUND=1
python3 -I -c "import sys; sys.path.insert(0, 'tools'); from cdp import find_chrome; sys.exit(0 if find_chrome() else 1)" 2>/dev/null || { echo "web_demo: no Chrome: skipped"; exit 0; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
for spec in "museum-table|Cdp, Process and Three need the desktop app" "ipod|Ipod, Process, network servers and sockets"; do
  d=${spec%%|*}; want=${spec#*|}
  "$Z" export "examples/$d" --target web -o "$tmp/$d" >"$tmp/$d.log" 2>&1 || { echo "web_demo: the export of $d failed: $(tail -5 "$tmp/$d.log")"; fail=1; continue; }
  timeout 90 python3 -I tools/web-browser-test "$tmp/$d" --wait 4 --size 1280x760 --expect-text "$want" >"$tmp/$d.o" 2>&1 || { echo "web_demo: $d: $(cut -c1-600 "$tmp/$d.o")"; fail=1; continue; }
  grep -q '"errors": \[\]' "$tmp/$d.o" || { echo "web_demo: $d threw: $(cut -c1-600 "$tmp/$d.o")"; fail=1; }
  grep -q 'ZnUnsupported\|Error' "$tmp/$d.o" && { echo "web_demo: $d logged an error: $(cut -c1-600 "$tmp/$d.o")"; fail=1; }
done
exit $fail
