// zinc:markdown: Markdown parsed by md4c (vendor/md4c, MIT) into a tree of blocks, spans and texts. The tree mirrors md4c's callbacks:
// a block (paragraph, heading, list, item, quote, code, table...) holds blocks or inline content; a span (emphasis, strong, link, image,
// code, strikethrough) holds inline content; a text is a leaf. Docs: docs/plugins/markdown.md.
import M from './native/markdown.spec';

import { Node, DOC, H, OL, LI, TH, TD, CODE, SPAN, T_BR, T_NORMAL, TEXT, GITHUB } from './model';
export * from './model';
export { viewBlocks } from './blocks';

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

/** `src` with the task list item whose mark is at `offset` (Node.taskOffset) set done or open: '[x]' or '[ ]' in the file. */
export function setTask(src: string, offset: i32, done: boolean): string { return M.setByte(src, offset, done ? 'x' : ' '); }

/** The version of md4c. */
export function version(): string { return M.version(); }
