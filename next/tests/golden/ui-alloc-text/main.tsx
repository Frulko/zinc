// Allocations of a text layout pass (ZN-269, counter of ZN-189): the same long paragraph is laid out 200 times with the default wrapping and with the ZN-269 classes (line-clamp-3 text-balance, whitespace-pre-wrap, truncate).
// The default path is the cost before ZN-269; a clamp or pre-wrap pass may cost at most 1.5x of it and truncate (a binary search for the cut) no more.
import * as ui from 'zinc:ui';
import { allocations } from 'zinc:sys';
import { quit } from 'zinc:gfx';
const long = 'The quick brown fox jumps over the lazy dog while the five boxing wizards jump quickly, and pack my box with five dozen liquor jugs. '.repeat(5);
const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'flex-col p-3 w-full bg-white');
const t = ui.createNode(ui.TEXT); ui.setText(t, long);
ui.insert(root, t, -1);
const modes = ['text-sm text-slate-900', 'text-sm text-slate-900 line-clamp-3 text-balance', 'text-sm text-slate-900 whitespace-pre-wrap text-justify', 'text-sm text-slate-900 truncate'];
let f = 0, mode = 0, base = 0, n = 0, per: number[] = [];
ui.mount(root, 0xffffff, (dt: number) => {
  f++;
  const phase = Math.floor((f - 1) / 220), step = (f - 1) % 220;
  if (phase >= modes.length) { console.log('passes', modes.map((m, i) => m.slice(16, 40).trim() + ': ' + per[i]).join(' | ')); console.log('clamp <= 1.5x default', per[1] <= per[0] * 1.5, 'pre-wrap <= 1.5x', per[2] <= per[0] * 1.5, 'truncate <= default', per[3] <= per[0]); quit(); return; }
  if (step === 0) ui.setClass(t, modes[phase]);
  if (step === 20) { base = allocations(); n = 0; }
  if (step >= 20 && step < 220) { ui.setClass(root, 'flex-col p-3 w-full bg-white ' + (step % 2 === 0 ? 'pr-4' : 'pr-5')); n++; }
  if (step === 219) per[phase] = Math.round((allocations() - base) / n);
});
