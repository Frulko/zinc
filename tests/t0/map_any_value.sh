#!/bin/sh
# A Map of `any` values (`Map<string, any>`): get() is `any | undefined`, which is `any` as in TypeScript; the IR used to refuse the
# type ("this type in the IR"). The same lines on the interpreter, the default engine and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/t.ts" <<'TS'
const sent: Map<string, any> = new Map<string, any>();
sent.set('a', { x: 1, name: 'one' });
const m: any = sent.get('a');
console.log(m.x, m.name);
const missing = sent.get('b');
console.log(missing === undefined, sent.get('a') !== undefined);
TS
want='1 one
true true'
fail=0
for engine in --interp "" "--engine quickjs"; do
  got=$("$ZINC" run "$tmp/t.ts" $engine 2>&1)
  [ "$got" = "$want" ] || { echo "map_any_value ${engine:-default}: got"; echo "$got"; fail=1; }
done
exit $fail
