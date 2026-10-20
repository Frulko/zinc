// Text in nested grow containers (ZN-287): 400 random trees of rows, columns, grow, w-full, percent and fixed widths holding texts; every text's lines must fit its
// final box (no line wider than the box) and use it (the first line cannot take the next word). Before the fix, 15 texts were wrapped at the width offered before
// grow shared out the free space and kept those narrower lines.
import { createNode, createText, insert, setClass, setRoot, screenBox, textLines, destroy, VIEW } from 'zinc:ui';
import { textWidth } from 'zinc:gfx';
let seed = 7;
function rand(n: i32): i32 { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor(seed / 65536) % n; }
const CLS = ['flex flex-row', 'flex flex-col', 'flex flex-row grow', 'flex flex-col grow', 'w-full', 'flex flex-col w-full', 'flex flex-row w-full', 'w-1/2', 'w-[120px]', 'grow', 'p-2', 'flex flex-row gap-2', 'items-start', 'items-center flex flex-col'];
const WORDS = ['zinc', 'layout', 'wraps', 'every', 'line', 'final', 'width', 'text', 'box'];
let bad = 0, gap = 0;
for (let k = 0; k < 400; k++) {
  const root = createNode(VIEW);
  setClass(root, 'flex flex-col');
  const texts: i32[] = [];
  function build(parent: i32, depth: i32): void {
    const n = 1 + rand(3);
    for (let i = 0; i < n; i++) {
      if (depth >= 3 || rand(3) === 0) {
        let s = '';
        const w = 2 + rand(12);
        for (let j = 0; j < w; j++) s += (j > 0 ? ' ' : '') + WORDS[rand(WORDS.length)];
        const t = createText(s);
        insert(parent, t, -1);
        texts.push(t);
      } else {
        const v = createNode(VIEW);
        setClass(v, CLS[rand(CLS.length)]);
        insert(parent, v, -1);
        build(v, depth + 1);
      }
    }
  }
  build(root, 0);
  setRoot(root);
  for (const t of texts) {
    const b = screenBox(t), lines = textLines(t);
    let widest = 0;
    for (const l of lines) widest = Math.max(widest, textWidth(0, l, 0));
    if (lines.length > 1 && widest > b[2] + 1) { bad++; if (bad <= 5) console.log('tree ' + k + ': text ' + b[2] + ' wide holds a line of ' + Math.ceil(widest)); }
    if (lines.length > 1 && textWidth(0, lines[0] + ' ' + lines[1].split(' ')[0], 0) <= b[2] - 1) { gap++; if (gap <= 5) console.log('tree ' + k + ': gap: text ' + b[2] + ' wide, first line ' + Math.ceil(textWidth(0, lines[0], 0)) + ' could take the next word'); }
  }
  destroy(root);
}
console.log('bad ' + bad + ' gap ' + gap);
