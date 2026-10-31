#!/bin/sh
# for...of over a conditional of `any` and an array literal (`Array.isArray(op.items) ? op.items : [op.item]`, as Discord's member list
# ops give one item or several): the checker turned the array into a Dyn with a generated converter, then checked a copy of the iterable
# again in the program's scope, where the converter's name is not ("Cannot find name: '__dynTo289'"). The interpreter, the compiled run
# and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"
cat > "$tmp/t.ts" <<'TS'
const d: any = JSON.parse('{"ops":[{"item":{"v":1}},{"items":[{"v":2},{"v":3}]},{}]}');
let n = 0;
for (const op of d.ops) for (const it of Array.isArray(op.items) ? op.items : op.item !== undefined ? [op.item] : []) n += it.v;
console.log(n);
TS
want=6
fail=0
for engine in --interp "--engine quickjs" native; do
  if [ "$engine" = native ]; then got=$(ZINC_RUN=native "$ZINC" run "$tmp/t.ts" 2>&1 | grep -v '^zinc')
  else got=$("$ZINC" run "$tmp/t.ts" $engine 2>&1); fi
  [ "$got" = "$want" ] || { echo "forof_dyn_conditional $engine: got"; echo "$got"; fail=1; }
done
exit $fail
