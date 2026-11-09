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

/** The text of a node and everything under it (headings for a table of contents, link labels). */
export function textOf(n: Node): string {
  if (n.isText()) return n.text;
  let s = '';
  for (const c of n.children) s += textOf(c);
  return s;
}

