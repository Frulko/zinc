// Scroll axes (owner, 2026-10-08): a vertical list in an `overflow: scroll` view must not move sideways when its content fits the width. A horizontal drag
// and a diagonal trackpad gesture leave scrollLeft at 0 (no rubber band on X), the vertical part still scrolls; a view wider than its content's viewport
// still scrolls on X.
import * as ui from 'zinc:ui';
import { createNodeRef, render, For } from 'zinc:ui/solid';

const list = createNodeRef(), wide = createNodeRef();
const rows: i32[] = [];
for (let i = 0; i < 30; i++) rows.push(i);
function App(): i32 {
  return <view style={{ flexDirection: 'row', gap: 10 }}>
    <view ref={list} style={{ width: 150, height: 200, overflow: 'scroll' }}>
      <For each={rows}>{(r: i32, i: i32) => <view style={{ height: 30 }}><text>{`row ${r}`}</text></view>}</For>
    </view>
    <view ref={wide} style={{ width: 120, height: 200, overflow: 'scroll' }}>
      <view style={{ width: 400, height: 100 }} />
    </view>
  </view>;
}
let frames = 0;
const r = (v: number): number => Math.round(v);
render(App, 0xffffff, (dt: number) => {
  frames++;
  if (frames === 2) {
    const b = ui.screenBox(list.node);
    ui.pointerAt(b[0] + 100, b[1] + 150, true);                 // a finger drags left and up
    for (let k = 1; k <= 6; k++) ui.pointerAt(b[0] + 100 - k * 12, b[1] + 150 - k * 10, true);
    console.log(`drag left and up: left ${r(ui.scrollLeft(list.node))} top ${r(ui.scrollTop(list.node))}`);
    ui.pointerAt(b[0] + 28, b[1] + 90, false);
    ui.trackpadAt(b[0] + 50, b[1] + 50, 40, 0, 1);              // a sideways trackpad swipe
    ui.trackpadAt(b[0] + 50, b[1] + 50, 40, 0, 1);
    console.log(`trackpad sideways: left ${r(ui.scrollLeft(list.node))}`);
    ui.trackpadAt(b[0] + 50, b[1] + 50, 0, 0, 2);
    const w = ui.screenBox(wide.node);
    ui.pointerAt(w[0] + 100, w[1] + 50, true);
    for (let k = 1; k <= 6; k++) ui.pointerAt(w[0] + 100 - k * 12, w[1] + 50, true);
    console.log(`wide content, drag left: left ${r(ui.scrollLeft(wide.node))}`);
    ui.pointerAt(w[0] + 28, w[1] + 50, false);
  }
});
