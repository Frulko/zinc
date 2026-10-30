#!/bin/sh
# A conditional child whose branch is a list of rows, as React code writes it (`{xs === undefined ? <Text/> : xs.map(...)}`,
# `{c ? xs.map(...) : null}`): it was refused with Z0113 ('i32 | i32[]'), the whole ternary taken for a .map call. Each branch is now
# lowered as a child of its own, and what the condition narrows stays narrowed in the rows. On the interpreter, AOT and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/p.tsx" <<'P'
import { render, useState } from 'zinc:ui/react';
const m = new Map<string, string[]>();
m.set('a', ['x', 'y']);
const out: string[] = [];
function mark(s: string): string { out.push(s); return s; }
function List(p: { k: string }): i32 {
  const items = m.get(p.k);
  return <View>
    {items === undefined ? <Text>{mark('none ' + p.k)}</Text> : items.map((s: string, i: i32) => <Text key={s}>{mark(s + (i > 0 ? items[i - 1] : ''))}</Text>)}
    {items !== undefined ? items.map((s: string) => <Text key={s}>{mark('+' + s)}</Text>) : null}
    {p.k === 'a' ? null : <Text>{mark('other ' + p.k)}</Text>}
  </View>;
}
function App(): i32 { return <View><List k="a" /><List k="b" /></View>; }
let f = 0;
render(App, 0xffffff, (dt: number) => { f++; if (f === 3) console.log(out.join(' ')); });
P
want="x yx +x +y none b other b"
fail=0
got=$(ZINC_HEADLESS=1 ZINC_FRAMES=5 timeout 60 "$ZINC" run --interp "$tmp/p.tsx" 2>&1 | tail -1)
[ "$got" = "$want" ] || { echo "interpreter: want '$want', got '$got'"; fail=1; }
got=$(ZINC_HEADLESS=1 ZINC_FRAMES=5 timeout 60 "$ZINC" run "$tmp/p.tsx" --engine quickjs 2>/dev/null | grep -v '^  \|^zinc run' | tail -1)
[ "$got" = "$want" ] || { echo "QuickJS: want '$want', got '$got'"; fail=1; }
if timeout 300 "$ZINC" build "$tmp/p.tsx" -o "$tmp/p" >/dev/null 2>&1; then
  got=$(ZINC_HEADLESS=1 ZINC_FRAMES=5 timeout 60 "$tmp/p" 2>&1 | tail -1)
  [ "$got" = "$want" ] || { echo "AOT: want '$want', got '$got'"; fail=1; }
else echo "AOT: build failed"; fail=1; fi
exit $fail
