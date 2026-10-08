// A relayout of the whole page allocates nothing (ZN-189): padding-top of the root changes every frame, so measure() and place() run over every node; text lines are kept (wrapText's cache), child lists are pooled per depth.
// (first line of tests/golden/ui-alloc was:) 12 rows with text and buttons and a focused text field, repainted every frame for 600 frames (the caret blinks, the pointer moves over the rows): the runtime allocator's counter does not move.
import * as ui from 'zinc:ui';
import { allocations } from 'zinc:sys';
import { quit } from 'zinc:gfx';
const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'flex-col gap-2 p-3 w-full bg-white');
for (let i = 0; i < 12; i++) {
  const r = ui.createNode(ui.VIEW);
  ui.setClass(r, 'flex-row gap-2 p-2 rounded-lg border bg-slate-50 hover:bg-slate-100 hover:shadow-md');
  const t = ui.createNode(ui.TEXT); ui.setClass(t, 'text-sm text-slate-900 underline'); ui.setText(t, 'Row number ' + i);
  const b = ui.createNode(ui.BUTTON); ui.setClass(b, 'px-3 py-1 rounded bg-indigo-600 ring-2 ring-indigo-300'); ui.setNumber(b, 'focusable', 1);
  const bt = ui.createNode(ui.TEXT); ui.setClass(bt, 'text-xs text-white'); ui.setText(bt, 'Go');
  ui.insert(b, bt, -1); ui.insert(r, t, -1); ui.insert(r, b, -1); ui.insert(root, r, -1);
}
const inp = ui.createNode(ui.INPUT); ui.setClass(inp, 'h-8 border px-2'); ui.setValue(inp, 'hello'); ui.insert(root, inp, -1);
ui.focusNode(inp);
let f = 0, last = 0, total = 0, frames = 0;
ui.mount(root, 0xffffff, (dt: number) => {
  f++;
  ui.setNumber(root, 'paddingTop', 12 + (f % 2));   // a relayout of the whole page every frame
  const a = allocations();
  if (f > 20) { total += a - last; frames++; }
  last = allocations();
  ui.pointerAt(40 + (f % 200), 20 + (f % 150), false);
  if (f >= 620) { console.log('frames', frames, 'allocations', total); quit(); }
});
