// The editing commands of the code editor, as plain functions from (text, selections) to (text, selections): no window, no
// widget, so selftest.ts checks them. Several selections are the rule, one is the common case: indent and unindent, line
// comments, Enter with its indent, brackets and quotes that close themselves, select the next occurrence, cursors above and
// below, moves by character, word and line, and the line commands (delete, move, duplicate).
// Offsets are the text field's (UTF-16). ponytail: every command rebuilds the whole text, like the field it drives; a rope
// or line-wise edits when files of several thousand lines feel slow.

export const UNIT: string = '  ';   // one indent level
const OPEN = '([{', CLOSE = ')]}', QUOTES = '"\'`';

export class Ed {
  text: string;
  /** Selections, flat [anchor, head, anchor, head...], sorted by position, never overlapping. */
  sels: i32[];
  /** Index of the main selection: the one the text field shows as its own. */
  main: i32;
  constructor(text: string, sels: i32[], main: i32) { this.text = text; this.sels = sels; this.main = main; }
  count(): i32 { return this.sels.length >> 1; }
  lo(i: i32): i32 { return imin(this.sels[2 * i], this.sels[2 * i + 1]); }
  hi(i: i32): i32 { return imax(this.sels[2 * i], this.sels[2 * i + 1]); }
  head(i: i32): i32 { return this.sels[2 * i + 1]; }
  anchor(i: i32): i32 { return this.sels[2 * i]; }
}
/** One selection. */
export function one(text: string, anchor: i32, head: i32): Ed { return norm(text, [anchor, head], 0); }

function imin(a: i32, b: i32): i32 { return a < b ? a : b; }
function imax(a: i32, b: i32): i32 { return a > b ? a : b; }
function at(t: string, i: i32): string { return i >= 0 && i < t.length ? t.slice(i, i + 1) : ''; }
function isWord(c: i32): boolean { return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36 || c >= 128; }
function isSpace(c: i32): boolean { return c === 32 || c === 9; }
export function lineStart(t: string, p: i32): i32 { let i = imin(p, t.length); while (i > 0 && t.charCodeAt(i - 1) !== 10) i--; return i; }
export function lineEnd(t: string, p: i32): i32 { const i = t.indexOf('\n', p); return i < 0 ? t.length : i; }
/** Offset of the first character of the line that is not a space. */
function textStart(t: string, ls: i32): i32 { let i = ls; while (i < t.length && isSpace(t.charCodeAt(i))) i++; return i; }

/** Sorts the selections, merges the ones that overlap (or a cursor touching another selection) and keeps `main` on its selection. */
export function norm(text: string, sels: i32[], main: i32): Ed {
  const n = sels.length >> 1, order: i32[] = [];
  for (let i = 0; i < n; i++) {
    sels[2 * i] = imax(0, imin(text.length, sels[2 * i])); sels[2 * i + 1] = imax(0, imin(text.length, sels[2 * i + 1]));
    order.push(i);
  }
  order.sort((x: i32, y: i32) => imin(sels[2 * x], sels[2 * x + 1]) - imin(sels[2 * y], sels[2 * y + 1]));
  const out: i32[] = [];
  let m: i32 = 0;
  for (const i of order) {
    const a = sels[2 * i], h = sels[2 * i + 1], l = imin(a, h), r = imax(a, h), k = out.length - 2;
    if (k >= 0) {
      const pl = imin(out[k], out[k + 1]), ph = imax(out[k], out[k + 1]);
      if (l < ph || (l === ph && (l === r || pl === ph))) {
        const fwd = out[k] <= out[k + 1], nr = imax(ph, r);
        out[k] = fwd ? pl : nr; out[k + 1] = fwd ? nr : pl;
        if (i === main) m = k >> 1;
        continue;
      }
    }
    if (i === main) m = out.length >> 1;
    out.push(a); out.push(h);
  }
  return new Ed(text, out, m);
}

/** Replaces [a[i], b[i]) by s[i] for selection i (ranges in order); the selection becomes [start + ca[i], start + ch[i]] of the new text. */
function splice(e: Ed, a: i32[], b: i32[], s: string[], ca: i32[], ch: i32[]): Ed {
  let out = '', from: i32 = 0, shift: i32 = 0;
  const sels: i32[] = [];
  for (let i = 0; i < a.length; i++) {
    const x = imax(a[i], from), y = imax(b[i], x);   // two cursors never eat the same characters
    out += e.text.slice(from, x) + s[i];
    sels.push(x + shift + ca[i]); sels.push(x + shift + ch[i]);
    shift += s[i].length - (y - x); from = y;
  }
  return norm(out + e.text.slice(from), sels, e.main);
}

