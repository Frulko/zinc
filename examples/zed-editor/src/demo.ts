// Scripted scenes (ZINC_DEMO=<scene>) for screenshots and measurements. The input test hooks drive the app, so the
// real mouse and keyboard are ignored while a scene runs.
//   editor palette finder find light terminal diagnostics wrap panel   screenshots (ZINC_FRAMES / ZINC_SHOT)
//   scroll                                                       fps while scrolling a 5000-line file, then quits
//   check                                                        smoke test of the interactions (prints ok / FAIL)
import * as ui from 'zinc:ui';
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import { quit } from 'zinc:gfx';
import { root } from './app/project';
import { openFile, active, Buffer, edited, buffers, closeBuffer } from './app/workspace';
import { setTheme, LIGHT } from './app/theme';
import { openPalette, PAL_COMMANDS, PAL_FILES } from './app/commands';
import { openFind } from './app/search';
import { setSoftWrap, zoom, showTerminal, togglePanel, panelWidth } from './app/settings';
import { runProject } from './app/tools';
import { findRef, stepEditor as stepEditorNow } from './components/Editor';
import { tabNode } from './components/Tabs';
import { panelRef } from './components/ProjectPanel';
import { rows, selected, Entry } from './app/project';
import { focusLater } from './app/workspace';

const scene = sys.env('ZINC_DEMO');
let frame: i32 = 0;

function open(rel: string, preview: boolean): Buffer | null {
  return openFile(root.path + '/' + rel, rel.slice(rel.lastIndexOf('/') + 1), preview);
}
/** Puts the caret right after the first occurrence of `s` in the active buffer. */
function caretAfter(s: string): void {
  const b = active();
  if (b === null) return;
  const i = (b as Buffer).text().indexOf(s);
  if (i >= 0) ui.select((b as Buffer).node(), i + s.length, i + s.length);
}

/** Common state of the screenshots: a few tabs (one preview, one modified), main.ts active, caret in a call. */
function workspace(): void {
  const s = open('src/lib/stats.ts', false);
  if (s !== null) edited(s as Buffer, (s as Buffer).text().replace('Small statistics helpers.', 'Small statistics helpers (edited).'));
  open('src/lib/format.ts', false);
  open('src/ui/Dashboard.tsx', false);
  open('docs/notes.md', true);
  open('src/main.ts', false);
}

export function stepDemo(dt: number): void {
  if (scene === '') return;
  frame++;
  if (scene === 'scroll') { bench(dt); return; }
  if (scene === 'check') { smoke(); return; }
  if (frame === 2) {
    workspace();
    if (scene === 'light') setTheme(LIGHT);
    if (scene === 'wrap') { setSoftWrap(true); zoom(2); }
    if (scene === 'terminal') { showTerminal(true); runProject(); }
    if (scene === 'diagnostics') open('src/lib/forecast.ts', false);
    if (scene === 'panel') togglePanel();
  }
  if (frame === 4) {
    if (scene === 'diagnostics') caretAfter('`+${f.hour}h: ${celc');
    else if (scene === 'wrap') caretAfter('function report(');
    else caretAfter('movingAverage(temps, 3');
    if (scene === 'palette') openPalette(PAL_COMMANDS);
    if (scene === 'finder') openPalette(PAL_FILES);
    if (scene === 'find' || scene === 'light') { openFind(); focusLater(findRef.node); }
  }
  if (frame === 7) {
    if (scene === 'palette') ui.typeText(-1, 'tog');
    if (scene === 'finder') ui.typeText(-1, 'dash');
    if (scene === 'find' || scene === 'light') ui.typeText(-1, 'temps');
  }
  if (frame === 8 && scene === 'editor') {
    // hover a row of the project panel
    const h = ui.find('docs');
    if (h >= 0) { const b = ui.screenBox(h); ui.pointerAt(b[0] + 20, b[1] + 6, false); }
  }
}

// ---- scroll benchmark: a 5000-line file scrolled by a trackpad-like wheel (fractional steps), then by mouse
// notches (eased), timing every frame with the monotonic clock.
const BENCH_FILE = '/tmp/zed-editor-bench.ts';
let t0: number = 0, last: number = 0, worst: number = 0, frames: i32 = 0, phase: i32 = 0, dir: number = -1;
function bench(dt: number): void {
  if (frame === 2) {
    const src = fs.readText(root.path + '/src/main.ts') + fs.readText(root.path + '/src/lib/stats.ts');
    let text = '';
    let lines: i32 = 0;
    while (lines < 5000) { text += src; lines += src.split('\n').length - 1; }
    fs.writeText(BENCH_FILE, text);
    openFile(BENCH_FILE, 'bench.ts', false);
    return;
  }
  const b = active();
  if (frame < 20 || b === null) return;
  const h = (b as Buffer).node(), box = ui.screenBox(h);
  const now = sys.clock();
  if (frames > 0) { const d = now - last; if (d > worst) worst = d; }
  last = now;
  if (frames === 0) t0 = now;
  frames++;
  // trackpad: 1.8 steps of 1/10 px per frame = 18 px per frame; bounce between the ends
  const v = ui.editView(h);
  if (phase === 0) {
    if (v[1] >= v[2] - v[3] - 1) dir = 1; else if (v[1] <= 0 && frames > 5) dir = -1;
    ui.wheelAt(box[0] + box[2] / 2, box[1] + box[3] / 2, dir * 1.8);
  } else if (frames % 8 === 0) ui.wheelAt(box[0] + box[2] / 2, box[1] + box[3] / 2, -3);   // mouse: 3 notches
  if (frames === 600) {
    const ms = now - t0;
    console.log(`scroll bench (${phase === 0 ? 'trackpad 18 px/frame' : 'mouse wheel, eased'}): ${(b as Buffer).doc.lineCount()} lines, ` +
      `${frames} frames in ${Math.round(ms)} ms = ${Math.round(frames * 10000 / ms) / 10} fps, worst frame ${Math.round(worst * 10) / 10} ms, ` +
      `scrolled to ${Math.round(v[1])} of ${Math.round(v[2])} px`);
    if (phase === 1) {
      // typing in the middle of the file: the synchronous cost of one keystroke (edit, line index, rows, marks)
      ui.select(h, (b as Buffer).doc.starts[2500], (b as Buffer).doc.starts[2500]);
      ui.focusNode(h);
      const k0 = sys.clock();
      for (let i = 0; i < 100; i++) { ui.typeText(-1, 'x'); stepEditorNow(); ui.editView(h); }
      console.log(`typing: ${Math.round((sys.clock() - k0) * 10 / 100) / 10} ms per keystroke (100 keys, line 2500 of ${(b as Buffer).doc.lineCount()})`);
      fs.remove(BENCH_FILE); quit(); return;
    }
    phase = 1; frames = 0; worst = 0;
    ui.scrollEditTo(h, 0, 0);
  }
}

