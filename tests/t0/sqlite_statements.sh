#!/bin/sh
# zinc:sqlite: `db.prepare(sql).get()` in a loop does not run out of native statements, and more distinct statements than the native
# table holds (1024) still work (the oldest give their slot back and are prepared again), and a cursor reads a query a batch at a time;
# on the interpreter and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
want='same sql true true
evicted and prepared again true
finalized leaves the cache true
cursor in batches true true
slots given back at close true'
for e in --interp quickjs; do
  if [ $e = quickjs ]; then out=$("$ZINC" run tests/data/sqlite/statements.ts --engine quickjs 2>&1 | grep ' true\| false')
  else out=$("$ZINC" run --interp tests/data/sqlite/statements.ts 2>&1 | grep ' true\| false'); fi
  [ "$out" = "$want" ] || { echo "sqlite_statements: $e: $(echo "$out" | tr '\n' ' ')"; exit 1; }
done
echo "sqlite_statements: ok"
