// The paged layout of a Markdown tree (zinc:markdown) for e-paper: every block is cut into lines, and lines go on fixed pages of the
// reading view's size, so a page turn is one redraw and nothing scrolls. The result is what a page draws (items), where the taps go
// (links and task boxes) and the headings with their pages (the table of contents).
import * as md from 'zinc:markdown';
import { loadFont, font, fontAscent, lineHeight, textWidth, imageFromBytes, imageWidth, imageHeight } from 'zinc:gfx';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { sha256, toHex, base64Decode } from 'zinc:web';
import { MARGIN, DATA_DIR } from './constants';

export const I_TEXT: i32 = 0, I_FILL: i32 = 1, I_BOX: i32 = 2, I_IMAGE: i32 = 3, I_CHECK: i32 = 4;
const BLACK: u32 = 0x000000, GREY: u32 = 0xe8e8e8, DARK: u32 = 0x555555;

/** One thing drawn on a page, in page pixels. */
export class Item {
  kind: i32;
  x: number; y: number; w: number; h: number;
  font: i32 = -1;
  text: string = '';
  color: u32 = BLACK;
  img: i32 = -1;
  on: boolean = false;   // I_CHECK: ticked
  constructor(kind: i32, x: number, y: number, w: number, h: number) { this.kind = kind; this.x = x; this.y = y; this.w = w; this.h = h; }
}
/** A tap target: a link (href) or a task box (task = the byte offset of its mark). */
export class Hit {
  page: i32; x: number; y: number; w: number; h: number;
  href: string = '';
  task: i32 = -1;
  done: boolean = false;
  constructor(page: i32, x: number, y: number, w: number, h: number) { this.page = page; this.x = x; this.y = y; this.w = w; this.h = h; }
}
export class Heading {
  text: string; level: i32; page: i32; slug: string;
  constructor(text: string, level: i32, page: i32) { this.text = text; this.level = level; this.page = page; this.slug = slug(text); }
}
export class Layout {
  pages: Item[][] = [];
  hits: Hit[] = [];
  headings: Heading[] = [];
  w: number = 0; h: number = 0;
}

