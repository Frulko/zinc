#!/bin/sh
# Array methods on an `any` value (`d.codecs.map(f)`, `.filter`, `.join`...), as TypeScript allows: they were refused with Z0105
# ('any' is not callable). The same lines on the interpreter, the default engine and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/t.ts" <<'TS'
const d: any = JSON.parse('{"c":[1,2,3],"n":["a","b"]}');
const xs = d.c.map((x: any) => x * 2);
console.log(xs.length, xs[2]);
console.log(d.n.join('+'), d.c.filter((x: any) => x > 1).length, d.c.includes(2), d.c.some((x: any) => x > 2));
const names: string[] = d.n.map((s: any): string => s + '!');
console.log(names.join(','));
d.c.forEach((x: any) => console.log(x));
TS
want='3 6
a+b 2 true true
a!,b!
1
2
3'
fail=0
for engine in --interp "" "--engine quickjs"; do
  got=$("$ZINC" run "$tmp/t.ts" $engine 2>&1 | grep -v '^  \|^zinc run')
  [ "$got" = "$want" ] || { echo "dyn_array_methods ${engine:-default}: got"; echo "$got"; fail=1; }
done
exit $fail
