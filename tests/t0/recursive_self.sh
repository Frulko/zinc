#!/bin/sh
# Immutable self references preserve identity and callback ownership without an RC cycle.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for engine in interp native quickjs; do
  case $engine in interp) set -- --interp;; native) set -- --native;; quickjs) set -- --engine quickjs;; esac
  timeout 30 env ZINC_HEADLESS=1 ZINC_STEPS=0 ZN_LEAK_CHECK=1 "$ZINC" run tests/golden/run/recursive_self.ts "$@" >"$tmp/out" 2>"$tmp/err" || { cat "$tmp/err"; exit 1; }
  diff tests/golden/run/recursive_self.out "$tmp/out"
  test ! -s "$tmp/err" || { cat "$tmp/err"; exit 1; }
done
timeout 20 env ZINC_HEADLESS=1 "$ZINC" mem tests/golden/run/recursive_self.ts --json --check-leaks >"$tmp/mem.json" 2>"$tmp/err" || { cat "$tmp/err"; exit 1; }
python3 - "$tmp/mem.json" <<'PY'
import json, sys
stats = json.load(open(sys.argv[1]))
assert stats['allocs'] == stats['frees'] > 0 and stats['leaked'] == 0
PY
echo 'recursive self: static bindings, identity, escaped callbacks and mutable controls pass without leaks'
