// main.tsx without JSX, for the QuickJS engine (ZN-685): the same two windows with zinc:ui's node API, and the same lines and frames.
import * as ui from 'zinc:ui';

let tiles: i32 = 0, pings: i32 = 0;
function el(tag: i32, cls: string, parent: i32): i32 { const h = ui.createNode(tag); ui.setClass(h, cls); if (parent >= 0) ui.insert(parent, h, -1); return h; }
function label(cls: string, text: string, parent: i32): i32 { const h = el(ui.TEXT, cls, parent); ui.setText(h, text); return h; }

const editor = el(ui.VIEW, '', -1), page = el(ui.VIEW, 'flex-col gap-4 p-6 h-full', editor);
label('text-xl text-white', 'Editor', page);
const add = el(ui.BUTTON, 'w-40 h-12 items-center justify-center rounded-lg bg-sky-600 hover:bg-sky-500', page);
label('text-white', 'Add a tile', add);
const pinged = label('text-sm text-slate-300', 'pings from the preview: 0', page);

const preview = el(ui.VIEW, '', -1), side = el(ui.VIEW, 'flex-col gap-3 p-4 h-full', preview);
const count = label('text-lg text-slate-900', 'Preview: 0 tiles', side);
const row = el(ui.VIEW, 'flex-row gap-2 h-10', side);
const boxes: i32[] = [];
for (let i: i32 = 0; i < 3; i++) boxes.push(el(ui.VIEW, 'hidden', row));
const ping = el(ui.BUTTON, 'w-28 h-10 items-center justify-center rounded-lg bg-amber-500 hover:bg-amber-400', side);
label('text-slate-900', 'Ping', ping);

ui.listen(add, () => {
  tiles++;
  console.log(`editor: ${tiles} tiles`);
  ui.setText(count, `Preview: ${tiles} tiles`);
  for (let i: i32 = 0; i < 3; i++) ui.setClass(boxes[i], tiles >= i + 1 ? 'w-10 h-10 rounded-md bg-emerald-500' : 'hidden');
});
ui.listen(ping, () => { pings++; console.log(`preview: ${pings} pings`); ui.setText(pinged, `pings from the preview: ${pings}`); });
ui.mount(editor, 0x0f172a, null);
console.log(`preview window ${ui.mountWindow('Preview', 240, 180, preview, 0xfffbeb)}`);
