#!/bin/sh
# Default expressions use the callee receiver and prior parameters after all supplied arguments have run.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for engine in --interp --native '--engine quickjs'; do
  ZINC_HEADLESS=1 timeout 45 "$ZINC" run tests/data/method_defaults/main.ts $engine >"$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
  grep -q '^method defaults: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
  ZINC_HEADLESS=1 timeout 30 "$ZINC" run tests/data/method_defaults/original.ts $engine >"$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
  grep -q '^two$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
  echo "$engine: method defaults and original pass"
done
for bad in invalid-this invalid-null; do
  if LANG=en timeout 15 "$ZINC" check "tests/data/method_defaults/$bad.ts" >"$tmp/log" 2>&1; then echo "$bad accepted"; exit 1; fi
  case "$bad" in invalid-this) code=Z0112;; invalid-null) code=Z0103;; esac
  grep -q "error $code" "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
ZINC_HEADLESS=1 timeout 20 "$ZINC" mem tests/data/method_defaults/main.ts --json --check-leaks >"$tmp/mem.json" 2>"$tmp/log" || { cat "$tmp/log"; exit 1; }
python3 - "$tmp/mem.json" <<'PYMEM'
import json, sys
stats=json.load(open(sys.argv[1]))
assert stats['allocs'] == stats['frees'] > 0 and stats['leaked'] == 0
PYMEM
