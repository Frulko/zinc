#!/bin/sh
# Array methods on an `any` value (`d.codecs.map(f)`, `.filter`, `.join`...), as TypeScript allows: they were refused with Z0105
# ('any' is not callable). Mutation (`push`, `splice`, `sort`...) changes the array the any holds, not a copy (ZN-1035), and the
# string methods run on the string it holds. The same lines on the interpreter, the default engine and QuickJS.
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
const e: any = JSON.parse('{"items":[3,1,2],"name":" Ada ","tags":["b","a","c"]}');
e.items.push(10);
e.tags.sort();
console.log(JSON.stringify(e.items), e.tags.join(''));
e.items.sort((a: any, b: any) => a - b);
console.log(JSON.stringify(e.items.splice(1, 2)), JSON.stringify(e));
console.log(e.items.pop(), e.tags.shift(), e.tags.reverse().join(''), e.items.reduce((s: any, x: any) => s + x, 0));
console.log(e.name.trim().toUpperCase(), e.name.includes('Ad'), e.name.indexOf('d'), e.name.slice(1, 3), e.name.split('d').length);
console.log(e.tags.indexOf('b'), JSON.stringify(e.tags.slice(1)), e.name.replace('Ada', 'Bob').length);
TS
want='3 6
a+b 2 true true
a!,b!
1
2
3
[3,1,2,10] abc
[2,3] {"items":[1,10],"name":" Ada ","tags":["a","b","c"]}
10 a cb 1
ADA true 2 Ad 2
1 ["b"] 5'
fail=0
for engine in --interp "" "--engine quickjs"; do
  got=$("$ZINC" run "$tmp/t.ts" $engine 2>&1 | grep -v '^  \|^zinc run')
  [ "$got" = "$want" ] || { echo "dyn_array_methods ${engine:-default}: got"; echo "$got"; fail=1; }
done
exit $fail
