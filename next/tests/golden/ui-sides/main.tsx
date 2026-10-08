// Side records (ZN-251): the cold style fields live in records (RingX, BorderX, SnapX, InterX) that a node gets only when a class sets one of them; tests/t0/ui_sides.sh counts them with `zinc mem`.
import * as ui from 'zinc:ui';
const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'flex-col gap-2 p-3 w-full bg-white');
for (let i = 0; i < 20; i++) {   // 20 plain nodes: layout, colour, radius, text size, opacity: no side record
  const r = ui.createNode(ui.VIEW); ui.setClass(r, 'flex-row gap-2 p-2 rounded-lg border bg-slate-50 opacity-90');
  const t = ui.createNode(ui.TEXT); ui.setClass(t, 'text-sm font-bold text-slate-900 underline'); ui.setText(t, 'Row ' + i);
  ui.insert(r, t, -1); ui.insert(root, r, -1);
}
const a = ui.createNode(ui.VIEW); ui.setClass(a, 'ring-2 ring-sky-300'); ui.insert(root, a, -1);                 // one RingX
const b = ui.createNode(ui.VIEW); ui.setClass(b, 'border-2 border-dashed border-t-red-500'); ui.insert(root, b, -1);   // one BorderX
const c = ui.createNode(ui.VIEW); ui.setClass(c, 'snap-x snap-center'); ui.insert(root, c, -1);                  // one SnapX
const d = ui.createNode(ui.VIEW); ui.setClass(d, 'bg-slate-100 hover:bg-slate-200 transition-colors'); ui.insert(root, d, -1);   // one InterX
const e = ui.createNode(ui.VIEW); ui.setClass(e, 'ring-1 border-dotted hover:bg-red-500'); ui.insert(root, e, -1);   // one of each of three
const e2 = ui.inspectNode(e);
if (e2 !== null) console.log('read through the old names: ringW', e2.ringW, 'borderStyle', e2.borderStyle, 'hoverBg', e2.hoverBg);
console.log('classes reset to the shared defaults:');
ui.setClass(a, 'p-1'); const a2 = ui.inspectNode(a); if (a2 !== null) console.log('ringW after a reclass', a2.ringW);
