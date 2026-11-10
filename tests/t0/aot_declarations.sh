#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
cat > "$tmp/main.ts" <<'TS'
function sum(n: i32, acc: i32): i32 { return n <= 0 ? acc : sum(n - 1, acc + n); }
function fact(n: i32): i32 { return n <= 1 ? 1 : n * fact(n - 1); }
console.log(sum(3, 0), fact(4));
TS
for pass in first second; do
  ZN_AOT_PART_BYTES=1 ZN_AOT_UNIT_FNS=1 ZN_KEEP_CPP=1 ZINC_LOG=debug ZINC_JOBS=3 \
    "$ZINC" build "$tmp/main.ts" -o "$tmp/app" > "$tmp/$pass.log" 2>&1 || { cat "$tmp/$pass.log"; exit 1; }
  [ "$("$tmp/app")" = '6 24' ]
  python3 - "$tmp" "$pass" <<'PY'
import hashlib, json, pathlib, re, sys
root, phase = pathlib.Path(sys.argv[1]), sys.argv[2]
headers = list(root.glob('*.hpp'))
assert len(headers) == 1, headers
header = headers[0]
digest = hashlib.sha256(header.read_bytes()).hexdigest()
units = {p.name: p.read_text() for p in root.glob('app*.cpp')}
assert len(units) >= 3, units.keys()
for name, source in units.items():
    assert source.startswith('// declarations sha256 ' + digest + '\n'), name
    assert '#include "' + header.name + '"' in source, name
    assert '#define ZFN' not in source, name
if phase == 'first':
    (root / 'units.json').write_text(json.dumps(units))
    source = (root / 'main.ts').read_text()
    source = source.replace('acc: i32)', 'acc: i32, extra: i32)').replace('acc + n)', 'acc + n, extra)').replace('sum(3, 0)', 'sum(3, 0, 0)')
    (root / 'main.ts').write_text(source)
else:
    previous = json.loads((root / 'units.json').read_text())
    assert units.keys() == previous.keys()
    assert all(units[name] != previous[name] for name in units), 'a declaration change left a cached unit key unchanged'
    assert any(units[name].split('\n', 1)[1] == previous[name].split('\n', 1)[1] for name in units), 'no unchanged body covered'
PY
done
# An exported split program keeps its header; a normal build cleans it up.
ZN_AOT_CPP_ONLY=1 ZN_AOT_PART_BYTES=1 ZN_AOT_UNIT_FNS=1 "$ZINC" build "$tmp/main.ts" -o "$tmp/app" > "$tmp/export.log" 2>&1
set -- "$tmp"/*.hpp
[ "$#" -eq 1 ] && [ -f "$1" ]
ZN_AOT_PART_BYTES=1 ZN_AOT_UNIT_FNS=1 "$ZINC" build "$tmp/main.ts" -o "$tmp/app" > "$tmp/clean.log" 2>&1
set -- "$tmp"/*.hpp
[ ! -e "$1" ]
if CXX=false ZN_AOT_PART_BYTES=1 ZN_AOT_UNIT_FNS=1 "$ZINC" build "$tmp/main.ts" -o "$tmp/app" > "$tmp/fail.log" 2>&1; then
  echo 'aot declarations: failing compiler succeeded'; exit 1
fi
set -- "$tmp"/*.hpp
[ ! -e "$1" ]
echo 'aot declarations: ok'
