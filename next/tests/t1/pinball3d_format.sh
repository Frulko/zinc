#!/bin/sh
# The pinball table format and its loader (ZN-649.01, examples/pinball3d/src/format, docs/pinball-table-format.md):
# - the table the example ships with loads, and its file is the canonical text: loading it and saving it gives the same bytes; the same table
#   written another way (other indentation, defaults spelled out) saves to those bytes too;
# - 16 broken copies (tests/data/pinball3d/break.py) each give the message that names the offending value by its path, and a file with three
#   faults gives the three at once;
# - a package made from the table folder loads as the folder does;
# - the reference document is the one the format's own definition prints;
# - the loader gives the same answers compiled.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || { echo "skipped: python3 is not installed"; exit 77; }
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
# absolute paths: a program of a project (a folder with a zinc.json) runs from the project's folder
tool=../examples/pinball3d/tools/table.ts
table=$(cd ../examples/pinball3d/assets/tables/tidal-lock && pwd)
doc=$(cd ../docs && pwd)/pinball-table-format.md
"$ZINC" run $tool -- check $table >"$tmp/check.out" 2>&1 || { echo "pinball3d_format: the table does not load: $(head -c 600 "$tmp/check.out")"; exit 1; }
grep -q '"Tidal Lock" is a valid table (version 1)' "$tmp/check.out" || { echo "pinball3d_format: check does not say the table is valid: $(cat "$tmp/check.out")"; fail=1; }
"$ZINC" run $tool -- print $table >"$tmp/saved.json" 2>&1
cmp -s "$tmp/saved.json" $table/table.json || { echo "pinball3d_format: load then save does not give the bytes of table.json (run tools/table.ts -- format)"; fail=1; }
# the same table as another program would write it: keys in another order, every default of the looks spelled out, one-space indentation
mkdir "$tmp/other"
python3 - $table/table.json "$tmp/other/table.json" <<'PY'
import json, sys
t = json.load(open(sys.argv[1]))
t = dict(reversed(list(t.items())))
for look in t['looks']:
    look.setdefault('shading', 'smooth'); look.setdefault('specular', '#000000'); look.setdefault('shininess', 30); look.setdefault('glow', '#000000'); look.setdefault('texture', '')
json.dump(t, open(sys.argv[2], 'w'), indent=1)
PY
"$ZINC" run $tool -- print "$tmp/other" 2>&1 | cmp -s - $table/table.json || { echo "pinball3d_format: a table written another way does not save to the canonical bytes"; fail=1; }
# broken files
python3 tests/data/pinball3d/break.py "$table/table.json" "$tmp/broken" >"$tmp/cases.txt" || { echo "pinball3d_format: break.py failed"; exit 1; }
n=0
while IFS="$(printf '\t')" read -r name expect; do
  n=$((n + 1))
  "$ZINC" run $tool -- check "$tmp/broken/$name" >"$tmp/out.txt" 2>&1 && { echo "pinball3d_format: the broken table '$name' is accepted"; fail=1; }
  grep -qF "$expect" "$tmp/out.txt" || { echo "pinball3d_format: '$name' does not say '$expect' but: $(head -c 400 "$tmp/out.txt")"; fail=1; }
done <"$tmp/cases.txt"
[ "$n" -ge 12 ] || { echo "pinball3d_format: only $n broken tables were made"; fail=1; }
"$ZINC" run $tool -- check "$tmp/broken/three" 2>&1 | grep -c "^  " | grep -qx 3 || { echo "pinball3d_format: three faults are not reported as three lines"; fail=1; }
# a package
"$ZINC" run $tool -- pack $table "$tmp/tidal.zpinball" >/dev/null 2>&1 || { echo "pinball3d_format: pack failed"; fail=1; }
"$ZINC" run $tool -- print "$tmp/tidal.zpinball" 2>&1 | cmp -s - $table/table.json || { echo "pinball3d_format: the package does not load as the folder"; fail=1; }
# the reference
"$ZINC" run $tool -- doc $table 2>&1 | cmp -s - "$doc" || { echo "pinball3d_format: docs/pinball-table-format.md is not what the format prints (tools/table.ts -- doc)"; fail=1; }
[ "$(grep -c '^```json' "$doc")" -ge 48 ] || { echo "pinball3d_format: a section of the reference has no example"; fail=1; }
# compiled
"$ZINC" build $tool -o "$tmp/table" >"$tmp/build.log" 2>&1 || { echo "pinball3d_format: the tool does not compile: $(tail -c 300 "$tmp/build.log")"; exit 1; }
"$tmp/table" print $table 2>&1 | cmp -s - $table/table.json || { echo "pinball3d_format: the compiled loader saves other bytes"; fail=1; }
"$tmp/table" check "$tmp/broken/reference" 2>&1 | grep -qF 'walls[2].surface: "rubberr" is not one of the surfaces' || { echo "pinball3d_format: the compiled loader does not name the fault"; fail=1; }
exit $fail
