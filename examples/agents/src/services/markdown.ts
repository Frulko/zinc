// Markdown of an agent's answer, as blocks the chat draws: headings, paragraphs, list items, quotes, fenced code, tables and
// rules. Inline marks (**bold**, *italic*, `code`, [links](url)) become the style runs of one text (ui.setTextRuns), so a
// paragraph stays a single selectable text. It parses a finished item's text (at most its 16 KB head, transcript.ts): a cut
// in the middle of a fence or a mark only loses that mark.
//
// ponytail: a line-based subset of CommonMark (no nested block quotes holding lists, no setext headings, no HTML, no
// reference links, no autolinks); enough for what the CLIs write. A real CommonMark parser if answers need more.

export const B_PARA = 0, B_HEADING = 1, B_ITEM = 2, B_QUOTE = 3, B_CODE = 4, B_TABLE = 5, B_RULE = 6;

/** The style bits of a run (zinc:ui RUN_BOLD, RUN_ITALIC, RUN_MONO, RUN_UNDERLINE). */
export const S_BOLD = 1, S_ITALIC = 2, S_MONO = 4, S_UNDERLINE = 8;
/** The colour role of a run, turned into a colour of the scheme when drawn: the text's own, inline code, a link. */
export const R_TEXT = 0, R_CODE = 1, R_LINK = 2;

/** Text with its marks taken out: `runs` is [length, style, role, ...] covering `text`. */
export class Inline {
  text: string;
  runs: i32[];
  /** The links' targets, in order. */
  links: string[];
  constructor(text: string, runs: i32[], links: string[]) { this.text = text; this.runs = runs; this.links = links; }
  /** True when every run is plain: the text needs no runs. */
  plain(): boolean {
    for (let k = 1; k < this.runs.length; k += 3) if (this.runs[k] !== 0 || this.runs[k + 1] !== R_TEXT) return false;
    return true;
  }
}

export class Block {
  kind: i32;
  /** B_HEADING: 1..6; B_ITEM: the nesting depth (0 = top). */
  level: i32 = 0;
  /** B_ITEM: '•' or the number written ('3.'). */
  marker: string = '';
  /** B_CODE: the fence's language. */
  lang: string = '';
  /** B_CODE: the code, as written. */
  code: string = '';
  /** Every kind but B_CODE, B_TABLE and B_RULE. */
  inline: Inline = new Inline('', [], []);
  /** B_TABLE: the header row, then the body rows, each cell parsed. */
  rows: Inline[][] = [];
  constructor(kind: i32) { this.kind = kind; }
}

/** The blocks of `src`. */
export function parse(src: string): Block[] {
  const out: Block[] = [];
  const lines = src.split('\n');
  let para: string[] = [];
  const flush = (): void => {
    if (para.length > 0) { const b = new Block(B_PARA); b.inline = inline(para.join(' ')); out.push(b); para = []; }
  };
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i].endsWith('\r') ? lines[i].slice(0, lines[i].length - 1) : lines[i];
    const t = raw.trim();
    const indent = raw.length - raw.trimStart().length;
    // fenced code: everything up to the closing fence (or the end), kept as written
    const fence = t.startsWith('```') ? '```' : t.startsWith('~~~') ? '~~~' : '';
    if (fence !== '') {
      flush();
      const b = new Block(B_CODE);
      b.lang = t.slice(3).trim().split(' ')[0];
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) {
        const l = lines[i];
        body.push(indent > 0 && l.length - l.trimStart().length >= indent ? l.slice(indent) : l);
        i++;
      }
      b.code = body.join('\n');
      out.push(b);
      i++;
      continue;
    }
    if (t === '') { flush(); i++; continue; }
    const h = heading(t);
    if (h > 0) { flush(); const b = new Block(B_HEADING); b.level = h; b.inline = inline(trimHashes(t.slice(h).trim())); out.push(b); i++; continue; }
    if (isRule(t)) { flush(); out.push(new Block(B_RULE)); i++; continue; }
    if (t.startsWith('>')) {
      flush();
      const q: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) { q.push(lines[i].trim().slice(1).trim()); i++; }
      const b = new Block(B_QUOTE); b.inline = inline(q.join(' ')); out.push(b);
      continue;
    }
    const m = listMarker(t);
    if (m !== '') {
      flush();
      const b = new Block(B_ITEM);
      b.level = Math.min(4, Math.floor(indent / 2));
      b.marker = m === '-' || m === '*' || m === '+' ? '•' : m;
      const body: string[] = [t.slice(m.length).trim()];
      i++;
      // lazy continuation: indented lines that are not a new item, a fence or a blank
      while (i < lines.length) {
        const n = lines[i], nt = n.trim();
        if (nt === '' || listMarker(nt) !== '' || nt.startsWith('```') || heading(nt) > 0 || nt.startsWith('>') || n.length - n.trimStart().length === 0) break;
        body.push(nt); i++;
      }
      b.inline = inline(body.join(' '));
      out.push(b);
      continue;
    }
    if (t.startsWith('|') && i + 1 < lines.length && isTableRule(lines[i + 1].trim())) {
      flush();
      const b = new Block(B_TABLE);
      b.rows.push(cells(t));
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) { b.rows.push(cells(lines[i].trim())); i++; }
      out.push(b);
      continue;
    }
    para.push(t);
    i++;
  }
  flush();
  return out;
}

function heading(t: string): i32 {
  let k = 0;
  while (k < t.length && k < 7 && t.charAt(k) === '#') k++;
  return k >= 1 && k <= 6 && (t.length === k || t.charAt(k) === ' ') ? k : 0;
}

