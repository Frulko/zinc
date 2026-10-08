#!/bin/sh
# Image comparison and goldens of zinc sim (ZN-299): --update-goldens writes the screenshot and rewrites the hash of expect-frame; a compare-with at 0.5% tolerance passes a 2x2 pixel change and fails a text
# shifted by one pixel; the expect-logic step says plainly that a program has no pins to watch.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mk() { mkdir -p "$tmp/$1"; cp tests/golden/sim/text/zinc.json "$tmp/$1/"; sed "$2" tests/golden/sim/text/main.ts > "$tmp/$1/main.ts"; }
mk base 's/XSHIFT/0/'; mk shifted 's/12, 20/13, 20/'; mk dot "s|^});|  drawText(f, 150, 40, '.', 0xff0000, 255, 0);\n});|"
cat > "$tmp/s.yaml" <<Y
name: text
project: base
steps:
  - advance: 100ms
  - expect-frame: { part-id: lcd, hash: "0000000000000000" }
  - take-screenshot: { part-id: lcd, compare-with: shots/text.png, tolerance: 0.5% }
Y
"$ZINC" sim "$tmp/s.yaml" --update-goldens >/dev/null || { echo "update goldens failed"; exit 1; }
[ -s "$tmp/shots/text.png" ] || { echo "no golden image written"; exit 1; }
grep -q 'hash: "[0-9a-f]\{16\}"' "$tmp/s.yaml" && ! grep -q 0000000000000000 "$tmp/s.yaml" || { echo "the hash was not rewritten: $(grep hash "$tmp/s.yaml")"; exit 1; }
out=$("$ZINC" sim "$tmp/s.yaml" 2>&1) || { echo "the golden does not pass: $out"; exit 1; }
cat > "$tmp/c.yaml" <<Y
name: compare
project: shifted
steps:
  - advance: 100ms
  - take-screenshot: { part-id: lcd, compare-with: shots/text.png, tolerance: 0.5% }
Y
out=$("$ZINC" sim "$tmp/c.yaml" 2>&1) && { echo "a text shifted by one pixel must fail: $out"; exit 1; }
echo "$out" | grep -q "pixels differ" || { echo "message: $out"; exit 1; }
sed 's/project: shifted/project: dot/' "$tmp/c.yaml" > "$tmp/d.yaml"
out=$("$ZINC" sim "$tmp/d.yaml" 2>&1) || { echo "a dot of 2x2 pixels must pass at 0.5%: $out"; exit 1; }
cat > "$tmp/l.yaml" <<Y
project: base
steps:
  - expect-logic: { pins: [mcu:GPIO2], window: 1s, edges: 4 }
Y
out=$("$ZINC" sim "$tmp/l.yaml" 2>&1) && { echo "expect-logic must not pass without pins"; exit 1; }
echo "$out" | grep -q "does not report pins" || { echo "expect-logic message: $out"; exit 1; }
echo "sim_compare: ok"
