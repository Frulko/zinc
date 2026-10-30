#!/bin/sh
# A component that returns null renders nothing, as in React and Solid (`if (users.length === 0) return null;`): it was refused with Z0103
# ('null | i32' to 'i32'), and a function returning T where one returning a union with T is expected (`() => i32` as `() => i32 | null`)
# was refused too; the checker now wraps it. React mode (re-rendered, the component turning on and off) and Solid mode, on the
# interpreter, QuickJS and AOT.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/r.tsx" <<'P'
import { render, useState } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
let flip: (n: i32) => void = (n: i32): void => {};
function Maybe(p: { n: i32 }) {
  if (p.n === 0) return null;
  return <Text>{`n${p.n}`}</Text>;
}
function App() {
  const [n, setN] = useState<i32>(0);
  flip = setN;
  return <View><Maybe n={n} /><Text>end</Text></View>;
}
function walk(h: i32, out: string[]): void { const l = ui.textLines(h); if (l.length > 0) out.push(l.join('')); for (let i = 0; i < ui.childCount(h); i++) walk(ui.childAt(h, i), out); }
const texts = (): string => { const out: string[] = []; walk(ui.rootNode(), out); return out.join(','); };
let f = 0;
render(App, 0xffffff, (dt: number) => {
  f++;
  if (f === 2) { console.log(`react ${texts()}`); flip(3); }
  else if (f === 4) { console.log(`react ${texts()}`); flip(0); }
  else if (f === 6) console.log(`react ${texts()}`);
});
P
cat > "$tmp/s.tsx" <<'P'
import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
function Maybe(p: { n: i32 }) {
  if (p.n === 0) return null;
  return <Text>{`n${p.n}`}</Text>;
}
function App() { return <View><Maybe n={0} /><Maybe n={2} /></View>; }
function walk(h: i32, out: string[]): void { const l = ui.textLines(h); if (l.length > 0) out.push(l.join('')); for (let i = 0; i < ui.childCount(h); i++) walk(ui.childAt(h, i), out); }
const texts = (): string => { const out: string[] = []; walk(ui.rootNode(), out); return out.join(','); };
let f = 0;
render(App, 0xffffff, (dt: number) => { if (++f === 2) console.log(`solid ${texts()}`); });
P
want="react end
react n3,end
react end
solid n2"
fail=0
run() { { ZINC_HEADLESS=1 ZINC_FRAMES=8 timeout 60 "$@" "$tmp/r.tsx"; ZINC_HEADLESS=1 ZINC_FRAMES=4 timeout 60 "$@" "$tmp/s.tsx"; } 2>&1 | grep -E '^(react|solid) '; }
got=$(run "$ZINC" run --interp)
[ "$got" = "$want" ] || { echo "interpreter: want '$want', got '$got'"; fail=1; }
got=$({ ZINC_HEADLESS=1 ZINC_FRAMES=8 timeout 60 "$ZINC" run "$tmp/r.tsx" --engine quickjs; ZINC_HEADLESS=1 ZINC_FRAMES=4 timeout 60 "$ZINC" run "$tmp/s.tsx" --engine quickjs; } 2>/dev/null | grep -E '^(react|solid) ')
[ "$got" = "$want" ] || { echo "QuickJS: want '$want', got '$got'"; fail=1; }
if timeout 300 "$ZINC" build "$tmp/r.tsx" -o "$tmp/r" >/dev/null 2>&1 && timeout 300 "$ZINC" build "$tmp/s.tsx" -o "$tmp/s" >/dev/null 2>&1; then
  got=$({ ZINC_HEADLESS=1 ZINC_FRAMES=8 timeout 60 "$tmp/r"; ZINC_HEADLESS=1 ZINC_FRAMES=4 timeout 60 "$tmp/s"; } 2>&1 | grep -E '^(react|solid) ')
  [ "$got" = "$want" ] || { echo "AOT: want '$want', got '$got'"; fail=1; }
else echo "zinc build failed"; fail=1; fi
exit $fail
