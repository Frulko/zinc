// Precise scrolling as the macOS HAL reports it (scripted by tests/t1/scroll_momentum.sh through ZINC_INPUT `scroll DX DY PHASE`): the fingers move
// the list 1:1 by fractional pixels, after the lift (phase 4) the OS momentum's deltas (phase 5) are followed as they come with no inertia of the
// engine added, fingers landing (phase 3) drop the rest of it, a momentum that reaches the end bounces and rests there, a wheel notch eases by
// 48 px (in one frame with reduced motion), and the engine's own inertia still follows a plain lift (phase 2, HALs without OS momentum).
// At frame 17 the program moves the offset by 30 px with ui.scrollBy (rows loaded above, kept in place): the momentum goes on.
// Prints the frame and the offset each time it changes.
import * as ui from 'zinc:ui';
import { createNodeRef, render, For } from 'zinc:ui/solid';

const list = createNodeRef();
const rows: i32[] = [];
for (let i = 0; i < 30; i++) rows.push(i);
function App(): i32 {
  return <View ref={list} style={{ width: 200, height: 200, overflow: 'scroll' }}>
    <For each={rows}>{(r: i32, i: i32) => <View style={{ height: 30 }}><Text>{`row ${r}`}</Text></View>}</For>
  </View>;
}
let frame = 0, last = -1;
render(App, 0xffffff, (dt: number) => {
  if (frame === 17) ui.scrollBy(list.node, 0, 30);
  const y = Math.round(ui.scrollTop(list.node) * 100) / 100;
  if (y !== last) console.log(`${frame} ${y}`);
  last = y; frame++;
});