/** Applies edits [ea, eb) -> es (in order, disjoint) that are not tied to the selections and carries the selections through
 *  them. A cursor at an insertion point moves with the text; the start of a selection stays (unless `push`). */
function applyEdits(e: Ed, ea: i32[], eb: i32[], es: string[], push: boolean): Ed {
  let out = '', from: i32 = 0;
  for (let k = 0; k < ea.length; k++) { out += e.text.slice(from, ea[k]) + es[k]; from = eb[k]; }
  out += e.text.slice(from);
  const map = (p: i32, stay: boolean): i32 => {
    let d: i32 = 0;
    for (let k = 0; k < ea.length; k++) {
      if (ea[k] > p) break;
      if (ea[k] === eb[k]) { if (ea[k] === p && stay) break; d += es[k].length; }
      else if (eb[k] <= p) d += es[k].length - (eb[k] - ea[k]);
      else return ea[k] + d + es[k].length;   // inside a removed range
    }
    return p + d;
  };
  const sels: i32[] = [];
  for (let i = 0; i < e.count(); i++) {
    const sel = e.hi(i) > e.lo(i), fwd = e.anchor(i) <= e.head(i);
    const l = map(e.lo(i), sel && !push), h = map(e.hi(i), false);
    sels.push(fwd ? l : h); sels.push(fwd ? h : l);
  }
  return norm(out, sels, e.main);
}

