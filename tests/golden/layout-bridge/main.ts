// The host layout engine through the runtime (ZN-284.01): 100 random strings wrapped by the engine (the C++ port of wrapText, the baked fonts' advances) give
// the lines lib/std/ui.ts computes at the same width; the owner's flex: 1 case lays out to the same lines and height in every engine (interpreter, AOT, QuickJS).
import { createNode, createText, setText, insert, setNumber, setRoot, layout, textLines, textFont, VIEW } from 'zinc:ui';
import * as L from 'zinc:__layout';

let seed = 12345;
function rand(n: i32): i32 { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor(seed / 65536) % n; }
const WORDS = ['a', 'zinc', 'layout', 'wraps', 'every', 'line', 'at', 'its', 'final', 'width', 'mm', 'W', 'ill', 'Yoga', 'native', 'text'];

// lib/std/ui.ts: a box of a given width holding one text node
const root = createNode(VIEW);
const box = createNode(VIEW);
const t = createText('');
insert(root, box, -1);
insert(box, t, -1);
setRoot(root);

L.open(true);
L.create(1);
let same = 0, total = 0;
const lineHeight = 20;
for (let k = 0; k < 100; k++) {
  let s = '';
  const words = 1 + rand(14);
  for (let i = 0; i < words; i++) s += (i > 0 ? ' ' : '') + WORDS[rand(WORDS.length)];
  const w = 40 + rand(200);
  setText(t, s);
  setNumber(box, 'width', w);
  const want = textLines(t);
  total += want.length;
  L.text(1, s, textFont(t), 14, 0, 0, 0, 0, 0, 0, lineHeight);
  L.style(1, 17, w);   // width
  L.calculate(1, w, 1000);
  let ok = L.lineCount(1) === want.length;
  for (let i = 0; ok && i < want.length; i++) ok = L.line(1, i) === want[i];
  if (ok) same++;
  else console.log('differs at ' + w + ' px: "' + s + '" ui ' + want.length + ' lines, engine ' + L.lineCount(1));
}
console.log('same lines ' + same + ' of 100 (' + total + ' lines)');

// the owner's case: a flex: 1 text in a flex: 1 row in a flex: 1 column (classic-free: only the engine)
L.create(10); L.style(10, 17, 100); L.style(10, 18, 200);
L.create(11); L.style(11, 44, 1); L.style(11, 1009, 1); L.style(11, 1007, 0); L.insert(10, 11, 0);
L.create(12); L.style(12, 21, 1); L.style(12, 24, 0); L.style(12, 44, 1); L.style(12, 1009, 1); L.style(12, 1007, 0); L.insert(11, 12, 0);
L.create(13); L.style(13, 44, 1); L.style(13, 1009, 1); L.style(13, 1007, 0); L.insert(12, 13, 0);
L.text(13, 'the quick brown fox jumps over the lazy dog', textFont(t), 14, 0, 0, 0, 0, 0, 0, lineHeight);
L.calculate(10, 100, 200);
let lines = '';
for (let i = 0; i < L.lineCount(13); i++) lines += (i > 0 ? ' | ' : '') + L.line(13, i);
console.log('flex text ' + L.width(13) + 'x' + L.height(13) + ' ' + L.lineCount(13) + ' lines: ' + lines);
