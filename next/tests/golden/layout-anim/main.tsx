// LayoutAnimation (ZN-365): configureNext, then a change; moved and resized nodes go from their old box to their new one along the curve (linear here: 50 %
// half way), a node added fades in, a node removed fades out where it was and leaves at the end; the same in classic and rn (ZINC_UI_LAYOUT=rn).
import * as ui from 'zinc:ui';
import { LayoutAnimation, fadeOf, childCount } from 'zinc:ui';
import { createSignal, createNodeRef, render, Show, NodeRef } from 'zinc:ui/solid';
import { UI_LAYOUT } from 'zinc:platform';

const [wide, setWide] = createSignal<boolean>(false);
const [extra, setExtra] = createSignal<boolean>(false);
const [third, setThird] = createSignal<boolean>(true);
const a = createNodeRef(), b = createNodeRef(), col = createNodeRef();
function App(): i32 {
  return <view ref={col} style={{ flexDirection: 'column', gap: 10, padding: 10 }}>
    <view ref={a} style={{ width: wide() ? 200 : 100, height: 30 }} />
    <Show when={extra()}><view style={{ width: 50, height: 20 }} /></Show>
    <view ref={b} style={{ width: 80, height: wide() ? 60 : 30 }} />
    <Show when={third()}><view style={{ width: 40, height: 20 }} /></Show>
  </view>;
}
const r = (v: number): number => Math.round(v);
const box = (n: NodeRef): string => { const q = ui.screenBox(n.node); return `${r(q[0])},${r(q[1])} ${r(q[2])}x${r(q[3])}`; };
let frames = 0;
render(App, 0xffffff, (dt: number) => {
  if (++frames !== 2) return;
  console.log('layout ' + UI_LAYOUT);
  console.log('before: a ' + box(a) + ' b ' + box(b));
  LayoutAnimation.configureNext(LayoutAnimation.create(400, 'linear', 'opacity'), () => console.log('onEnd called'));
  setWide(true); setExtra(true);
  ui.screenBox(a.node);
  const added = ui.childAt(col.node, 1);
  console.log('at 0: a ' + box(a) + ' b ' + box(b) + ' added fade ' + fadeOf(added));
  ui.tick(200);
  console.log('at 50%: a ' + box(a) + ' b ' + box(b) + ' added fade ' + fadeOf(added));
  ui.tick(200);
  console.log('at 100%: a ' + box(a) + ' b ' + box(b) + ' added fade ' + fadeOf(added));
  LayoutAnimation.configureNext(LayoutAnimation.create(300, 'linear', 'opacity'));
  const slot = ui.childAt(ui.childAt(col.node, childCount(col.node) - 1), 0);   // the fragment <Show> fills
  const leaving = ui.childAt(slot, 0);
  setThird(false);
  ui.screenBox(a.node);
  ui.tick(150);
  console.log(`removing: still in the tree ${childCount(slot)}, fading ${fadeOf(leaving)}`);
  ui.tick(160);
  console.log(`removed: in the tree ${childCount(slot)}`);
});
