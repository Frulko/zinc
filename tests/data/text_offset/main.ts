import * as ui from 'zinc:ui';
import { textWidth, font } from 'zinc:gfx';
import { equal, ok } from 'zinc:assert';
const root = ui.createNode(ui.VIEW); ui.setRoot(root);
function text(s: string, cls: string): i32 {
  const h = ui.createText(s); ui.setClass(h, 'absolute text-[16px] leading-[24px] ' + cls); ui.insert(root, h, -1); return h;
}
function record(h: i32): ui.UiNode { const n = ui.inspectNode(h); if (n === null) throw new Error('missing text'); return n; }
function width(h: i32, s: string): number { return textWidth(ui.textFont(h), s, 0); }
function hit(h: i32, x: number, y: number, want: i32, label: string): void {
  equal(ui.textOffsetAt(h, x, y), want, label);
}
// Last half of a glyph is its source character, not the following insertion caret.
const plain = text('ab cd', 'w-[200px] h-[60px] p-[4px]');
const a = width(plain, 'a'), ab = width(plain, 'ab'), space = width(plain, 'ab ');
hit(plain, 4 + a * 0.8, 8, 0, 'last half glyph');
hit(plain, 4 + (ab + space) / 2, 8, 2, 'space advance');
hit(plain, 4 + width(plain, 'ab cd'), 8, -1, 'right edge exclusive');
hit(plain, 3, 8, -1, 'left padding'); hit(plain, 6, 3, -1, 'top padding');
hit(plain, 6, 29, -1, 'below lines'); hit(plain, 6, -1, -1, 'above');
hit(plain, 6, 60, -1, 'bottom edge'); hit(plain, NaN, 8, -1, 'nonfinite');
for (const align of ['text-left', 'text-center', 'text-right']) {
  const h = text('Wi', 'w-[180px] h-[24px] ' + align), w = width(h, 'Wi');
  const off = align === 'text-center' ? Math.floor((180 - w) / 2) : align === 'text-right' ? 180 - w : 0;
  hit(h, off + width(h, 'W') * 0.75, 5, 0, align);
  hit(h, off - 0.01, 5, -1, align + ' before');
  hit(h, off + w, 5, -1, align + ' end');
}
const wrapped = text('one  two\n\nthree two', 'w-[45px] h-[200px]');
const lines = ui.textLines(wrapped); ok(lines.length >= 5, 'actual wrapping and empty paragraph');
let from: i32 = 0;
for (let i = 0; i < lines.length; i++) {
  const t = lines[i], at = 'one  two\n\nthree two'.indexOf(t, from);
  if (t.length > 0) hit(wrapped, width(wrapped, t.slice(0, 1)) / 2, i * 24 + 5, at, 'plain source line ' + i);
  else hit(wrapped, 1, i * 24 + 5, -1, 'empty source line');
  from = at + t.length;
}
// Face-sensitive boundaries: bold, mono and italic all remain one source string.
const mixed = text('Wi mono élan\nnext', 'w-[120px] h-[150px] font-sans');
ui.setTextRuns(mixed, [3, ui.RUN_BOLD, -1, 5, ui.RUN_MONO, -1, 5, ui.RUN_ITALIC, -1]);
const rn = record(mixed), la = rn.lineAt; ok(la !== null, 'runs layout');
const bold = font('sans-bold', 16), mono = font('mono', 16);
const firstW = textWidth(bold, 'Wi ', 0), mW = textWidth(mono, 'm', 0);
hit(mixed, firstW + mW * 0.8, 5, 3, 'actual mono face after bold');
const ml = ui.textLines(mixed);
for (let i = 0; i < ml.length; i++) if (ml[i].length > 0) hit(mixed, 0.01, i * 24 + 5, (la as i32[])[i], 'run source line ' + i);
const unicode = text('é😀Z', 'w-[180px] h-[24px]');
const u0 = width(unicode, 'é'), u1 = width(unicode, 'é😀');
hit(unicode, u0 / 2, 5, 0, 'accent');
hit(unicode, (u0 + u1) / 2, 5, 1, 'surrogate begins together');
hit(unicode, (u1 + width(unicode, 'é😀Z')) / 2, 5, 3, 'after surrogate');
const clipped = text('abcdefghijk', 'w-[50px] h-[24px] truncate');
const ct = ui.textLines(clipped)[0]; ok(ct.endsWith('…'), 'actual ellipsis');
hit(clipped, width(clipped, ct.slice(0, 1)) / 2, 5, 0, 'visible prefix');
hit(clipped, (width(clipped, ct.slice(0, ct.length - 1)) + width(clipped, ct)) / 2, 5, -1, 'synthetic ellipsis');
const multilineCut = text('abcdef abcdef\nabcdef', 'w-[50px] h-[48px] whitespace-pre text-ellipsis');
hit(multilineCut, width(multilineCut, 'a') / 2, 29, 14, 'source after earlier truncated line');
const real = text('a…', 'w-[50px] h-[24px] truncate');
hit(real, (width(real, 'a') + width(real, 'a…')) / 2, 5, 1, 'literal ellipsis');
const caps = text('aßZ', 'w-[100px] h-[24px] uppercase');
hit(caps, (width(caps, 'AS') + width(caps, 'ASS')) / 2, 5, 1, 'expanded transform source');
hit(caps, (width(caps, 'ASS') + width(caps, 'ASSZ')) / 2, 5, 2, 'after expanded transform');
const empty = text('', 'w-[100px] h-[24px]'); hit(empty, 1, 5, -1, 'empty');
hit(-1, 1, 5, -1, 'negative handle'); hit(999999, 1, 5, -1, 'invalid handle'); hit(root, 1, 5, -1, 'nontext');
const detached = ui.createText('detached'); hit(detached, 1, 5, -1, 'unmounted');
ui.setClass(plain, 'absolute w-[200px] h-[60px] hidden'); hit(plain, 1, 5, -1, 'hidden');
const dead = text('old', 'w-[80px] h-[24px]'); ui.remove(root, dead); hit(dead, 1, 5, -1, 'destroyed');
const reused = text('new', 'w-[80px] h-[24px]'); equal(reused, dead, 'recycled slot'); hit(reused, 1, 5, 0, 'new occupant');
// Selection still names insertion carets over displayed lines laid end to end.
const selection = text('abc def', 'top-[190px] w-[50px] h-[48px] select-text');
const selBox = ui.screenBox(selection);
ui.pointerAt(selBox[0] + 0.01, selBox[1] + 5, false); ui.pointerAt(selBox[0] + 0.01, selBox[1] + 5, true);
ui.pointerAt(selBox[0] + width(selection, 'de'), selBox[1] + 29, true); ui.pointerAt(selBox[0] + width(selection, 'de'), selBox[1] + 29, false);
equal(ui.selectedStaticText(), 'abc de', 'selection caret units preserved');
// Coordinates delivered by a real pointer are already local through ancestor scrolling/scale/translation.
const scroll = ui.createNode(ui.SCROLL); ui.setClass(scroll, 'absolute top-[230px] left-[20px] w-[160px] h-[60px]'); ui.insert(root, scroll, -1);
const content = ui.createNode(ui.VIEW); ui.setClass(content, 'w-[160px] h-[200px]'); ui.insert(scroll, content, -1);
const local = ui.createText('local'); ui.setClass(local, 'absolute top-[70px] left-[10px] w-[80px] h-[24px] text-[16px] leading-[24px] scale-125 translate-x-[3px]'); ui.insert(content, local, -1);
ui.scrollTo(scroll, 0, 60); ui.layout();
let pointed: i32 = -2;
ui.onPointer(local, ui.PDOWN, (e: ui.PointerEvent) => { pointed = ui.textOffsetAt(local, e.x, e.y); });
const sb = ui.screenBox(local), nx = sb[0] + width(local, 'l') * 0.4 * sb[2] / 80, ny = sb[1] + 5 * sb[3] / 24;
ui.pointerAt(nx, ny, true); ui.pointerAt(nx, ny, false); equal(pointed, 0, 'pointer local after scrolling/transform');
ui.setNumber(local, 'top', 0); hit(local, 1, 5, -1, 'scrolled outside ancestor clip');
console.log('text offset: pass');
