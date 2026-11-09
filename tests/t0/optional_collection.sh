#!/bin/sh
# Rewritten collection helpers retain receiver/argument short-circuiting and ordinary nullable diagnostics.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for engine in --interp --native '--engine quickjs'; do
  ZINC_HEADLESS=1 timeout 45 "$ZINC" run tests/data/optional_collection/main.ts $engine >"$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
  grep -q '^optional collection: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
  ZINC_HEADLESS=1 timeout 30 "$ZINC" run tests/data/optional_collection/original.ts $engine >"$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
  grep -q '^a$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
  echo "$engine: optional collection and original pass"
done
for bad in invalid-intermediate invalid-group; do
  if LANG=en timeout 15 "$ZINC" check "tests/data/optional_collection/$bad.ts" >"$tmp/log" 2>&1; then echo "$bad accepted"; exit 1; fi
  grep -Eq 'Z0106|Z0107' "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
ZINC_HEADLESS=1 timeout 20 "$ZINC" mem tests/data/optional_collection/main.ts --json --check-leaks >"$tmp/mem.json" 2>"$tmp/log" || { cat "$tmp/log"; exit 1; }
python3 - "$tmp/mem.json" <<'PYMEM'
import json, sys
stats=json.load(open(sys.argv[1]))
assert stats['allocs'] == stats['frees'] > 0 and stats['leaked'] == 0
PYMEM
