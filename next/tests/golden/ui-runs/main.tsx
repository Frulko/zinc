// Style runs inside one text (ui.setTextRuns): bold and mono runs are measured in their own faces when the text wraps, so the same words
// make wider lines; the text still selects across its runs as one and copies as plain text. With break-words a word longer than the line (a
// path) is cut where it stops fitting, in its run's face.
import * as ui from 'zinc:ui';
import { quit, clipboardText } from 'zinc:gfx';
const TEXT = 'Run the build with make all then read the log';   // "build" bold, "make all" mono, "log" underlined
const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'flex-col gap-3 p-3 w-full bg-white');
const plain = ui.createNode(ui.TEXT); ui.setClass(plain, 'self-start max-w-[180] text-base text-slate-900 select-text'); ui.setText(plain, TEXT);
const styled = ui.createNode(ui.TEXT); ui.setClass(styled, 'self-start max-w-[180] text-base text-slate-900 select-text'); ui.setText(styled, TEXT);
ui.setTextRuns(styled, [8, 0, -1, 5, ui.RUN_BOLD, -1, 6, 0, -1, 8, ui.RUN_MONO, 0xc2410c, 15, 0, -1, 3, ui.RUN_UNDERLINE, 0x2563eb]);
const mono = ui.createNode(ui.TEXT); ui.setClass(mono, 'font-mono text-xs text-slate-500'); ui.setText(mono, 'mono');   // a font-mono class: the program bakes the mono face
const LONG = 'see orchestrator/src/components/chat.ts:198 now';
const long = ui.createNode(ui.TEXT); ui.setClass(long, 'self-start max-w-[120] text-base text-slate-900 break-words'); ui.setText(long, LONG);
ui.setTextRuns(long, [4, 0, -1, 39, ui.RUN_MONO, 0xc2410c, 4, 0, -1]);
ui.insert(root, plain, -1); ui.insert(root, styled, -1); ui.insert(root, long, -1); ui.insert(root, mono, -1);
let f = 0;
ui.mount(root, 0xffffff, (dt: number) => {
  f++;
  if (f === 2) {
    console.log('plain', JSON.stringify(ui.textLines(plain)), Math.round(ui.screenBox(plain)[2]));
    console.log('runs', JSON.stringify(ui.textLines(styled)), Math.round(ui.screenBox(styled)[2]));
    console.log('break-words', JSON.stringify(ui.textLines(long)), Math.round(ui.screenBox(long)[2]), ui.textLines(long).join('').split(' ').join('') === LONG.split(' ').join('') ? 'whole' : 'lost');
    const b = ui.screenBox(styled);
    ui.pointerAt(b[0] + 2, b[1] + 8, false); ui.pointerAt(b[0] + 2, b[1] + 8, true); ui.pointerAt(b[0] + 70, b[1] + 30, true); ui.pointerAt(b[0] + 70, b[1] + 30, false);   // from the start to the middle of line 2
    console.log('selected', JSON.stringify(ui.selectedStaticText()));
    ui.keyDown(-1, 'c', 2); console.log('clipboard', JSON.stringify(clipboardText()));
  }
  if (f === 3) {
    ui.defineScheme('light', ['ink'], [0x2563eb]);
    console.log('scheme colour', ui.schemeColor('ink'), ui.schemeColor('none'));   // a scheme variable, an unknown name (the text's colour)
    ui.setTextRuns(styled, []);
  }
  if (f === 4) { console.log('cleared', JSON.stringify(ui.textLines(styled))); quit(); }
});
