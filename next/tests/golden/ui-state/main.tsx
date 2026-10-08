// State variants (ZN-273): hover: opacity, translate and shadow through the pointer; disabled: styles; a paint-only state change runs no layout.
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';
const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'flex-row gap-4 p-6 w-full bg-white');
const a = ui.createNode(ui.VIEW);
ui.setClass(a, 'w-20 h-12 bg-indigo-500 rounded-lg hover:opacity-80 hover:-translate-y-1 hover:shadow-lg');
const b = ui.createNode(ui.VIEW);
ui.setClass(b, 'w-20 h-12 bg-emerald-500 rounded-lg disabled:opacity-50 disabled:bg-slate-400');
ui.insert(root, a, -1); ui.insert(root, b, -1);
const g = ui.createNode(ui.VIEW); ui.setClass(g, 'group w-20 h-12 bg-slate-200 rounded-lg');
const gc = ui.createNode(ui.VIEW); ui.setClass(gc, 'w-6 h-6 bg-rose-500 group-hover:bg-sky-500 group-hover:opacity-60');
ui.insert(g, gc, -1); ui.insert(root, g, -1);
function show(tag: string): void {
  const x = ui.inspectNode(a), y = ui.inspectNode(b), z = ui.inspectNode(gc);
  if (x === null || y === null || z === null) return;
  console.log(tag, `a op${x.opacity} ty${x.ty} sh${x.shadowLevel}`, `b op${y.opacity} bg${y.bg}`, `child bg${z.bg} op${z.opacity}`, 'layouts', ui.layoutCount());
}
let f = 0, l0 = 0;
ui.mount(root, 0xffffff, (dt: number) => {
  f++;
  if (f === 2) { show('start'); l0 = ui.layoutCount(); ui.pointerAt(40, 50, false); }
  if (f === 4) { show('hover a'); ui.pointerAt(300, 200, false); }
  if (f === 5) { ui.pointerAt(250, 50, false); }
  if (f === 6) { show('over the group'); ui.setNumber(b, 'disabled', 1); ui.pointerAt(300, 220, false); }
  if (f === 8) { show('b disabled'); console.log('no relayout', ui.layoutCount() === l0); ui.setNumber(b, 'disabled', 0); }
  if (f === 10) { show('b enabled'); quit(); }
});
