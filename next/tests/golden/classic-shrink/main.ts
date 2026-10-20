// Text in rows too narrow for their children (flex-shrink): a pane beside two fixed panels, and 400 random trees of rows with shrinking and fixed
// children holding texts of short words. Every text must wrap inside its final box and stay inside the window. Before the fix, a row measured
// each child at the whole row's width and flex-shrink only narrowed the boxes: the texts kept the lines of the wider width and ran out of them.
import { createNode, createText, insert, setClass, setRoot, screenBox, textLines, destroy, VIEW } from 'zinc:ui';
import { textWidth } from 'zinc:gfx';

function widest(t: i32): number { let w = 0; for (const l of textLines(t)) w = Math.max(w, textWidth(0, l, 0)); return w; }

// the agents example's case: side panel, chat pane (grow shrink min-w-0, its column capped at 760), detail panel
{
  const root = createNode(VIEW);
  setClass(root, 'flex flex-row w-full h-full');
  const side = createNode(VIEW), pane = createNode(VIEW), col = createNode(VIEW), detail = createNode(VIEW);
  setClass(side, 'w-[300px] shrink-0'); setClass(pane, 'flex flex-col grow shrink min-w-0 p-4'); setClass(col, 'flex flex-col max-w-[760px]'); setClass(detail, 'w-[300px] shrink-0');
  const t = createText('a paragraph of the answer that is long enough to need several lines in a pane that the two panels beside it leave narrow');
  insert(root, side, -1); insert(root, pane, -1); insert(pane, col, -1); insert(col, t, -1); insert(root, detail, -1);
  setRoot(root);
  const W = screenBox(root)[2], p = screenBox(pane), b = screenBox(t);
  console.log('pane ' + (p[2] === W - 600 ? 'fits' : 'is ' + p[2] + ' wide in ' + W));
  console.log('text ' + (b[0] + b[2] <= p[0] + p[2] + 1 && widest(t) <= b[2] + 1 ? 'wraps in the pane' : 'runs out: ' + b[2] + ' wide, a line of ' + Math.ceil(widest(t))));
  destroy(root);
}

let seed = 11;
function rand(n: i32): i32 { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor(seed / 65536) % n; }
// every box can shrink (flex-shrink is opt-in in classic): nothing but a word longer than its box may pass the window's edge
const CLS = ['flex flex-row', 'flex flex-col', 'flex flex-row grow', 'flex flex-col grow', 'flex flex-col p-2', 'flex flex-row gap-2', 'flex flex-col max-w-[400px]',
  'flex flex-row items-start', 'flex flex-col items-center'];
const WORDS = ['zinc', 'layout', 'wraps', 'every', 'line', 'final', 'width', 'text', 'box'];
let LONGEST = 0;
for (const w of WORDS) LONGEST = Math.max(LONGEST, Math.ceil(textWidth(0, w, 0)));
let bad = 0, out = 0;
for (let k = 0; k < 400; k++) {
  const root = createNode(VIEW);
  setClass(root, 'flex flex-row w-full');
  const texts: i32[] = [];
  function build(parent: i32, depth: i32): void {
    const n = 1 + rand(3);
    for (let i = 0; i < n; i++) {
      if (depth >= 3 || rand(3) === 0) {
        let s = '';
        const w = 4 + rand(30);
        for (let j = 0; j < w; j++) s += (j > 0 ? ' ' : '') + WORDS[rand(WORDS.length)];
        const t = createText(s);
        setClass(t, 'shrink min-w-0');
        insert(parent, t, -1);
        texts.push(t);
      } else {
        const v = createNode(VIEW);
        setClass(v, CLS[rand(CLS.length)] + ' shrink min-w-0');
        insert(parent, v, -1);
        build(v, depth + 1);
      }
    }
  }
  build(root, 0);
  setRoot(root);
  const W = screenBox(root)[2];
  for (const t of texts) {   // (a box narrower than a word: the word passes it, as in CSS)
    const b = screenBox(t);
    if (textLines(t).length > 1 && widest(t) > b[2] + 1 && b[2] >= LONGEST) { bad++; if (bad <= 5) console.log('tree ' + k + ': text ' + b[2] + ' wide holds a line of ' + Math.ceil(widest(t))); }
    if (b[0] + Math.max(b[2], widest(t)) > W + 1 && b[0] < W - LONGEST && b[2] >= LONGEST) { out++; if (out <= 5) console.log('tree ' + k + ': text at ' + b[0] + ' runs to ' + Math.ceil(b[0] + widest(t)) + ' in ' + W); }
  }
  destroy(root);
}
console.log('bad ' + bad + ' out ' + out);
