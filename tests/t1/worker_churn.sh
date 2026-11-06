#!/bin/sh
# ZN-1001: 200 workers started and terminated leave no descriptor behind (each left its loop's kqueue and its wake-up's descriptor before,
# ~400 here), on the interpreter and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
count() { if [ -d "/proc/$1/fd" ]; then ls "/proc/$1/fd" | wc -l; else lsof -p "$1" 2>/dev/null | wc -l; fi; }
for engine in --interp "--engine quickjs"; do
  # shellcheck disable=SC2086
  ZINC_HEADLESS=1 "$ZINC" run tests/data/worker_churn/main.ts $engine > "$tmp/out" 2>&1 &
  p=$!
  i=0
  while [ $i -lt 600 ] && ! grep -q '^done 200' "$tmp/out" && kill -0 $p 2>/dev/null; do sleep 0.1; i=$((i+1)); done
  n=$(count $p | tr -d ' ')
  kill $p 2>/dev/null; wait $p 2>/dev/null
  grep -q '^done 200' "$tmp/out" || { echo "$engine: the 200 workers did not finish in 60 s"; cat "$tmp/out"; fail=1; continue; }
  [ "$n" -lt 100 ] || { echo "$engine: $n open descriptors after 200 workers (a leak per worker)"; fail=1; }
done
exit $fail
