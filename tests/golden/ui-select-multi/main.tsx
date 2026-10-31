// Multi-line and multi-block text selection (ZN-917): a drag over a wrapped paragraph selects its lines, a drag from one paragraph into
// another (inside a ScrollView) selects both with a newline between them; Cmd/Ctrl+C copies. Positions come from screenBox.
import * as ui from 'zinc:ui';
import { quit, clipboardText } from 'zinc:gfx';
const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'flex-col p-3 w-full h-full bg-white');
const sv = ui.createNode(ui.SCROLL);
ui.setClass(sv, 'flex-col gap-3 w-full h-full');
const mk = (s: string): number => { const t = ui.createNode(ui.TEXT); ui.setClass(t, 'text-base text-slate-900 select-text selection:bg-amber-300'); ui.setText(t, s); ui.insert(sv, t, -1); return t; };
const a = mk('The quick brown fox jumps over the lazy dog and keeps running through the whole wide field until night.');
const b = mk('Second block, first line\nSecond block, second line');
const c = mk('Third block stays short');
ui.insert(root, sv, -1);
const drag = (x0: number, y0: number, x1: number, y1: number): void => { ui.pointerAt(x0, y0, false); ui.pointerAt(x0, y0, true); ui.pointerAt(x1, y1, true); ui.pointerAt(x1, y1, false); };
const copy = (tag: string): void => { console.log(tag, JSON.stringify(ui.selectedStaticText())); ui.keyDown(-1, 'c', 2); console.log('clipboard', JSON.stringify(clipboardText())); };
let f = 0;
ui.mount(root, 0xffffff, (dt: number) => {
  f++;
  const A = ui.screenBox(a), B = ui.screenBox(b), C = ui.screenBox(c);
  if (f === 2) { console.log('wrapped', A[3] > 40); drag(A[0] + 60, A[1] + 8, A[0] + 120, A[1] + A[3] - 8); copy('one paragraph'); }
  if (f === 3) { drag(A[0] + 100, A[1] + A[3] - 8, B[0] + 90, B[1] + B[3] - 8); copy('two paragraphs'); }
  if (f === 4) { drag(B[0] + 40, B[1] + 8, C[0] + 60, C[1] + C[3] + 30); copy('past the last block'); }
  if (f >= 5) quit();
});
