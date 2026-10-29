#!/bin/sh
# Array splice with items to insert (`a.splice(start, count, x, ...more)`, as in TypeScript): removed and inserted at once, with spreads,
# on numbers, strings and objects; the same lines on the interpreter, the default engine and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/t.ts" <<'TS'
class P { n: number; constructor(n: number) { this.n = n; } }
const a: number[] = [1, 2, 3, 4, 5];
const r = a.splice(1, 2, 9, 8, 7);
console.log(a.join(','), r.join(','));
const more: number[] = [20, 21];
a.splice(0, 0, ...more);
a.splice(a.length, 0, 30, ...more, 31);
console.log(a.join(','));
const s: string[] = ['a', 'b', 'c'];
console.log(s.splice(-1, 1, 'x', 'y').join(','), s.join(','));
const ps: P[] = [new P(1), new P(2)];
const moved = ps.splice(0, 1);
ps.splice(1, 0, ...moved, new P(3));
console.log(ps.map((p: P) => p.n).join(','));
const old = [1, 2, 3];
console.log(old.splice(1).join(','), old.join(','));
TS
want='1,9,8,7,4,5 2,3
20,21,1,9,8,7,4,5,30,20,21,31
c a,b,x,y
2,1,3
2,3 1'
fail=0
for engine in --interp "" "--engine quickjs"; do
  out=$("$ZINC" run "$tmp/t.ts" $engine 2>"$tmp/err")
  [ "$out" = "$want" ] || { echo "array_splice ($engine): $(printf '%s' "$out" | tr '\n' '|') $(tail -3 "$tmp/err" | tr '\n' ' ')"; fail=1; }
done
[ $fail = 0 ] && echo "array_splice: ok"
exit $fail
