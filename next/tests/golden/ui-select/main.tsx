// Selectable static text (ZN-270): a drag over a `select-text` text selects it (highlight with selection:bg-*), Cmd/Ctrl+C copies it, a press elsewhere clears it; select-none text does not select.
import * as ui from 'zinc:ui';
import { quit, clipboardText } from 'zinc:gfx';
const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'flex-col gap-3 p-3 w-full bg-white');
const a = ui.createNode(ui.TEXT); ui.setClass(a, 'text-base text-slate-900 select-text selection:bg-amber-300'); ui.setText(a, 'Select this sentence with the pointer');
const b = ui.createNode(ui.TEXT); ui.setClass(b, 'text-base text-slate-900 select-none'); ui.setText(b, 'This one stays plain');
ui.insert(root, a, -1); ui.insert(root, b, -1);
let f = 0;
ui.mount(root, 0xffffff, (dt: number) => {
  f++;
  if (f === 2) { ui.pointerAt(24, 25, false); ui.pointerAt(24, 25, true); ui.pointerAt(120, 25, true); ui.pointerAt(120, 25, false); console.log('selected', JSON.stringify(ui.selectedStaticText())); ui.keyDown(-1, 'c', 2); console.log('clipboard', JSON.stringify(clipboardText())); }
  if (f === 3) { ui.pointerAt(24, 52, false); ui.pointerAt(24, 52, true); ui.pointerAt(100, 52, true); ui.pointerAt(100, 52, false); console.log('plain text selects', JSON.stringify(ui.selectedStaticText())); }
  if (f >= 4) quit();
});
