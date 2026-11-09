#!/bin/sh
# TDZ guards inline, but their non-returning error construction is shared across reads and value types.
cd "$(dirname "$0")/../.." || exit 2
set -eu
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/main.ts" <<'TS'
class Base { kind(): string { return 'base'; } }
class First extends Base { kind(): string { return 'first'; } }
class Second extends Base { kind(): string { return 'second'; } }
let touched: i32 = 0;
function touch(): i32 { touched++; return 1; }
function sum(): i32 { return value + touch(); }
function readText(): string { return text; }
function readItem(): Base { return item; }
try { sum(); } catch (e) { console.log('number', e instanceof ReferenceError, e.message); }
try { readText(); } catch (e) { console.log('string', e instanceof ReferenceError, e.message); }
try { readItem(); } catch (e) { console.log('object', e instanceof ReferenceError, e.message); }
function initialize(): i32 {
  try { sum(); } catch (e) { console.log('initializer', e instanceof ReferenceError, touched); }
  return 21;
}
let value: i32 = initialize();
let text: string = 'old';
let item: Base = new First();
console.log(sum(), readText(), readItem().kind(), readItem() instanceof First, touched);
value = 41; text = 'fresh'; item = new Second();
console.log(sum(), readText(), readItem().kind(), readItem() instanceof Second, touched);
TS
cat > "$tmp/expected" <<'OUT'
number true Cannot access 'value' before initialization
string true Cannot access 'text' before initialization
object true Cannot access 'item' before initialization
initializer true 0
22 old first true 1
42 fresh second true 2
OUT
"$ZINC" --emit=zbc "$tmp/main.ts" > "$tmp/code"
[ "$(grep -c 'New .*ReferenceError' "$tmp/code")" = 1 ] || { echo 'TDZ error construction was cloned'; exit 1; }
"$ZINC" run --interp "$tmp/main.ts" > "$tmp/out"
diff -u "$tmp/expected" "$tmp/out"
"$ZINC" run "$tmp/main.ts" --engine quickjs > "$tmp/out"
sed "s/Cannot access '\([^']*\)' before initialization/\1 is not initialized/" "$tmp/expected" > "$tmp/quickjs-expected"
diff -u "$tmp/quickjs-expected" "$tmp/out"
"$ZINC" build "$tmp/main.ts" -o "$tmp/main" > "$tmp/build.log" 2>&1 || { cat "$tmp/build.log"; exit 1; }
timeout 10 "$tmp/main" > "$tmp/out"
diff -u "$tmp/expected" "$tmp/out"
