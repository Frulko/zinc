// The rn layout engine in zinc:ui (ZN-286, zinc.json "ui": {"layout": "rn"}): ten text rows; changing one text re-measures that text only (the other leaves
// keep their cached sizes), a paint-only change (opacity) runs no layout at all, and the boxes and lines come back from the engine.
import { createNode, createText, setText, insert, setNumber, setRoot, layout, layoutCount, screenBox, textLines, VIEW } from 'zinc:ui';
import { UI_LAYOUT } from 'zinc:platform';
import * as L from 'zinc:__layout';

const root = createNode(VIEW);
setNumber(root, 'padding', 8);
const rows: i32[] = [];
for (let i = 0; i < 10; i++) {
  const row = createNode(VIEW);
  setNumber(row, 'width', 200);
  const t = createText('row ' + i + ' with a few words to wrap');
  insert(row, t, -1);
  insert(root, row, -1);
  rows.push(t);
}
setRoot(root);
layout();
console.log('layout ' + UI_LAYOUT);
const b = screenBox(rows[3]);
console.log('row 3 at ' + b[0] + ',' + b[1] + ' ' + b[2] + 'x' + b[3] + ' lines ' + textLines(rows[3]).join(' | '));
const m0 = L.counter(0), c0 = L.counter(1);
setText(rows[5], 'row 5 changed to a much longer text that needs three lines here');
screenBox(rows[5]);   // (lays out only when something asked for it, as a frame does)
const m1 = L.counter(0), c1 = L.counter(1);
console.log('text change: ' + (c1 - c0) + ' calculate, ' + (m1 - m0) + ' measures (' + (m1 - m0 <= 2 ? 'that text only' : 'TOO MANY') + '), lines ' + textLines(rows[5]).length);
const b6 = screenBox(rows[6]);
console.log('row 6 moved to y ' + b6[1]);
const runs1 = layoutCount();
setNumber(rows[2], 'opacity', 0.5);
screenBox(rows[2]);
console.log('opacity change: ' + (layoutCount() - runs1) + ' layouts, ' + (L.counter(0) - m1) + ' measures, ' + (L.counter(1) - c1) + ' calculate');
