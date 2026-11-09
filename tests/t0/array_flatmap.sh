#!/bin/sh
# flatMap follows dense-array callback/mutation semantics on every engine; thrown callbacks release their partial result.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
entry=tests/data/array_flatmap/main.ts
for engine in --interp --native '--engine quickjs'; do
  # shellcheck disable=SC2086
  if ! ZINC_HEADLESS=1 timeout 45 "$ZINC" run "$entry" $engine >"$tmp/log" 2>&1; then cat "$tmp/log"; exit 1; fi
  grep -q '^array flatMap: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
  # shellcheck disable=SC2086
  if ! ZINC_HEADLESS=1 timeout 30 "$ZINC" run tests/data/array_flatmap/inferred_union.ts $engine >"$tmp/log" 2>&1; then cat "$tmp/log"; exit 1; fi
  grep -q '^a,2$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
  # shellcheck disable=SC2086
  if ! ZINC_HEADLESS=1 timeout 30 "$ZINC" run tests/data/array_flatmap/mixed_tuple_named.ts $engine >"$tmp/log" 2>&1; then cat "$tmp/log"; exit 1; fi
  grep -q '^a,2,2$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
if ! ZINC_HEADLESS=1 timeout 15 "$ZINC" mem "$entry" --check-leaks >"$tmp/log" 2>&1; then cat "$tmp/log"; exit 1; fi
if LANG=en timeout 15 "$ZINC" check tests/data/array_flatmap/invalid.ts >"$tmp/log" 2>&1; then echo 'flatMap thisArg silently accepted'; exit 1; fi
grep -q 'argument' "$tmp/log" || { cat "$tmp/log"; exit 1; }
if LANG=en timeout 15 "$ZINC" check tests/data/array_flatmap/empty_tuple.ts >"$tmp/log" 2>&1; then echo 'empty tuple inferred without an element type'; exit 1; fi
grep -q 'give the callback an array return type' "$tmp/log" || { cat "$tmp/log"; exit 1; }

# Existing contextual tuple-union boundary is explicit; an already typed tuple above must flatten correctly.
if LANG=en timeout 15 "$ZINC" check tests/data/array_flatmap/mixed_tuple.ts >"$tmp/log" 2>&1; then echo 'tuple-union contextual typing changed; update this boundary assertion'; exit 1; fi
grep -q Z0103 "$tmp/log" || { cat "$tmp/log"; exit 1; }
