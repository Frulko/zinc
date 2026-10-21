// A page as a Markdown file, the way Carnet keeps them: delete the app and the folder still reads in any text editor or in
// Obsidian. Front matter for the icon and the order, the title as the first `# ` line, one block per paragraph (blocks are
// separated by a blank line), nesting as two spaces per level. Lost on the way: empty paragraphs and the record stamps.
import { T_TEXT, T_H1, T_H2, T_H3, T_BULLET, T_NUMBER, T_TODO, T_QUOTE, T_CALLOUT, T_CODE, T_DIVIDER, MAX_INDENT } from './constants';

export class MdBlock {
  type: string; text: string; checked: boolean; indent: i32;
  constructor(type: string, text: string, checked: boolean, indent: i32) { this.type = type; this.text = text; this.checked = checked; this.indent = indent; }
}
export class MdPage { title: string = ''; icon: string = ''; order: number = 0; blocks: MdBlock[] = []; }

const CALLOUT_MARK = '[!NOTE] ';

function prefixed(lines: string[], first: string, rest: string): string {
  let out = '';
  for (let i = 0; i < lines.length; i++) out += (i > 0 ? '\n' : '') + (i === 0 ? first : rest) + lines[i];
  return out;
}

export function toMarkdown(p: MdPage): string {
  let out = `---\nicon: ${p.icon}\norder: ${p.order}\n---\n# ${p.title}\n`;
  let inList = false;
  for (const b of p.blocks) {
    const pad = '  '.repeat(b.indent), lines = b.text.split('\n');
    let s = '';
    if (b.type === T_DIVIDER) s = '---';
    else if (b.type === T_CODE) s = '```\n' + b.text + '\n```';
    else if (b.text.trim() === '') continue;
    else if (b.type === T_H1) s = '# ' + b.text;
    else if (b.type === T_H2) s = '## ' + b.text;
    else if (b.type === T_H3) s = '### ' + b.text;
    else if (b.type === T_BULLET) s = prefixed(lines, pad + '- ', pad + '  ');
    else if (b.type === T_NUMBER) s = prefixed(lines, pad + '1. ', pad + '   ');
    else if (b.type === T_TODO) s = prefixed(lines, pad + (b.checked ? '- [x] ' : '- [ ] '), pad + '      ');
    else if (b.type === T_QUOTE) s = prefixed(lines, '> ', '> ');
    else if (b.type === T_CALLOUT) s = prefixed(lines, '> ' + CALLOUT_MARK, '> ');
    else s = prefixed(lines, pad, pad);
    const item = b.type === T_BULLET || b.type === T_NUMBER || b.type === T_TODO;
    out += (item && inList ? '' : '\n') + s + '\n';   // list items stay a tight list
    inList = item;
  }
  return out;
}

function leadingSpaces(s: string): i32 { let i: i32 = 0; while (i < s.length && s.charCodeAt(i) === 32) i++; return i; }
function stripEach(lines: string[], from: i32, n: i32): string {
  let out = '';
  for (let i = from; i < lines.length; i++) {
    const l = lines[i];
    out += (i > from ? '\n' : '') + (l.startsWith('> ') ? l.slice(2) : l.slice(Math.min(n, leadingSpaces(l))));
  }
  return out;
}

/** A line that opens a block of its own in a tight list ("- a\n- b"); other lines continue the block above. */
function startsBlock(l: string): boolean {
  const t = l.slice(leadingSpaces(l)), dot = t.indexOf('. ');
  return t.startsWith('- ') || t.startsWith('* ') || t.startsWith('# ') || t.startsWith('## ') || t.startsWith('### ') || (dot > 0 && dot < 4 && !isNaN(parseInt(t.slice(0, dot))));
}
/** One block from a run of lines with no blank line in it. */
function parseChunk(lines: string[]): MdBlock {
  const first = lines[0], sp = leadingSpaces(first), t = first.slice(sp);
  const indent: i32 = Math.min(MAX_INDENT, Math.floor(sp / 2));
  const more = lines.length > 1 ? '\n' + stripEach(lines, 1, sp + 6) : '';
  if (t === '---' || t === '***') return new MdBlock(T_DIVIDER, '', false, 0);
  if (t.startsWith('### ')) return new MdBlock(T_H3, t.slice(4) + more, false, 0);
  if (t.startsWith('## ')) return new MdBlock(T_H2, t.slice(3) + more, false, 0);
  if (t.startsWith('# ')) return new MdBlock(T_H1, t.slice(2) + more, false, 0);
  if (t.startsWith('- [ ] ') || t.startsWith('- [x] ') || t.startsWith('- [X] ')) return new MdBlock(T_TODO, t.slice(6) + more, t.charAt(3) !== ' ', indent);
  if (t.startsWith('- ') || t.startsWith('* ')) return new MdBlock(T_BULLET, t.slice(2) + more, false, indent);
  const dot = t.indexOf('. ');
  if (dot > 0 && dot < 4 && !isNaN(parseInt(t.slice(0, dot)))) return new MdBlock(T_NUMBER, t.slice(dot + 2) + more, false, indent);
  if (t.startsWith('> ' + CALLOUT_MARK)) return new MdBlock(T_CALLOUT, t.slice(2 + CALLOUT_MARK.length) + more, false, 0);
  if (t.startsWith('> ')) return new MdBlock(T_QUOTE, t.slice(2) + more, false, 0);
  return new MdBlock(T_TEXT, t + (lines.length > 1 ? '\n' + stripEach(lines, 1, sp) : ''), false, indent);
}

export function fromMarkdown(text: string): MdPage {
  const page = new MdPage();
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  let i: i32 = 0;
  if (lines.length > 0 && lines[0] === '---') {   // front matter
    for (i = 1; i < lines.length && lines[i] !== '---'; i++) {
      const l = lines[i], c = l.indexOf(':');
      if (c < 0) continue;
      const key = l.slice(0, c).trim(), v = l.slice(c + 1).trim();
      if (key === 'icon') page.icon = v; else if (key === 'order') page.order = parseFloat(v);
    }
    i++;
  }
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i < lines.length && lines[i].startsWith('# ')) { page.title = lines[i].slice(2).trim(); i++; }
  let chunk: string[] = [];
  const flush = () => { if (chunk.length > 0) page.blocks.push(parseChunk(chunk)); chunk = []; };
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim().startsWith('```')) {   // a code block keeps its blank lines
      flush();
      let code = '';
      let j = i + 1;
      for (; j < lines.length && !lines[j].trim().startsWith('```'); j++) code += (j > i + 1 ? '\n' : '') + lines[j];
      page.blocks.push(new MdBlock(T_CODE, code, false, 0));
      i = j;
    } else if (l.trim() === '') flush();
    else { if (startsBlock(l)) flush(); chunk.push(l); }
  }
  flush();
  return page;
}
