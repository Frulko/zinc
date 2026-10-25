// zinc:markdown: Markdown parsed by md4c (vendor/md4c, MIT) into a tree of blocks, spans and texts. The tree mirrors md4c's callbacks:
// a block (paragraph, heading, list, item, quote, code, table...) holds blocks or inline content; a span (emphasis, strong, link, image,
// code, strikethrough) holds inline content; a text is a leaf. Docs: docs/plugins/markdown.md.
import M from './native/markdown.spec';

// block kinds: md4c's MD_BLOCKTYPE
export const DOC: i32 = 0, QUOTE: i32 = 1, UL: i32 = 2, OL: i32 = 3, LI: i32 = 4, HR: i32 = 5, H: i32 = 6, CODE: i32 = 7, HTML: i32 = 8,
  P: i32 = 9, TABLE: i32 = 10, THEAD: i32 = 11, TBODY: i32 = 12, TR: i32 = 13, TH: i32 = 14, TD: i32 = 15;
// span kinds: SPAN + md4c's MD_SPANTYPE
export const SPAN: i32 = 100;
export const EM: i32 = 100, STRONG: i32 = 101, LINK: i32 = 102, IMG: i32 = 103, CODE_SPAN: i32 = 104, DEL: i32 = 106, WIKILINK: i32 = 109,
  UNDERLINE: i32 = 110, MARK: i32 = 115;
// text kinds: TEXT + md4c's MD_TEXTTYPE (a soft break is a space, a hard break a new line)
export const TEXT: i32 = 200;
export const T_NORMAL: i32 = 200, T_BR: i32 = 202, T_CODE: i32 = 205, T_HTML: i32 = 206;

// md4c's MD_FLAG_*: the dialect
export const FLAG_PERMISSIVE_AUTOLINKS: i32 = 0x4 | 0x8 | 0x400;
export const FLAG_TABLES: i32 = 0x100;
export const FLAG_STRIKETHROUGH: i32 = 0x200;
export const FLAG_TASKLISTS: i32 = 0x800;
export const FLAG_WIKILINKS: i32 = 0x2000;
export const FLAG_UNDERLINE: i32 = 0x4000;
export const FLAG_NO_HTML: i32 = 0x20 | 0x40;
/** GitHub's dialect without the admonitions and footnotes: tables, task lists, strikethrough, autolinks. */
export const GITHUB: i32 = FLAG_PERMISSIVE_AUTOLINKS | FLAG_TABLES | FLAG_STRIKETHROUGH | FLAG_TASKLISTS;

export class Node {
  kind: i32;
  children: Node[] = [];
  /** H: 1..6; OL: the first number. */
  level: i32 = 0;
  /** LI: -1 not a task, 0 open, 1 done. */
  task: i32 = -1;
  /** LI of a task: the byte offset of its mark in the source (setTask). */
  taskOffset: i32 = -1;
  /** TH, TD: 0 default, 1 left, 2 centre, 3 right. */
  align: i32 = 0;
  /** LINK, IMG, WIKILINK: the target. */
  href: string = '';
  title: string = '';
  /** CODE: the fence's language. */
  lang: string = '';
  /** texts: the text (decoded entities). */
  text: string = '';
  constructor(kind: i32) { this.kind = kind; }
  isBlock(): boolean { return this.kind < SPAN; }
  isSpan(): boolean { return this.kind >= SPAN && this.kind < TEXT; }
  isText(): boolean { return this.kind >= TEXT; }
}

/** The tree of `src`: a DOC node. `flags` is the dialect (GITHUB by default). */
export function parse(src: string, flags: i32 = GITHUB): Node {
  const root = new Node(DOC);
  const stack: Node[] = [];
  const events = M.events(src, flags);
  for (const rec of events.split('\x1e')) {
    if (rec.length < 2) continue;
    const f = rec.split('\x1f');
    const op = f[0].charAt(0);
    const type = parseInt(f[0].slice(1));
    const top = stack.length > 0 ? stack[stack.length - 1] : root;
    if (op === 'B') {
      if (type === DOC) { stack.push(root); continue; }
      const n = new Node(type);
      const a = parseInt(f[1]), b = parseInt(f[2]);
      if (type === H || type === OL) n.level = a;
      else if (type === LI) { n.task = a; n.taskOffset = b; }
      else if (type === TH || type === TD) n.align = a;
      else if (type === CODE) n.lang = f[3];
      top.children.push(n);
      stack.push(n);
    } else if (op === 'S') {
      const n = new Node(SPAN + type);
      n.href = f[3]; n.title = f.length > 4 ? f[4] : '';
      top.children.push(n);
      stack.push(n);
    } else if (op === 'b' || op === 's') {
      if (stack.length > 0) stack.pop();
    } else if (op === 'T') {
      // a null character, a soft break and an entity are normal text (decoded natively); consecutive texts of one kind are one leaf
      const n = new Node(type === 1 || type === 3 || type === 4 ? T_NORMAL : TEXT + type);
      n.text = type === 2 ? '\n' : type === 3 ? ' ' : f[3];
      const last = top.children.length > 0 ? top.children[top.children.length - 1] : null;
      if (last !== null && n.kind !== T_BR && (last as Node).kind === n.kind) (last as Node).text += n.text;
      else top.children.push(n);
    }
  }
  return root;
}

/** The text of a node and everything under it (headings for a table of contents, link labels). */
export function textOf(n: Node): string {
  if (n.isText()) return n.text;
  let s = '';
  for (const c of n.children) s += textOf(c);
  return s;
}

/** `src` with the task list item whose mark is at `offset` (Node.taskOffset) set done or open: '[x]' or '[ ]' in the file. */
export function setTask(src: string, offset: i32, done: boolean): string { return M.setByte(src, offset, done ? 'x' : ' '); }

/** The version of md4c. */
export function version(): string { return M.version(); }
