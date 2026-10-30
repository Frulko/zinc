#!/bin/sh
# Array.splice with an `any` start or count (a field of parsed JSON, as Discord's member list ops give their index): the number it holds,
# as in TypeScript; the checker refused it ("'any' to 'number'") while a function's number parameter took it. The interpreter, the compiled
# run and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"
cat > "$tmp/t.ts" <<'TS'
const op: any = JSON.parse('{"index": 1, "count": 2}');
const xs: string[] = ['a', 'b', 'c', 'd'];
xs.splice(op.index, 0, 'z');
console.log(xs.join(','));
const gone = xs.splice(op.index, op.count);
console.log(gone.join(','), xs.join(','));
TS
want='a,z,b,c,d
z,b a,c,d'
fail=0
for engine in --interp "--engine quickjs" native; do
  if [ "$engine" = native ]; then got=$(ZINC_RUN=native "$ZINC" run "$tmp/t.ts" 2>&1 | grep -v '^zinc')
  else got=$("$ZINC" run "$tmp/t.ts" $engine 2>&1); fi
  [ "$got" = "$want" ] || { echo "splice_any $engine: got"; echo "$got"; fail=1; }
done
exit $fail
