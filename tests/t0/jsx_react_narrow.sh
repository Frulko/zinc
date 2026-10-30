#!/bin/sh
# React model (zinc:ui/react): what a condition narrows reaches the elements and the props of its branch
# (`h.b !== null ? <Show b={h.b} />`, refused with Z0103/Z0107 as the lowering puts elements and props in functions of their own);
# a component may return null (drawn as nothing, also from `return c ? <X /> : null` after a return of an element); a component's
# props are evaluated once where it is written, as React does (a re-render of the child for its own state does not read them again).
# A generic component (FlatList<T>) takes its props the same way. On the interpreter, AOT and QuickJS.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/p.tsx" <<'P'
import { render, useState } from 'zinc:ui/react';
class Box { n: i32 = 7; }
class Holder { b: Box | null = null; }
const h = new Holder();
h.b = new Box();
const out: string[] = [];
let reads = 0;
function read(s: string): string { reads++; return s; }
function Show(p: { b: Box; label: string }) {
  const [k, setK] = useState<i32>(0);
  if (k < 2) setTimeout(() => { setK(k + 1); }, 0);
  out.push(`show ${p.b.n} ${p.label} ${k}`);
  return <Text>{p.label}</Text>;
}
function Maybe(p: { on: boolean }) {
  if (!p.on) return null;
  out.push('maybe');
  return <Text>on</Text>;
}
function Pick(p: { n: i32 }) {
  if (p.n > 1) return <Text>many</Text>;
  return p.n > 0 ? <Text>{`pick ${p.n}`}</Text> : null;
}
function Pair<T>(p: { a: T; b: T; show: (t: T) => string }): i32 { out.push(`pair ${p.show(p.a)}${p.show(p.b)}`); return <Text>pair</Text>; }
function App() {
  return <View>
    {h.b !== null ? <Text>{`n ${h.b.n}`}</Text> : null}
    {h.b !== null ? <Show b={h.b} label={read('x')} /> : null}
    <Maybe on={false} />
    {h.b !== null ? <Maybe on={true} /> : null}
    <Pick n={0} />
    {h.b !== null ? <Pair a={h.b} b={h.b} show={(b: Box) => `${b.n}`} /> : null}
  </View>;
}
let f = 0;
render(App, 0xffffff, (dt: number) => { if (++f === 8) console.log(`${out.join(', ')}; props read ${reads}`); });
P
want="show 7 x 0, maybe, pair 77, show 7 x 1, show 7 x 2; props read 1"
fail=0
got=$(ZINC_HEADLESS=1 ZINC_FRAMES=10 timeout 60 "$ZINC" run --interp "$tmp/p.tsx" 2>&1 | tail -1)
[ "$got" = "$want" ] || { echo "interpreter: want '$want', got '$got'"; fail=1; }
got=$(ZINC_HEADLESS=1 ZINC_FRAMES=10 timeout 60 "$ZINC" run "$tmp/p.tsx" --engine quickjs 2>/dev/null | grep -v '^  \|^zinc run' | tail -1)
[ "$got" = "$want" ] || { echo "QuickJS: want '$want', got '$got'"; fail=1; }
if timeout 300 "$ZINC" build "$tmp/p.tsx" -o "$tmp/p" >/dev/null 2>&1; then
  got=$(ZINC_HEADLESS=1 ZINC_FRAMES=10 timeout 60 "$tmp/p" 2>&1 | tail -1)
  [ "$got" = "$want" ] || { echo "AOT: want '$want', got '$got'"; fail=1; }
else echo "zinc build failed"; fail=1; fi
exit $fail
