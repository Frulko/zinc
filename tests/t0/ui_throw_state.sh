#!/bin/sh
# State that a throw or a freed node used to leave behind (ZN-993, docs/reports/implicit-state-machines.md #16 #17):
# - solid: a throw in batch, untrack or an effect ended the batch never, so every later signal write stayed queued for good;
# - react: a render that throws, caught by its parent (an error boundary), left the child update open, so a reorder was never laid out;
# - ui: a node freed mid-drag kept the drag, and the next node made with its handle scrolled under a finger that never pressed it.
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
cat > "$tmp/solid.tsx" <<'P'
import { createSignal, createEffect, batch, untrack } from 'zinc:ui/solid';
const [n, setN] = createSignal<i32>(0);
const [m, setM] = createSignal<i32>(0);
const seen: string[] = [];
createEffect(() => { seen.push('n' + n()); });
createEffect(() => { const v = m(); if (v === 1) throw new Error('effect'); seen.push('m' + v); });
try { batch(() => { setN(1); throw new Error('x'); }); } catch (e) { seen.push('c1'); }
setN(2);
try { untrack(() => { throw new Error('y'); }); } catch (e) { seen.push('c2'); }
untrack(() => { seen.push('u'); });
setN(3);
try { batch(() => { setM(1); }); } catch (e) { seen.push('c3'); }
batch(() => { setN(4); setM(2); });
console.log(seen.join(','));
P
want='n0,m0,n1,c1,n2,c2,u,n3,c3,n4,m2'
for e in "" --engine; do
  if [ -n "$e" ]; then got=$(ZINC_HEADLESS=1 "$ZINC" run "$tmp/solid.tsx" --engine quickjs 2>&1 | grep -v "^  " | tail -1); else got=$(ZINC_HEADLESS=1 "$ZINC" run "$tmp/solid.tsx" 2>&1 | grep -v "^  " | tail -1); fi
  [ "$got" = "$want" ] || { echo "solid throw $e: want '$want', got '$got'"; fail=1; }
done
cat > "$tmp/react.tsx" <<'P'
import { render, useState } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
let flip: (v: boolean) => void = (v: boolean) => {};
function Bad(): i32 { throw new Error('render'); }
function Guard(): i32 { try { return <View><Bad /></View>; } catch (e) { return <Text>fallback</Text>; } }
function Row(p: { s: string }): i32 { return <View style={{ height: 20 }}><Text>{p.s}</Text></View>; }
function List(): i32 {
  const [r, sr] = useState<boolean>(false);
  flip = sr;
  const items = r ? ['b', 'a'] : ['a', 'b'];
  return <View>{items.map((s: string) => <Row key={s} s={s} />)}</View>;
}
function App(): i32 { return <View><Guard /><List /></View>; }
let f = 0;
render(App, 0xffffff, (dt: number) => {
  f++;
  if (f === 2) flip(true);
});
P
ZINC_HEADLESS=1 ZINC_FRAMES=5 ZINC_SCENE_DUMP="$tmp/scene.bin" "$ZINC" run "$tmp/react.tsx" >/dev/null 2>&1
got=$(python3 "$(dirname "$0")/../../tools/scene-texts" --cmds "$tmp/scene.bin" | awk '$1 == "TEXT" { print $3, $NF }' | sort -n | awk '{ print $2 }' | tr '\n' ' ')   # top to bottom
[ "$got" = "fallback b a " ] || { echo "react throw: the reorder after a caught render throw, want 'fallback b a', got '$got'"; fail=1; }
cat > "$tmp/drag.tsx" <<'P'
import * as ui from 'zinc:ui';
const root = ui.createNode(ui.VIEW);
function scroller(): i32 {
  const s = ui.createNode(ui.VIEW);
  ui.setClass(s, 'w-[150px] h-[200px] overflow-scroll');
  const c = ui.createNode(ui.VIEW);
  ui.setClass(c, 'h-[900px]');
  ui.insert(s, c, -1);
  ui.insert(root, s, -1);
  return s;
}
const a = scroller();
let f = 0;
ui.mount(root, 0xffffff, (dt: number) => {
  f++;
  if (f !== 2) return;
  const b = ui.screenBox(a);
  ui.pointerAt(b[0] + 50, b[1] + 150, true);
  for (let k = 1; k <= 3; k++) ui.pointerAt(b[0] + 50, b[1] + 150 - k * 10, true);
  ui.destroy(a);   // gone mid-drag
  const n = scroller();
  for (let k = 4; k <= 8; k++) ui.pointerAt(b[0] + 50, b[1] + 150 - k * 10, true);
  ui.pointerAt(b[0] + 50, b[1] + 70, false);
  console.log('recycled ' + (n === a) + ' top ' + Math.round(ui.scrollTop(n)));
});
P
got=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=4 "$ZINC" run "$tmp/drag.tsx" 2>&1 | grep recycled)
[ "$got" = "recycled true top 0" ] || { echo "freed mid-drag: want 'recycled true top 0', got '$got'"; fail=1; }
[ $fail = 0 ] && echo "ui throw state: ok"
exit $fail
