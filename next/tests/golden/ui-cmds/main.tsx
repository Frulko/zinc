// What a style costs in draw commands (ZN-258, ZN-268, ZN-270): a ring is one border command, a decoration one rrect per line, a text shadow one more text run, and the shadow is the first thing dropped below 32 free commands.
import * as ui from 'zinc:ui';
import { quit, rect, commandsFree } from 'zinc:gfx';
const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'flex-col gap-2 p-2 w-full bg-white');
const box = ui.createNode(ui.VIEW); ui.setClass(box, 'w-16 h-8 bg-slate-200 rounded');
const text = ui.createNode(ui.TEXT); ui.setClass(text, 'text-sm text-slate-900'); ui.setText(text, 'one line');
const filler = ui.createNode(ui.CANVAS); ui.setClass(filler, 'w-1 h-1');
let fill = false;
ui.draw(filler, (x: i32, y: i32, w: i32, h: i32) => { if (fill) for (let n = commandsFree() - 20; n > 0; n--) rect(0, 0, 1, 1, 0xffffff); });
ui.insert(root, filler, -1); ui.insert(root, box, -1); ui.insert(root, text, -1);
const steps: string[][] = [['', ''], ['ring-2 ring-indigo-500', ''], ['ring-2 ring-indigo-500 outline-2 outline-red-500', ''], ['', 'underline'], ['', 'underline line-through'], ['', 'text-shadow-md']];
let f = 0, base = 0, guardPlain = 0;
ui.mount(root, 0xffffff, (dt: number) => {
  f++;
  const s = Math.floor((f - 1) / 2);
  if (f % 2 === 1 && s < steps.length) { ui.setClass(box, 'w-16 h-8 bg-slate-200 rounded ' + steps[s][0]); ui.setClass(text, 'text-sm text-slate-900 ' + steps[s][1]); }   // painted by this frame
  if (f % 2 === 0 && s < steps.length) {   // the frame just painted
    const n = ui.lastFrameCommands();
    if (s === 0) base = n;
    console.log(s === 0 ? 'base' : (steps[s][0] + ' ' + steps[s][1]).trim(), n - base);
  }
  if (f === 2 * steps.length + 2) { fill = true; ui.setClass(text, 'text-sm text-slate-900'); ui.repaint(); }
  if (f === 2 * steps.length + 3) { guardPlain = ui.lastFrameCommands(); ui.setClass(text, 'text-sm text-slate-900 text-shadow-md'); }
  if (f === 2 * steps.length + 4) { console.log('below 32 free commands the shadow is dropped', ui.lastFrameCommands() === guardPlain); quit(); }
});
