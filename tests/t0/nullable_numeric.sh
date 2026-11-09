#!/bin/sh
# Boxed numeric coercions preserve nullish values and use scalar conversion rather than unrelated reference casts.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for engine in --interp --native '--engine quickjs'; do
  # shellcheck disable=SC2086
  ZINC_HEADLESS=1 timeout 45 "$ZINC" run tests/data/nullable_numeric/main.ts $engine >"$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
  grep -q '^nullable numeric: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
  # The original optional Map.length program stays unchanged, including its number | undefined return.
  # shellcheck disable=SC2086
  ZINC_HEADLESS=1 timeout 45 "$ZINC" run tests/data/nullable_numeric/original.ts $engine >"$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
  grep -q '^1$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
for bad in invalid-fixed invalid-null invalid-boolean; do
  if LANG=en timeout 15 "$ZINC" check "tests/data/nullable_numeric/$bad.ts" >"$tmp/log" 2>&1; then echo "$bad: invalid conversion accepted"; exit 1; fi
  grep -q 'Z0103' "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
ZN_NO_OPT=1 timeout 20 "$ZINC" --emit=ir-rc tests/data/nullable_numeric/main.ts >"$tmp/ir" 2>&1 || { cat "$tmp/ir"; exit 1; }
python3 - "$tmp/ir" <<'PYIR'
import re, sys
ir = open(sys.argv[1]).read()
match = re.search(r'(?ms)^func @widen\(.*?(?=^func @|\Z)', ir)
assert match, 'missing generic nullable numeric return path'
body = match[0]
assert 'refcast' not in body, 'numeric boxes were reference-cast'
assert re.search(r'%\d+: i32 = getfield', body), 'present source payload was not unboxed'
assert re.search(r'%\d+: f64 = conv', body), 'scalar conversion was not applied'
assert 'new "Box<f64>"' in body and 'condbr' in body and 'const null' in body
PYIR
ZINC_HEADLESS=1 timeout 20 "$ZINC" mem tests/data/nullable_numeric/main.ts --json --check-leaks >"$tmp/mem.json" 2>"$tmp/log" || { cat "$tmp/log"; exit 1; }
python3 - "$tmp/mem.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d['allocs'] == d['frees'] > 0 and d['leaked'] == 0
PY