function isRule(t: string): boolean {
  if (t.length < 3) return false;
  const c = t.charAt(0);
  if (c !== '-' && c !== '*' && c !== '_') return false;
  for (let k = 0; k < t.length; k++) { const d = t.charAt(k); if (d !== c && d !== ' ') return false; }
  return true;
}

/** '-', '*', '+' or '12.' / '3)' when `t` starts a list item, else ''. */
function listMarker(t: string): string {
  const c = t.charAt(0);
  if ((c === '-' || c === '*' || c === '+') && t.charAt(1) === ' ') return c;
  let k = 0;
  while (k < t.length && k < 9 && t.charCodeAt(k) >= 48 && t.charCodeAt(k) <= 57) k++;
  if (k > 0 && (t.charAt(k) === '.' || t.charAt(k) === ')') && t.charAt(k + 1) === ' ') return t.slice(0, k + 1);
  return '';
}

function isTableRule(t: string): boolean {
  if (!t.startsWith('|') || t.indexOf('-') < 0) return false;
  for (let k = 0; k < t.length; k++) { const c = t.charAt(k); if (c !== '|' && c !== '-' && c !== ':' && c !== ' ') return false; }
  return true;
}

function cells(row: string): Inline[] {
  let r = row;
  if (r.startsWith('|')) r = r.slice(1);
  if (r.endsWith('|')) r = r.slice(0, r.length - 1);
  const out: Inline[] = [];
  for (const c of r.split('|')) out.push(inline(c.trim()));
  return out;
}

/** The text of `s` without its marks, and the style runs they gave. */
export function inline(s: string): Inline {
  let text = '';
  const runs: i32[] = [];
  const links: string[] = [];
  let style = 0;
  let runStart = 0, runStyle = 0, runRole = R_TEXT;
  const cut = (nextStyle: i32, nextRole: i32): void => {   // ends the current run where the text is now
    if (text.length > runStart) { runs.push(text.length - runStart); runs.push(runStyle); runs.push(runRole); }
    runStart = text.length; runStyle = nextStyle; runRole = nextRole;
  };
  let i = 0;
  while (i < s.length) {
    const c = s.charAt(i);
    if (c === '\\' && i + 1 < s.length && '\\`*_[]()#+-.!|~'.indexOf(s.charAt(i + 1)) >= 0) { text += s.charAt(i + 1); i += 2; continue; }
    if (c === '`') {
      let ticks = 1;
      while (s.charAt(i + ticks) === '`') ticks++;
      const close = s.indexOf('`'.repeat(ticks), i + ticks);
      if (close > 0) {
        cut(style | S_MONO, R_CODE);
        text += s.slice(i + ticks, close).trim() === '' ? s.slice(i + ticks, close) : s.slice(i + ticks, close).trim();
        cut(style, R_TEXT);
        i = close + ticks;
        continue;
      }
    }
    if (c === '[') {
      const end = s.indexOf('](', i + 1), close = end > 0 ? s.indexOf(')', end + 2) : -1;
      if (end > 0 && close > 0 && s.slice(i + 1, end).indexOf('[') < 0) {
        cut(style | S_UNDERLINE, R_LINK);
        text += s.slice(i + 1, end);
        cut(style, R_TEXT);
        links.push(s.slice(end + 2, close));
        i = close + 1;
        continue;
      }
    }
    if ((c === '*' || c === '_') && s.charAt(i + 1) === c && s.charAt(i + 2) === c && emphasisCanToggle(s, i, 3, (style & 3) === 3)) {
      style = style ^ (S_BOLD | S_ITALIC); cut(style, R_TEXT); i += 3; continue;
    }
    if ((c === '*' || c === '_') && s.charAt(i + 1) === c && emphasisCanToggle(s, i, 2, (style & S_BOLD) !== 0)) {
      style = style ^ S_BOLD; cut(style, R_TEXT); i += 2; continue;
    }
    if ((c === '*' || c === '_') && emphasisCanToggle(s, i, 1, (style & S_ITALIC) !== 0)) {
      style = style ^ S_ITALIC; cut(style, R_TEXT); i += 1; continue;
    }
    text += c;
    i++;
  }
  cut(0, R_TEXT);
  return new Inline(text, runs, links);
}

/** A `*`/`_` mark of `n` characters at i opens (when the next character is not a space and a closing mark follows) or
 *  closes (when the previous one is not a space) emphasis; `_` inside a word (snake_case) never does. */
function emphasisCanToggle(s: string, i: i32, n: i32, open: boolean): boolean {
  const c = s.charAt(i);
  const before = i > 0 ? s.charAt(i - 1) : ' ', after = i + n < s.length ? s.charAt(i + n) : ' ';
  if (c === '_' && isWord(before) && isWord(after)) return false;
  if (open) return before !== ' ';
  if (after === ' ' || after === c) return false;
  return s.indexOf(c.repeat(n), i + n + 1) > 0;
}

function isWord(c: string): boolean {
  const k = c.charCodeAt(0);
  return (k >= 48 && k <= 57) || (k >= 65 && k <= 90) || (k >= 97 && k <= 122);
}

/** A heading's text without its closing hashes (`## Title ##`). */
function trimHashes(t: string): string {
  let e = t.length;
  while (e > 0 && t.charAt(e - 1) === '#') e--;
  return e < t.length && (e === 0 || t.charAt(e - 1) === ' ') ? t.slice(0, e).trim() : t;
}