/** Starts of the lines the selections touch, in order. A selection that ends at the start of a line does not touch it. */
export function touched(e: Ed): i32[] {
  const out: i32[] = [], t = e.text;
  for (let i = 0; i < e.count(); i++) {
    let p = lineStart(t, e.lo(i)), end = e.hi(i);
    if (end > e.lo(i) && end === lineStart(t, end)) end--;
    while (true) {
      if (out.length === 0 || out[out.length - 1] < p) out.push(p);
      const n = t.indexOf('\n', p);
      if (n < 0 || n >= end) break;
      p = n + 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------- typing
function closable(next: string): boolean { return next === '' || next === ' ' || next === '\n' || next === '\t' || CLOSE.indexOf(next) >= 0 || next === ',' || next === ';'; }

/** Typed (or pasted) text at every selection. `pairs` (one typed character): an opening bracket or quote brings its closing
 *  one, around the selection when there is one; typing the closing one that is already there steps over it. */
export function typeText(e: Ed, s: string, pairs: boolean): Ed {
  const parts: string[] = [];
  for (let i = 0; i < e.count(); i++) parts.push(s);
  return typeEach(e, parts, pairs && s.length === 1);
}
function typeEach(e: Ed, parts: string[], pairs: boolean): Ed {
  const a: i32[] = [], b: i32[] = [], out: string[] = [], ca: i32[] = [], ch: i32[] = [], t = e.text;
  for (let i = 0; i < e.count(); i++) {
    const s = parts[i], l = e.lo(i);
    let h = e.hi(i), ins = s, x: i32 = s.length, y: i32 = s.length;
    if (pairs) {
      const next = at(t, h), o = OPEN.indexOf(s), q = QUOTES.indexOf(s), close = o >= 0 ? CLOSE.slice(o, o + 1) : s;
      if (h > l && (o >= 0 || q >= 0)) { ins = s + t.slice(l, h) + close; x = 1; y = 1 + h - l; }
      else if (h === l && (CLOSE.indexOf(s) >= 0 || q >= 0) && next === s) h = l + 1;
      else if (h === l && o >= 0 && closable(next)) { ins = s + close; x = 1; y = 1; }
      else if (h === l && q >= 0 && closable(next) && !(l > 0 && isWord(t.charCodeAt(l - 1))) && at(t, l - 1) !== s) { ins = s + s; x = 1; y = 1; }
    }
    a.push(l); b.push(h); out.push(ins); ca.push(x); ch.push(y);
  }
  return splice(e, a, b, out, ca, ch);
}

/** The selected texts, one per line (the clipboard of a copy with several selections). */
export function copyText(e: Ed): string {
  const parts: string[] = [];
  for (let i = 0; i < e.count(); i++) if (e.hi(i) > e.lo(i)) parts.push(e.text.slice(e.lo(i), e.hi(i)));
  return parts.join('\n');
}
/** Pasted text: one line per cursor when the clipboard has as many lines as there are cursors, else all of it at each. */
export function paste(e: Ed, clip: string): Ed {
  const lines = clip.split('\n');
  return e.count() > 1 && lines.length === e.count() ? typeEach(e, lines, false) : typeText(e, clip, false);
}

/** Backspace (`fwd`: Delete) at every selection. Before the text of a line it removes one indent level; between an empty pair, the pair. */
export function erase(e: Ed, fwd: boolean): Ed {
  const a: i32[] = [], b: i32[] = [], s: string[] = [], z: i32[] = [], t = e.text;
  for (let i = 0; i < e.count(); i++) {
    let l = e.lo(i), h = e.hi(i);
    if (h === l && fwd) { if (h < t.length) { const c = t.charCodeAt(h); h += c >= 0xd800 && c < 0xdc00 ? 2 : 1; } }
    else if (h === l && l > 0) {
      const prev = at(t, l - 1), o = OPEN.indexOf(prev), ls = lineStart(t, l);
      if ((o >= 0 && at(t, l) === CLOSE.slice(o, o + 1)) || (QUOTES.indexOf(prev) >= 0 && at(t, l) === prev)) { l--; h++; }
      else if (l > ls && textStart(t, ls) >= l && prev === ' ') l -= ((l - ls - 1) % UNIT.length) + 1;
      else { const c = t.charCodeAt(l - 1); l -= c >= 0xdc00 && c < 0xe000 && l > 1 ? 2 : 1; }
    }
    a.push(l); b.push(imin(h, t.length)); s.push(''); z.push(0);
  }
  return splice(e, a, b, s, z, z);
}

/** Enter: the new line keeps the indent of the current one, one level more after an opening bracket (whose closing one goes a line further). */
export function newline(e: Ed): Ed {
  const a: i32[] = [], b: i32[] = [], s: string[] = [], c: i32[] = [], t = e.text;
  for (let i = 0; i < e.count(); i++) {
    const l = e.lo(i), h = e.hi(i), ls = lineStart(t, l), ind = t.slice(ls, imin(textStart(t, ls), l));
    let k = l - 1;
    while (k >= ls && isSpace(t.charCodeAt(k))) k--;
    const o = k >= ls ? OPEN.indexOf(at(t, k)) : -1;
    let ins = '\n' + ind + (o >= 0 ? UNIT : '');
    const caret: i32 = ins.length;
    if (o >= 0 && at(t, h) === CLOSE.slice(o, o + 1)) ins += '\n' + ind;
    a.push(l); b.push(h); s.push(ins); c.push(caret);
  }
  return splice(e, a, b, s, c, c);
}

// ---------------------------------------------------------------- lines
/** Tab: with a selection, every line it touches gets one indent level; with cursors only, spaces up to the next indent stop. */
export function indent(e: Ed): Ed {
  let any = false;
  for (let i = 0; i < e.count(); i++) if (e.hi(i) > e.lo(i)) any = true;
  const t = e.text;
  if (!any) {
    const parts: string[] = [];
    for (let i = 0; i < e.count(); i++) parts.push(' '.repeat(UNIT.length - (e.lo(i) - lineStart(t, e.lo(i))) % UNIT.length));
    return typeEach(e, parts, false);
  }
  const ea: i32[] = [], es: string[] = [];
  for (const ls of touched(e)) if (lineEnd(t, ls) > ls) { ea.push(ls); es.push(UNIT); }
  return applyEdits(e, ea, ea, es, false);
}
/** Shift+Tab: every touched line (the cursor's line when nothing is selected) loses one indent level. */
export function outdent(e: Ed): Ed {
  const ea: i32[] = [], eb: i32[] = [], es: string[] = [], t = e.text;
  for (const ls of touched(e)) {
    let k: i32 = 0;
    if (at(t, ls) === '\t') k = 1; else while (k < UNIT.length && at(t, ls + k) === ' ') k++;
    if (k > 0) { ea.push(ls); eb.push(ls + k); es.push(''); }
  }
  return applyEdits(e, ea, eb, es, false);
}
/** Toggles `// ` on the touched lines: removed when every line that has text is a comment, else added at their common indent. */
export function toggleComment(e: Ed): Ed {
  const t = e.text, lines: i32[] = [];
  let all = true, col: i32 = 1 << 30;
  for (const ls of touched(e)) {
    const ts = textStart(t, ls);
    if (ts >= lineEnd(t, ls)) continue;   // blank
    lines.push(ls);
    col = imin(col, ts - ls);
    if (t.slice(ts, ts + 2) !== '//') all = false;
  }
  const ea: i32[] = [], eb: i32[] = [], es: string[] = [];
  if (lines.length === 0) { for (const ls of touched(e)) { ea.push(lineEnd(t, ls)); eb.push(lineEnd(t, ls)); es.push('// '); } return applyEdits(e, ea, eb, es, true); }
  for (const ls of lines) {
    const ts = textStart(t, ls);
    if (all) { ea.push(ts); eb.push(ts + (at(t, ts + 2) === ' ' ? 3 : 2)); es.push(''); }
    else { ea.push(ls + col); eb.push(ls + col); es.push('// '); }
  }
  return applyEdits(e, ea, eb, es, true);
}
/** Runs of touched lines as [start, end] offsets (end: the line end, without its newline). */
function blocks(e: Ed): i32[] {
  const out: i32[] = [], t = e.text;
  for (const ls of touched(e)) {
    const le = lineEnd(t, ls);
    if (out.length > 0 && out[out.length - 1] + 1 === ls) out[out.length - 1] = le; else { out.push(ls); out.push(le); }
  }
  return out;
}
export function deleteLines(e: Ed): Ed {
  const ea: i32[] = [], eb: i32[] = [], es: string[] = [], t = e.text, bl = blocks(e);
  for (let k = 0; k < bl.length; k += 2) {
    const last = bl[k + 1] >= t.length;   // the last line has no newline after it: the one before it goes
    ea.push(last ? imax(0, bl[k] - 1) : bl[k]); eb.push(last ? t.length : bl[k + 1] + 1); es.push('');
  }
  return applyEdits(e, ea, eb, es, false);
}
/** A copy of the touched lines under them; the selections go to the copy. */
export function duplicateLines(e: Ed): Ed {
  const ea: i32[] = [], es: string[] = [], t = e.text, bl = blocks(e);
  for (let k = 0; k < bl.length; k += 2) { ea.push(bl[k]); es.push(t.slice(bl[k], bl[k + 1]) + '\n'); }
  return applyEdits(e, ea, ea, es, true);
}
/** Moves the touched lines one line up (dir -1) or down (1), with their selections. */
export function moveLines(e: Ed, dir: i32): Ed {
  const bl = blocks(e), sels = e.sels.slice();
  let t = e.text;
  for (let n = 0; n < bl.length; n += 2) {
    const k = dir < 0 ? n : bl.length - 2 - n, bs = bl[k], be = bl[k + 1];
    let d: i32 = 0;
    if (dir < 0 && bs > 0) {
      const ps = lineStart(t, bs - 1);
      d = -(bs - ps);
      t = t.slice(0, ps) + t.slice(bs, be) + '\n' + t.slice(ps, bs - 1) + t.slice(be);
    } else if (dir > 0 && be < t.length) {
      const ne = lineEnd(t, be + 1);
      d = ne - be;
      t = t.slice(0, bs) + t.slice(be + 1, ne) + '\n' + t.slice(bs, be) + t.slice(ne);
    }
    if (d !== 0) for (let i = 0; i < e.count(); i++) if (e.lo(i) >= bs && e.lo(i) <= be) { sels[2 * i] += d; sels[2 * i + 1] += d; }
  }
  return norm(t, sels, e.main);
}

// ---------------------------------------------------------------- cursors
/** Only the main selection (Escape). */
export function single(e: Ed): Ed { return new Ed(e.text, [e.anchor(e.main), e.head(e.main)], 0); }
/** One more selection, which becomes the main one (Alt+click). */
export function addSel(e: Ed, anchor: i32, head: i32): Ed { return norm(e.text, e.sels.concat([anchor, head]), e.count()); }
/** The main selection replaced (the text field moved it), the others kept. */
export function setMain(e: Ed, anchor: i32, head: i32): Ed {
  const s = e.sels.slice();
  s[2 * e.main] = anchor; s[2 * e.main + 1] = head;
  return norm(e.text, s, e.main);
}
/** Cmd+D: cursors take the word they are in; then each call adds the next occurrence of the main selection's text (wrapping). */
export function selectNext(e: Ed): Ed {
  const t = e.text, m = e.main;
  if (e.hi(m) === e.lo(m)) {
    const sels: i32[] = [];
    for (let i = 0; i < e.count(); i++) {
      let a = e.lo(i), b = e.hi(i);
      if (a === b) { while (a > 0 && isWord(t.charCodeAt(a - 1))) a--; while (b < t.length && isWord(t.charCodeAt(b))) b++; }
      sels.push(a); sels.push(b);
    }
    return norm(t, sels, m);
  }
  const needle = t.slice(e.lo(m), e.hi(m));
  let p = t.indexOf(needle, e.hi(m));
  for (let turn = 0; turn < 2; turn++) {
    while (p >= 0) {
      let taken = false;
      for (let i = 0; i < e.count(); i++) if (e.lo(i) === p) taken = true;
      if (!taken) return addSel(e, p, p + needle.length);
      p = t.indexOf(needle, p + needle.length);
    }
    p = t.indexOf(needle, 0);
  }
  return e;
}
/** Cmd+Alt+Up / Down: a cursor on the line above the first one (dir -1) or under the last one (1), in the same column. */
export function addCursorV(e: Ed, dir: i32): Ed {
  const t = e.text;
  let col: i32 = 0;
  for (let i = 0; i < e.count(); i++) col = imax(col, e.head(i) - lineStart(t, e.head(i)));
  const ref = e.head(dir < 0 ? 0 : e.count() - 1);
  let ls: i32, le: i32;
  if (dir < 0) { le = lineStart(t, ref) - 1; if (le < 0) return e; ls = lineStart(t, le); }
  else { ls = lineEnd(t, ref) + 1; if (ls > t.length) return e; le = lineEnd(t, ls); }
  const p = imin(ls + col, le);
  return addSel(e, p, p);
}

export const M_LEFT: i32 = 0, M_RIGHT: i32 = 1, M_WORD_LEFT: i32 = 2, M_WORD_RIGHT: i32 = 3, M_HOME: i32 = 4, M_END: i32 = 5,
  M_UP: i32 = 6, M_DOWN: i32 = 7, M_TOP: i32 = 8, M_BOTTOM: i32 = 9;
/** Moves every cursor; `extend` keeps the anchors (Shift). ponytail: up and down keep the column of the head, without the
 *  memory of a wider column the single cursor of the text field has. */
export function move(e: Ed, how: i32, extend: boolean): Ed {
  const t = e.text, sels: i32[] = [];
  for (let i = 0; i < e.count(); i++) {
    const h = e.head(i), sel = e.hi(i) > e.lo(i), ls = lineStart(t, h);
    let p = h;
    if (how === M_LEFT) p = sel && !extend ? e.lo(i) : imax(0, h - (h > 1 && t.charCodeAt(h - 1) >= 0xdc00 && t.charCodeAt(h - 1) < 0xe000 ? 2 : 1));
    else if (how === M_RIGHT) p = sel && !extend ? e.hi(i) : imin(t.length, h + (t.charCodeAt(h) >= 0xd800 && t.charCodeAt(h) < 0xdc00 ? 2 : 1));
    else if (how === M_WORD_LEFT) { while (p > 0 && !isWord(t.charCodeAt(p - 1))) p--; while (p > 0 && isWord(t.charCodeAt(p - 1))) p--; }
    else if (how === M_WORD_RIGHT) { while (p < t.length && !isWord(t.charCodeAt(p))) p++; while (p < t.length && isWord(t.charCodeAt(p))) p++; }
    else if (how === M_HOME) { const ts = imin(textStart(t, ls), lineEnd(t, ls)); p = h === ts ? ls : ts; }
    else if (how === M_END) p = lineEnd(t, h);
    else if (how === M_UP) { if (ls === 0) p = 0; else { const ps = lineStart(t, ls - 1); p = imin(ps + h - ls, ls - 1); } }
    else if (how === M_DOWN) { const le = lineEnd(t, h); if (le >= t.length) p = t.length; else p = imin(le + 1 + h - ls, lineEnd(t, le + 1)); }
    else if (how === M_TOP) p = 0;
    else if (how === M_BOTTOM) p = t.length;
    sels.push(extend ? e.anchor(i) : p); sels.push(p);
  }
  return norm(t, sels, e.main);
}

// ---------------------------------------------------------------- undo
/** Undo and redo of a buffer: whole states (text and selections), so one step restores an edit made at every cursor.
 *  ponytail: a copy of the text per step, 200 steps; store the edits instead when sketches reach megabytes. */
export class History {
  undo: Ed[] = []; redo: Ed[] = [];
  typing: boolean = false;   // the last step is a run of typed characters: the next one joins it
  /** Records the state before an edit. `typing`: joins the previous step when that one was typing too. */
  record(before: Ed, typing: boolean): void {
    if (!(typing && this.typing && this.undo.length > 0)) { this.undo.push(before); if (this.undo.length > 200) this.undo.shift(); }
    this.redo = [];
    this.typing = typing;
  }
  /** The state to go back to (null: nothing to undo); `now` goes to the redo side. */
  back(now: Ed): Ed | null { this.typing = false; if (this.undo.length === 0) return null; this.redo.push(now); return this.undo.pop(); }
  forward(now: Ed): Ed | null { this.typing = false; if (this.redo.length === 0) return null; this.undo.push(now); return this.redo.pop(); }
}