/** GitHub's anchor of a heading: lower case, spaces to '-', other punctuation dropped. */
export function slug(s: string): string {
  let out = '';
  for (const c of s.trim().toLowerCase().split('')) {
    if (c === ' ') out += '-';
    else if (c === '-' || c === '_' || (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || c.charCodeAt(0) > 127) out += c;
  }
  return out;
}

const fonts = new Map<string, i32>();
function face(family: string, px: number): i32 {
  const k = family + ':' + Math.round(px).toString();
  const f = fonts.get(k);
  if (f !== undefined) return f;
  let id = loadFont(family, Math.round(px));
  if (id < 0) id = font(family, Math.round(px) as i32);
  fonts.set(k, id);
  return id;
}

// a word (with its trailing space) or a picture of the inline content
class Token {
  text: string = '';
  font: i32 = -1;
  href: string = '';
  strike: boolean = false;
  code: boolean = false;
  img: i32 = -1;
  w: number = 0; h: number = 0;
  br: boolean = false;
}
class Line { tokens: Token[] = []; xs: number[] = []; h: number = 0; asc: number = 0; }

// A picture is a file next to the document (a relative path, its %-escapes decoded), an absolute path, a data: URI, or an http(s) URL
// read from the cache the reader fills (fetchPictures in state.ts): the layout never waits on the network.
const images = new Map<string, i32>();
const isRemote = (href: string): boolean => href.startsWith('http://') || href.startsWith('https://');
/** Where an http(s) picture is cached. */
export function cachedPicture(url: string): string { return DATA_DIR + '/pictures/' + toHex(sha256(sys.utf8Encode(url))).slice(0, 32); }
function picture(href: string, dir: string): i32 {
  const remote = isRemote(href);
  let path = '';
  if (remote) path = cachedPicture(href);
  else if (!href.startsWith('data:')) {
    let rel = href.split('#')[0].split('?')[0];
    try { rel = decodeURIComponent(rel); } catch (e) { }
    path = rel.startsWith('/') ? rel : dir + '/' + rel;
  }
  const key = path !== '' ? path : href;
  const c = images.get(key);
  if (c !== undefined) return c;
  let id = -1;
  try {
    if (path === '') { const at = href.indexOf(';base64,'); if (at > 0) id = imageFromBytes(base64Decode(href.slice(at + 8))); }
    else if (fs.exists(path)) id = imageFromBytes(fs.readBytes(path));
  } catch (e) { id = -1; }
  if (id >= 0 || !remote) images.set(key, id);   // a remote picture not cached yet is looked up again after the fetch
  return id;
}

/** The http(s) pictures of a document, in order, each once. */
export function remotePictures(doc: md.Node): string[] {
  const out: string[] = [];
  const walk = (n: md.Node): void => {
    if (n.kind === md.IMG && isRemote(n.href) && out.indexOf(n.href) < 0) out.push(n.href);
    for (const c of n.children) walk(c);
  };
  walk(doc);
  return out;
}

export function layout(doc: md.Node, w: number, h: number, px: number, dir: string): Layout {
  const p = new Pager(w, h, px, dir);
  for (const c of doc.children) p.block(c, MARGIN, w - 2 * MARGIN, 0);
  const L = p.L;
  while (L.pages.length > 1 && L.pages[L.pages.length - 1].length === 0) L.pages.pop();
  return L;
}

// the cursor of the layout: the page being filled and the height used on it
class Pager {
  L: Layout = new Layout();
  h: number; px: number; dir: string;
  body: i32; bold: i32; mono: i32; gap: number;
  page: i32 = 0;
  y: number = MARGIN;
  constructor(w: number, h: number, px: number, dir: string) {
    this.L.w = w; this.L.h = h; this.L.pages.push([]);
    this.h = h; this.px = px; this.dir = dir;
    this.body = face('sans', px); this.bold = face('sans-bold', px); this.mono = face('mono', px * 0.88);
    this.gap = Math.round(px * 0.6);
  }
  newPage(): void { this.L.pages.push([]); this.page++; this.y = MARGIN; }
  /** A new page unless `need` pixels fit on this one (a page never starts empty because of it). */
  ensure(need: number): void { if (this.y + need > this.h - MARGIN && this.y > MARGIN) this.newPage(); }
  put(it: Item): void { this.L.pages[this.page].push(it); }

  // ---- inline content: tokens, then lines that fit a width
  tokens(nodes: md.Node[], f: i32, out: Token[], href: string, strike: boolean): void {
    for (const n of nodes) {
      if (n.kind === md.T_BR) { const t = new Token(); t.br = true; out.push(t); continue; }
      if (n.isText()) { this.words(n, f, out, href, strike); continue; }
      if (n.kind === md.STRONG) this.tokens(n.children, f === this.mono ? this.mono : this.bold, out, href, strike);
      else if (n.kind === md.CODE_SPAN) this.tokens(n.children, this.mono, out, href, strike);
      else if (n.kind === md.DEL) this.tokens(n.children, f, out, href, true);
      else if (n.kind === md.LINK) this.tokens(n.children, f, out, n.href, strike);
      else if (n.kind === md.WIKILINK) this.tokens(n.children, f, out, n.href + '.md', strike);
      else if (n.kind === md.IMG) {
        const id = picture(n.href, this.dir);
        if (id >= 0) { const t = new Token(); t.img = id; t.w = imageWidth(id); t.h = imageHeight(id); out.push(t); }
        else this.tokens([textNode('[picture: ' + (md.textOf(n) !== '' ? md.textOf(n) : n.href) + '] ')], f, out, href, strike);
      } else this.tokens(n.children, f, out, href, strike);   // emphasis (no italic face: the body face), underline, mark...
    }
  }
  /** The words of a text, each with its trailing space (a run of spaces is one). */
  words(n: md.Node, f: i32, out: Token[], href: string, strike: boolean): void {
    const code = n.kind === md.T_CODE || n.kind === md.T_HTML;
    const ff = code ? this.mono : f;
    let word = '';
    for (const c of n.text.split('')) {
      if (c === '\n') { this.word(word, ff, out, href, strike, code); word = ''; const t = new Token(); t.br = true; out.push(t); continue; }
      if (c !== ' ') { word += c; continue; }
      this.word(word === '' ? ' ' : word + ' ', ff, out, href, strike, code);
      word = '';
    }
    this.word(word, ff, out, href, strike, code);
  }
  word(s: string, f: i32, out: Token[], href: string, strike: boolean, code: boolean): void {
    if (s === '') return;
    if (s === ' ') {   // a space alone joins the word before it, or goes
      if (out.length === 0) return;
      const last = out[out.length - 1];
      if (last.img < 0 && !last.br && !last.text.endsWith(' ')) { last.text += ' '; last.w = textWidth(last.font, last.text, 0); }
      return;
    }
    const t = new Token(); t.text = s; t.font = f; t.href = href; t.strike = strike; t.code = code;
    t.w = textWidth(f, s, 0); t.h = lineHeight(f);
    out.push(t);
  }
  lines(toks: Token[], width: number): Line[] {
    const out: Line[] = [];
    let cur = new Line(), x: number = 0;
    for (const t0 of toks) {
      if (t0.br) { this.endLine(cur, out); cur = new Line(); x = 0; continue; }
      let t = t0;
      if (t.img >= 0 && t.w > width) { const k = width / t.w; t.w = width; t.h = t.h * k; }
      const trail = t.text.endsWith(' ') ? textWidth(t.font, ' ', 0) : 0;
      if (x > 0 && x + t.w - trail > width) { this.endLine(cur, out); cur = new Line(); x = 0; }
      // a word longer than the line (a URL): cut where it fits
      while (t.img < 0 && t.w - trail > width - x && t.text.length > 1) {
        let n: i32 = t.text.length - 1;
        while (n > 1 && textWidth(t.font, t.text.slice(0, n), 0) > width - x) n--;
        x = this.add(cur, part(t, t.text.slice(0, n)), x);
        this.endLine(cur, out); cur = new Line(); x = 0;
        t = part(t, t.text.slice(n));
      }
      x = this.add(cur, t, x);
    }
    if (cur.tokens.length > 0) this.endLine(cur, out);
    return out;
  }
  add(cur: Line, t: Token, x: number): number {
    cur.tokens.push(t); cur.xs.push(x);
    cur.asc = Math.max(cur.asc, t.img >= 0 ? t.h : fontAscent(t.font));
    cur.h = Math.max(cur.h, t.img >= 0 ? t.h + 8 : t.h);
    return x + t.w;
  }
  endLine(cur: Line, out: Line[]): void { if (cur.h === 0) cur.h = lineHeight(this.body); out.push(cur); }

  /** One line at (x0, ly) of page `pg`: its words, links underlined (with their tap boxes), struck words, code shaded. */
  drawLine(ln: Line, x0: number, ly: number, pg: i32): void {
    const items = this.L.pages[pg];
    for (let i: i32 = 0; i < ln.tokens.length; i++) {
      const t = ln.tokens[i], tx = x0 + ln.xs[i];
      if (t.img >= 0) { const it = new Item(I_IMAGE, tx, ly + 4, t.w, t.h); it.img = t.img; items.push(it); continue; }
      const ty = ly + ln.asc - fontAscent(t.font);
      const tw = t.text.endsWith(' ') ? t.w - textWidth(t.font, ' ', 0) : t.w;
      if (t.code) items.push(fill(tx - 2, ty, tw + 4, t.h, GREY));
      const it = new Item(I_TEXT, tx, ty, t.w, t.h); it.font = t.font; it.text = t.text; items.push(it);
      if (t.href !== '') {
        items.push(fill(tx, ty + fontAscent(t.font) + 4, tw, 3, BLACK));
        const hit = new Hit(pg, tx, ly, t.w, ln.h); hit.href = t.href; this.L.hits.push(hit);
      }
      if (t.strike) items.push(fill(tx, ty + t.h * 0.55, tw, 3, BLACK));
    }
  }
  flow(nodes: md.Node[], f: i32, x: number, width: number): void {
    const toks: Token[] = [];
    this.tokens(nodes, f, toks, '', false);
    for (const ln of this.lines(toks, width)) { this.ensure(ln.h); this.drawLine(ln, x, this.y, this.page); this.y += ln.h; }
  }

  // ---- blocks
  block(n: md.Node, x: number, width: number, depth: i32): void {
    const k = n.kind, px = this.px, gap = this.gap;
    if (k === md.P) { this.flow(n.children, this.body, x, width); this.y += gap; }
    else if (k === md.H) {
      const f = face('sans-bold', px * (n.level === 1 ? 1.7 : n.level === 2 ? 1.4 : n.level === 3 ? 1.2 : 1.05));
      this.y += n.level <= 2 ? gap : gap / 2;
      this.ensure(lineHeight(f) * 2);   // a heading never ends a page
      this.L.headings.push(new Heading(md.textOf(n), n.level, this.page));
      this.flow(n.children, f, x, width);
      if (n.level <= 2) { this.put(fill(x, this.y + 6, width, n.level === 1 ? 4 : 2, BLACK)); this.y += 14; }
      this.y += gap / 2;
    } else if (k === md.UL || k === md.OL) {
      let num: i32 = n.level;
      for (const li of n.children) { this.item(li, k === md.OL ? num.toString() + '.' : '•', x, width, depth); num++; }
      if (depth === 0) this.y += gap / 2;
    } else if (k === md.QUOTE) {
      const p0 = this.page, y0 = this.y, indent = px * 1.2;
      for (const c of n.children) this.block(c, x + indent, width - indent, depth);
      for (let p: i32 = p0; p <= this.page; p++) {   // the bar on each page the quote crosses
        const top = p === p0 ? y0 : MARGIN, bottom = p === this.page ? this.y - gap : this.h - MARGIN;
        if (bottom > top) this.L.pages[p].push(fill(x + 4, top, 6, bottom - top, DARK));
      }
    } else if (k === md.CODE) {
      const src = md.textOf(n);
      const pad = 16;
      this.y += 4;
      for (const raw of (src.endsWith('\n') ? src.slice(0, src.length - 1) : src).split('\n')) {
        const t = new Token(); t.text = raw === '' ? ' ' : raw; t.font = this.mono; t.w = textWidth(this.mono, t.text, 0); t.h = lineHeight(this.mono);
        for (const ln of this.lines([t], width - 2 * pad)) {
          this.ensure(ln.h);
          this.put(fill(x, this.y, width, ln.h, GREY));
          this.drawLine(ln, x + pad, this.y, this.page);
          this.y += ln.h;
        }
      }
      this.y += gap;
    } else if (k === md.HR) { this.ensure(gap * 2); this.y += gap; this.put(fill(x, this.y, width, 3, BLACK)); this.y += gap; }
    else if (k === md.TABLE) this.table(n, x, width);
    else if (k === md.HTML) { this.flow([textNode(md.textOf(n))], this.mono, x, width); this.y += gap; }
    else for (const c of n.children) this.block(c, x, width, depth);
  }
  item(li: md.Node, marker: string, x: number, width: number, depth: i32): void {
    const px = this.px, indent = px * 1.6, lh = lineHeight(this.body);
    this.ensure(lh);
    const pg = this.page, top = this.y;
    if (li.task >= 0) {
      const s = Math.round(px * 0.9), bx = x + 4, by = top + (lh - s) / 2;
      const box = new Item(I_CHECK, bx, by, s, s); box.on = li.task === 1; this.put(box);
      const hit = new Hit(pg, bx - 16, by - 16, s + 32, s + 32); hit.task = li.taskOffset; hit.done = li.task === 1; this.L.hits.push(hit);
    } else {
      const it = new Item(I_TEXT, x + (marker === '•' ? px * 0.4 : 0), top, indent, lh); it.font = this.body; it.text = marker; this.put(it);
    }
    // a tight item holds its text, a loose one paragraphs; nested lists come after
    let inline: md.Node[] = [];
    for (const c of li.children) {
      if (!c.isBlock()) { inline.push(c); continue; }
      if (inline.length > 0) { this.flow(inline, this.body, x + indent, width - indent); inline = []; }
      this.block(c, x + indent, width - indent, depth + 1);
    }
    if (inline.length > 0) this.flow(inline, this.body, x + indent, width - indent);
    if (this.y === top && this.page === pg) this.y += lh;
  }
  table(n: md.Node, x: number, width: number): void {
    const rows: md.Node[] = [];
    const heads: boolean[] = [];
    for (const part of n.children) for (const tr of part.children) { rows.push(tr); heads.push(part.kind === md.THEAD); }
    let cols: i32 = 1;
    for (const r of rows) cols = Math.max(cols, r.children.length) as i32;
    const cw = width / cols, pad = 12;
    this.y += 4;
    for (let r: i32 = 0; r < rows.length; r++) {
      const cells: Line[][] = [];
      let rh: number = 0;
      for (const c of rows[r].children) {
        const toks: Token[] = [];
        this.tokens(c.children, heads[r] ? this.bold : this.body, toks, '', false);
        const ls = this.lines(toks, cw - 2 * pad);
        let ch: number = 2 * pad;
        for (const l of ls) ch += l.h;
        rh = Math.max(rh, ch);
        cells.push(ls);
      }
      this.ensure(rh);
      for (let c: i32 = 0; c < cols; c++) {
        const cx = x + c * cw;
        if (heads[r]) this.put(fill(cx, this.y, cw, rh, GREY));
        this.put(new Item(I_BOX, cx, this.y, cw, rh));
        if (c >= cells.length) continue;
        const align = rows[r].children[c].align;
        let ly = this.y + pad;
        for (const l of cells[c]) {
          let lw: number = 0;
          for (const t of l.tokens) lw += t.w;
          const dx = align === 2 ? (cw - 2 * pad - lw) / 2 : align === 3 ? cw - 2 * pad - lw : 0;
          this.drawLine(l, cx + pad + Math.max(0, dx), ly, this.page);
          ly += l.h;
        }
      }
      this.y += rh;
    }
    this.y += this.gap;
  }
}

function part(t: Token, s: string): Token {
  const p = new Token(); p.text = s; p.font = t.font; p.href = t.href; p.strike = t.strike; p.code = t.code;
  p.w = textWidth(t.font, s, 0); p.h = t.h;
  return p;
}

function fill(x: number, y: number, w: number, h: number, c: u32): Item { const it = new Item(I_FILL, x, y, w, h); it.color = c; return it; }
function textNode(s: string): md.Node { const n = new md.Node(md.T_NORMAL); n.text = s; return n; }
