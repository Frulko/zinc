// A live resize (tests/t1/window_live_resize.sh): the window HAL drags the window's corner out and back (ZINC_LIVE_RESIZE steps inside one poll,
// as AppKit's tracking loop does) and each step must be a frame of the program at the new size: the layout re-flows to it, an interval timer
// keeps firing, and the frames of the drag allocate within a bound.
import * as ui from 'zinc:ui';
import { allocations } from 'zinc:sys';
import { width, height, quit } from 'zinc:gfx';
const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'flex-row w-full h-full bg-slate-900');
const side = ui.createNode(ui.VIEW);
ui.setClass(side, 'w-40 h-full bg-slate-800 p-2');
const label = ui.createNode(ui.TEXT); ui.setClass(label, 'text-sm text-white'); ui.setText(label, 'Sidebar');
ui.insert(side, label, -1);
const pane = ui.createNode(ui.VIEW);
ui.setClass(pane, 'flex-1 h-full p-4 gap-2');
for (let i = 0; i < 6; i++) {
  const t = ui.createNode(ui.TEXT); ui.setClass(t, 'text-base text-slate-100'); ui.setText(t, 'A line of text that wraps when the pane is narrow, number ' + i);
  ui.insert(pane, t, -1);
}
ui.insert(root, side, -1); ui.insert(root, pane, -1);
let ticks = 0;
setInterval((): void => { ticks++; }, 4);
let f = 0, lastW = 0, lastH = 0, sizes = 0, bad = 0, lastChange = 0, ticks0 = -1, ticks1 = 0, allocs = 0, last = 0, layouts0 = 0, layouts1 = 0;
ui.mount(root, 0x0f172a, (dt: number) => {
  f++;
  const w = width(), h = height();
  // this callback runs before the frame lays out: the tree holds the layout of the previous frame, which must be at that frame's size
  const box = ui.screenBox(root);
  if (f > 3 && (box[2] !== lastW || box[3] !== lastH)) bad++;
  if (f > 3 && w !== lastW) {
    sizes++; lastChange = f;
    if (ticks0 < 0) { ticks0 = ticks; layouts0 = ui.layoutCount(); }
    ticks1 = ticks; layouts1 = ui.layoutCount();
  }
  lastW = w; lastH = h;
  if (sizes > 0) allocs += allocations() - last;   // the whole frame since the previous callback: layout, paint, present
  last = allocations();
  if (f > 30 && f - lastChange > 5) {
    console.log('sizes', sizes, 'stale', bad, 'timers', ticks1 - ticks0 > 0 ? 'ran' : 'stopped', 'layouts', layouts1 - layouts0);
    console.log('allocations', allocs);
    quit();
  }
});
