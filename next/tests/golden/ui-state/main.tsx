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
function show(tag: string): void {
  const x = ui.inspectNode(a), y = ui.inspectNode(b);
  if (x === null || y === null) return;
  console.log(tag, `a op${x.opacity} ty${x.ty} sh${x.shadowLevel}`, `b op${y.opacity} bg${y.bg}`, 'layouts', ui.layoutCount());
}
let f = 0, l0 = 0;
ui.mount(root, 0xffffff, (dt: number) => {
  f++;
  if (f === 2) { show('start'); l0 = ui.layoutCount(); ui.pointerAt(40, 50, false); }
  if (f === 4) { show('hover a'); ui.pointerAt(300, 200, false); }
  if (f === 6) { show('left'); ui.setNumber(b, 'disabled', 1); }
  if (f === 8) { show('b disabled'); console.log('no relayout', ui.layoutCount() === l0); ui.setNumber(b, 'disabled', 0); }
  if (f === 10) { show('b enabled'); quit(); }
});
