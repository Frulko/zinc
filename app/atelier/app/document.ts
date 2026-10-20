// Text analysis of an open file: lines, highlight tokens per line (with the tokenizer state carried from line to
// line) and bracket matching. Everything is recomputed lazily after an edit: the lines at once (one split), the
// tokens only for the lines that get drawn (the editor's rows, the minimap), from the first line on.
// Work is done on the line strings, never by indexing the whole text: Zinc strings are UTF-8, so charCodeAt / slice
// on a non-ASCII string cost O(offset).
import { tokenize, S_NORMAL, T_KEYWORD, T_STRING, T_NUMBER, T_COMMENT, T_FN, T_TYPE, T_PROPERTY, T_CONSTANT, T_PUNCT,
  T_TAG, T_ATTR, T_HEADING, T_LINK } from './syntax';
import { Theme } from './theme';

/** Colour of a token kind in a theme; -1 for plain text (the editor's text colour). */
export function tokenColor(t: Theme, tok: i32): i32 {
  if (tok === T_KEYWORD) return t.keyword;
  if (tok === T_STRING) return t.string;
  if (tok === T_NUMBER) return t.number;
  if (tok === T_COMMENT) return t.comment;
  if (tok === T_FN) return t.fn;
  if (tok === T_TYPE) return t.type;
  if (tok === T_PROPERTY) return t.property;
  if (tok === T_CONSTANT) return t.constant;
  if (tok === T_PUNCT) return t.punctuation;
  if (tok === T_TAG) return t.tag;
  if (tok === T_ATTR) return t.attribute;
  if (tok === T_HEADING) return t.heading;
  if (tok === T_LINK) return t.link;
  return -1;
}

export class Doc {
  lang: i32;
  text: string = '';
  lines: string[] = [''];
  starts: i32[] = [0];                 // offset of the first character of each line
  private states: i32[] = [S_NORMAL];  // tokenizer state at the start of line i (known for i < states.length)
  private runs: i32[][] = [];          // token runs of line i (known for i < runs.length)
  constructor(lang: i32) { this.lang = lang; }

  setText(t: string): void {
    if (t === this.text) return;
    this.text = t;
    this.lines = t.split('\n');
    const starts: i32[] = [];
    let p: i32 = 0;
    for (const l of this.lines) { starts.push(p); p += l.length + 1; }
    this.starts = starts;
    // ponytail: tokens are recomputed from line 0 after any edit; restart from the edited line if huge files need it
    this.states = [S_NORMAL]; this.runs = [];
  }
  lineCount(): i32 { return this.starts.length; }
  lineEnd(i: i32): i32 { return this.starts[i] + this.lines[i].length; }
  lineText(i: i32): string { return this.lines[i]; }
  /** Line of an offset (binary search). */
  lineOf(off: i32): i32 {
    let lo: i32 = 0, hi: i32 = this.starts.length - 1;
    while (lo < hi) { const mid: i32 = (lo + hi + 1) >> 1; if (this.starts[mid] <= off) lo = mid; else hi = mid - 1; }
    return lo;
  }
  /** Token runs [length, token...] of line i, tokenizing the lines before it once if needed. */
  tokens(i: i32): i32[] {
    while (this.runs.length <= i) {
      const k: i32 = this.runs.length, out: i32[] = [];
      this.states.push(tokenize(this.lang, this.lineText(k), this.states[k], out));
      this.runs.push(out);
    }
    return this.runs[i];
  }
  /** Colour runs [length, color...] for one visual row of the editor: `row` starts at offset `start`. */
  rowColors(row: string, start: i32, t: Theme): i32[] {
    const li = this.lineOf(start);
    const toks = this.tokens(li);
    let skip: i32 = start - this.starts[li], left: i32 = row.length;
    const out: i32[] = [];
    for (let i = 0; i + 1 < toks.length && left > 0; i += 2) {
      let len = toks[i];
      if (skip >= len) { skip -= len; continue; }
      len -= skip; skip = 0;
      if (len > left) len = left;
      const c = tokenColor(t, toks[i + 1]);
      if (out.length >= 2 && out[out.length - 1] === c) out[out.length - 2] += len;
      else { out.push(len); out.push(c); }
      left -= len;
    }
    return out;
  }
}

const OPEN = '([{', CLOSE = ')]}';
/** [a, b] offsets of the bracket at / before the caret and its match, or [] (ponytail: strings are not skipped). */
export function matchBracket(doc: Doc, caret: i32): i32[] {
  const li = doc.lineOf(caret), col = caret - doc.starts[li], line = doc.lines[li];
  for (let k = 0; k < 2; k++) {
    const at: i32 = col - k;   // the character after the caret first, then the one before it
    if (at < 0 || at >= line.length) continue;
    const ch = line.slice(at, at + 1);
    const o = OPEN.indexOf(ch), c = CLOSE.indexOf(ch);
    if (o < 0 && c < 0) continue;
    const open = (o >= 0 ? ch : OPEN.slice(c, c + 1)).charCodeAt(0), close = (o >= 0 ? CLOSE.slice(o, o + 1) : ch).charCodeAt(0);
    const step: i32 = o >= 0 ? 1 : -1;
    let depth: i32 = 0, n: i32 = 0, l: i32 = li, i: i32 = at;
    // walk line by line (at most 2000 lines away)
    while (l >= 0 && l < doc.lines.length && n < 2000) {
      const s = doc.lines[l];
      if (l !== li) i = step > 0 ? 0 : s.length - 1;
      for (; i >= 0 && i < s.length; i += step) {
        const x = s.charCodeAt(i);
        if (x === open) depth += step;
        else if (x === close) depth -= step;
        if (depth === 0) return [caret - col + at, doc.starts[l] + i];
      }
      l += step; n++;
    }
    return [];
  }
  return [];
}
