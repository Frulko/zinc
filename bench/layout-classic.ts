// layout-175 for the `classic` layout (ZN-281): the same tree as tests/bench/layout_bench.cpp built with zinc:ui, then ui.layout() timed. classic has no dirty bits: every
// pass is a full pass, so "one leaf" is a text change plus the pass and "clean" is the pass alone. Prints one JSON line.   zinc run bench/layout-classic.ts   (interpreter)
import * as ui from 'zinc:ui';

const VIEW: i32 = 0, TEXT: i32 = 1;
function view(parent: i32, cls: string): i32 { const h = ui.createNode(VIEW); ui.setClass(h, cls); if (parent >= 0) ui.insert(parent, h, -1); return h; }
function text(parent: i32, s: string, cls: string): i32 { const h = ui.createText(s); ui.setClass(h, cls); ui.insert(parent, h, -1); return h; }

let nodes = 0, leaf = -1;
const root = view(-1, 'flex-col'); nodes++;
const header = view(root, 'flex-row gap-2 p-2'); nodes++;
for (let i = 0; i < 6; i++) { const item = view(header, 'grow'); text(item, 'Header item', ''); nodes += 2; }
const body = view(root, 'flex-row grow'); nodes++;
const side = view(body, 'flex-col gap-1 p-2 w-[200]'); nodes++;
for (let i = 0; i < 10; i++) { const row = view(side, 'flex-row gap-2'); view(row, 'w-4 h-4'); text(row, 'Sidebar entry', ''); nodes += 3; }
const content = view(body, 'flex-row flex-wrap grow gap-2 p-2'); nodes++;
for (let i = 0; i < 16; i++) {
  const card = view(content, 'flex-col gap-1 p-2 w-[300]'); nodes++;
  text(card, 'Card title', '');
  const b = text(card, 'A longer body of text that wraps over several lines inside the card, as real content does', ''); if (i === 8) leaf = b;
  const btns = view(card, 'flex-row gap-2'); nodes++;
  for (let k = 0; k < 2; k++) { const btn = view(btns, 'p-2'); text(btn, k === 1 ? 'Cancel' : 'Open', ''); nodes += 2; }
  nodes += 2;
}
ui.setRoot(root);
const RUNS: i32 = 200;
ui.layout();   // first pass
let t0 = performance.now();
for (let i = 0; i < RUNS; i++) ui.layout();
const full = (performance.now() - t0) * 1000 / RUNS;
t0 = performance.now();
const textA = 'A different body of text that also wraps over a few lines', textB = 'A longer body of text that wraps over several lines inside the card, as real content does';
for (let i: i32 = 0; i < RUNS; i++) { if ((i & 1) === 0) ui.setText(leaf, textA); else ui.setText(leaf, textB); ui.layout(); }
const one = (performance.now() - t0) * 1000 / RUNS;
console.log('{"engine":"classic","nodes":' + nodes + ',"runs":' + RUNS + ',"full_us":' + Math.round(full * 10) / 10 + ',"one_leaf_us":' + Math.round(one * 10) / 10 + ',"clean_us":' + Math.round(full * 10) / 10 + '}');
