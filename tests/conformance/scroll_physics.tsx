// zinc-test: max-frames 300
// Scroll physics driven by the test hooks at a fixed 60 Hz: a drag follows the pointer 1:1, the release starts an
// inertia that decelerates (0.998 per ms) and stops, a drag past the top shows the rubber band (less than the
// pointer moved) and springs back to 0, and mouse-wheel notches ease to 48 px per notch.
import { createNodeRef, render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';

const list = createNodeRef();
const rows: i32[] = [];
for (let i = 0; i < 60; i++) rows.push(i);

function App(): i32 {
  return <View class="flex-col h-full">
    <ScrollView ref={list} class="h-[200]">
      {rows.map((i: i32) => <View class="h-[40] px-2 justify-center"><Text>{`row ${i}`}</Text></View>)}
    </ScrollView>
  </View>;
}

const top = (): i32 => Math.round(ui.scrollTop(list.node));
let f = 0, x = 0, y = 0;
const log: string[] = [];
render(App, 0xffffff, (dt: number) => {
  f++;
  if (f === 2) { ui.pointerAt(0, 0, false); const b = ui.screenBox(list.node); x = b[0] + 40; y = b[1] + 180; ui.pointerAt(x, y, true); }
  // drag up 25 px per frame for 6 frames, then let go
  if (f >= 3 && f <= 8) { y -= 25; ui.pointerAt(x, y, true); }
  if (f === 8) log.push(`dragged ${top()}`);
  if (f === 9) ui.pointerAt(x, y, false);
  if (f === 12 || f === 30 || f === 90) log.push(`inertia f${f} ${top()}`);
  if (f === 150) { log.push(`rest ${top()}`); ui.scrollTo(list.node, 0, 0); }
  // at the top, drag down 40 px per frame: the content follows less and less (rubber band)
  if (f === 152) { const b = ui.screenBox(list.node); x = b[0] + 40; y = b[1] + 20; ui.pointerAt(x, y, true); }
  if (f >= 153 && f <= 157) { y += 40; ui.pointerAt(x, y, true); }
  if (f === 157) log.push(`pulled 200 px, shown ${top()}`);
  if (f === 158) ui.pointerAt(x, y, false);
  if (f === 170) log.push(`bouncing ${top()}`);
  if (f === 220) log.push(`back ${top()}`);
  if (f === 222) { const b = ui.screenBox(list.node); ui.wheelAt(b[0] + 40, b[1] + 40, -3); }
  if (f === 226) log.push(`wheel easing ${top()}`);
  if (f === 262) { log.push(`wheel ${top()}`); for (const l of log) console.log(l); quit(); }
});