// ---- smoke test of the interactions (ZINC_DEMO=check): presses, keys and drags through the test hooks
let fails: i32 = 0;
function expect(ok: boolean, what: string): void { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails++; }
function names(): string { return buffers().map((b: Buffer) => b.name + (b.preview() ? '*' : '')).join(' '); }
/** Presses (clicks times) at the centre of node h with a button. */
function press(h: i32, button: i32, clicks: i32): void {
  const b = ui.screenBox(h), x = b[0] + Math.min(40, b[2] / 2), y = b[1] + b[3] / 2;
  for (let i = 0; i < clicks; i++) { ui.pointerAt(x, y, true, button); ui.pointerAt(x, y, false, button); }
}
let rowsBefore: i32 = 0, widthBefore: number = 0, syBefore: number = 0;
function smoke(): void {
  if (frame === 3) press(ui.find('README.md'), 0, 1);
  if (frame === 5) { expect(names() === 'main.ts README.md*', 'click in the tree opens a preview tab: ' + names()); press(ui.find('zinc.json'), 0, 1); }
  if (frame === 7) { expect(names() === 'main.ts zinc.json*', 'the next preview replaces it: ' + names()); press(tabNode(root.path + '/zinc.json'), 0, 2); }
  if (frame === 9) { expect(names() === 'main.ts zinc.json', 'double click on the tab keeps it: ' + names()); press(tabNode(root.path + '/zinc.json'), 1, 1); }
  if (frame === 11) {
    expect(names() === 'main.ts', 'middle click closes the tab: ' + names());
    // keyboard in the tree: select the first row, then open / close the folder with → / ←
    ui.focusNode(panelRef.node);
    rowsBefore = rows().length;
    ui.keyDown(-1, 'ArrowUp'); for (let i = 0; i < 20; i++) ui.keyDown(-1, 'ArrowUp');
    const first = selected();
    ui.keyDown(-1, 'ArrowRight');
    expect(first !== null && (first as Entry).name === 'data' && rows().length > rowsBefore, 'tree keys: ↑ to the first folder, → expands it');
    ui.keyDown(-1, 'ArrowLeft');
    expect(rows().length === rowsBefore, '← collapses it');
    // resize the panel by its handle
    widthBefore = panelWidth();
    const pb = ui.screenBox(panelRef.node), x = pb[0] + pb[2] - 2, y = pb[1] + 200;
    ui.pointerAt(x, y, false); ui.pointerAt(x, y, true); ui.pointerAt(x + 60, y, true); ui.pointerAt(x + 60, y, false);
    expect(panelWidth() === widthBefore + 60, `drag handle resizes the panel: ${widthBefore} -> ${panelWidth()}`);
    // a long file for the minimap
    let text = '';
    for (let i = 0; i < 800; i++) text += `const line${i} = ${i}; // filler\n`;
    fs.writeText(BENCH_FILE, text);
    openFile(BENCH_FILE, 'long.ts', false);
  }
  if (frame === 14) {
    const b = active() as Buffer, h = b.node(), box = ui.screenBox(h);
    // the minimap is right of the editor: press in its middle, drag down
    const mx = box[0] + box[2] + 40, my = box[1] + box[3] / 2;
    ui.pointerAt(mx, my, true);
    syBefore = ui.editView(h)[1];
    ui.pointerAt(mx, my + 100, true); ui.pointerAt(mx, my + 100, false);
    const after = ui.editView(h)[1];
    expect(syBefore > 0 && after > syBefore, `minimap press and drag scroll the editor: ${Math.round(syBefore)} -> ${Math.round(after)}`);
    // editing makes it modified; closing asks first
    ui.focusNode(h); ui.typeText(-1, '// edit\n');
    expect(b.modified(), 'typing marks the buffer modified');
    closeBuffer(b);
    expect(buffers().indexOf(b) >= 0, 'closing a modified buffer asks first');
    closeBuffer(b);
    expect(buffers().indexOf(b) < 0, 'the second close discards it');
    fs.remove(BENCH_FILE);
  }
  if (frame === 16) { console.log(fails === 0 ? 'smoke test passed' : `${fails} failure(s)`); quit(); }
}
