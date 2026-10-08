// Text shadow and selection colour (ZN-270): shadowed text in two sizes and a coloured colour, a field whose selection uses selection:bg-*.
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';
const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'flex-col gap-2 p-3 w-full');
function text(cls: string, s: string): void {
  const t = ui.createNode(ui.TEXT);
  ui.setClass(t, cls);
  ui.setText(t, s);
  ui.insert(root, t, -1);
}
text('text-lg text-white text-shadow-md', 'Shadow on dark');
text('text-lg text-slate-900 text-shadow-red-500', 'Red shadow');
text('text-lg text-slate-900 text-shadow-lg', 'Large shadow');
const field = ui.createNode(ui.INPUT);
ui.setClass(field, 'w-40 h-8 px-2 border rounded selection:bg-red-500');
ui.setValue(field, 'select me please');
ui.insert(root, field, -1);
ui.focusNode(field);
ui.select(field, 0, 6);
let n = 0;
ui.mount(root, 0x94a3b8, (dt: number) => { n++; if (n >= 3) quit(); });
