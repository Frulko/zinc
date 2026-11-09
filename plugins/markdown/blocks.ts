// md4c's tree adapted to the standard selectable Markdown view; no second Markdown parser.
import * as md from './model';
import { Block, Inline, B_PARA, B_HEADING, B_ITEM, B_QUOTE, B_CODE, B_TABLE, B_RULE, R_CODE, R_LINK } from '../../lib/std/markdown';
function rich(nodes: md.Node[]): Inline {
  let text = '';
  const runs: i32[] = [], links: string[] = [], ranges: i32[] = [];
  const walk = (n: md.Node, style: i32, role: i32): void => {
    if (n.isText()) { text += n.text; runs.push(n.text.length); runs.push(style); runs.push(role); return; }
    const next = style | (n.kind === md.STRONG ? 1 : n.kind === md.EM ? 2 : n.kind === md.CODE_SPAN ? 4 : n.kind === md.LINK ? 8 : n.kind === md.DEL ? 16 : 0);
    const color = n.kind === md.CODE_SPAN ? R_CODE : n.kind === md.LINK ? R_LINK : role;
    const link = links.length;
    if (n.kind === md.LINK) { links.push(n.href); ranges.push(text.length); ranges.push(text.length); }
    for (const c of n.children) walk(c, next, color);
    if (n.kind === md.LINK) ranges[link * 2 + 1] = text.length;
  };
  for (const n of nodes) walk(n, 0, 0);
  return new Inline(text, runs, links, ranges);
}
export function viewBlocks(root: md.Node): Block[] {
  const out: Block[] = [];
  const walk = (n: md.Node, depth: i32, marker: string): void => {
    if (n.kind === md.DOC || n.kind === md.UL || n.kind === md.OL) {
      let index = n.level;
      for (const c of n.children) walk(c, depth + (n.kind === md.DOC ? 0 : 1), n.kind === md.OL ? String(index++) + '.' : '•');
      return;
    }
    if (n.kind === md.LI) {
      const b = new Block(B_ITEM); b.level = Math.max(0, depth - 1); b.marker = marker; b.task = n.task; b.taskOffset = n.taskOffset;
      const inline: md.Node[] = [];
      for (const c of n.children) {
        if (c.isText() || c.isSpan() || c.kind === md.P && inline.length === 0) inline.push(c);
        else for (const child of viewBlocks(c)) b.blocks.push(child);
      }
      b.inline = rich(inline); out.push(b);
      return;
    }
    const kind = n.kind === md.H ? B_HEADING : n.kind === md.CODE ? B_CODE : n.kind === md.QUOTE ? B_QUOTE : n.kind === md.HR ? B_RULE : n.kind === md.TABLE ? B_TABLE : B_PARA;
    const b = new Block(kind); b.level = n.level; b.inline = rich(n.children);
    if (kind === B_QUOTE) for (const c of n.children) for (const child of viewBlocks(c)) b.blocks.push(child);
    if (kind === B_CODE) { b.code = md.textOf(n); b.lang = n.lang; }
    if (kind === B_TABLE) {
      const rows = (v: md.Node): void => {
        if (v.kind === md.TR) { if (b.rows.length === 0) b.alignments = v.children.map((cell: md.Node) => cell.align); b.rows.push(v.children.map((cell: md.Node) => rich(cell.children))); return; }
        for (const c of v.children) rows(c);
      };
      rows(n);
    }
    out.push(b);
  };
  walk(root, 0, '');
  return out;
}
