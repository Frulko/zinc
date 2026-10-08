// Object styles: string-valued keys decided at run time (ZN-362). A conditional between literals of an enum key (fontWeight, display, textAlign,
// flexDirection, justifyContent, alignItems, position, overflow), of a colour key (backgroundColor, color, bg) and a numeric fontWeight follow a signal.
import * as ui from 'zinc:ui';
import { createSignal, createNodeRef, render } from 'zinc:ui/solid';
import { quit } from 'zinc:gfx';

const [on, setOn] = createSignal<boolean>(false);
const [w, setW] = createSignal<number>(400);
const box = createNodeRef(), label = createNodeRef(), num = createNodeRef(), gone = createNodeRef();
function App(): i32 {
  return <view style={{ padding: 10, gap: 8 }}>
    <view ref={box} style={{ flexDirection: on() ? 'row' : 'column', justifyContent: on() ? 'space-between' : 'flex-start', alignItems: on() ? 'center' : 'stretch',
      position: on() ? 'absolute' : 'relative', overflow: on() ? 'hidden' : 'visible', backgroundColor: on() ? '#0f766e' : 'white' }}>
      <text ref={label} style={{ fontWeight: on() ? 'bold' : 'normal', textAlign: on() ? 'center' : 'left', color: on() ? '#ff5a36' : '#1c1917' }}>label</text>
    </view>
    <text ref={num} style={{ fontWeight: w(), bg: on() ? 'black' : 'white' }}>weight</text>
    <view ref={gone} style={{ display: on() ? 'none' : 'flex', height: 10, fontWeight: on() ? 700 : 400 }} />
  </view>;
}
function hex(v: i32): string { if (v < 0) return '-'; let o = ''; for (let k = 20; k >= 0; k -= 4) o += '0123456789abcdef'.charAt((v >> k) & 15); return o; }
function show(when: string): void {
  const b = ui.inspectNode(box.node) as ui.UiNode, l = ui.inspectNode(label.node) as ui.UiNode, n = ui.inspectNode(num.node) as ui.UiNode, g = ui.inspectNode(gone.node) as ui.UiNode;
  console.log(`${when}: row ${b.row} justify ${b.justify} align ${b.align} abs ${b.abs} overflow ${b.overflow} bg ${hex(b.bg)} | bold ${l.bold} talign ${l.talign} fg ${hex(l.fg)} | weight bold ${n.bold} bg ${hex(n.bg)} | hidden ${g.hidden} bold ${g.bold}`);
}
let f = 0;
render(App, 0xffffff, (dt: number) => {
  f++;
  if (f === 2) { show('off'); setOn(true); setW(700); }
  if (f === 3) { show('on'); quit(); }
});
