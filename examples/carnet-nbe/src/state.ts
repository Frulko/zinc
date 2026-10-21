// The workspace as the view sees it: pages and their blocks as signals, read from Carnet's own model. Each page is an
// `Editor` of @nbe/core over a `LoroBlockStore` of @nbe/collab (one Loro document per page, as Carnet's desktop app does), and
// every action a component calls is a command of @nbe/core; this file only flattens the block tree into rows and keeps the
// rows' signals in step with the document after each local or remote change. No drawing and no I/O here.
import { createSignal, NodeRef } from 'zinc:ui/solid';
import {
  Editor, plainText, textCaret, splitBlock, mergeBackward, mergeForward, turnInto, indent, outdent, deleteBlocks,
  toggleChecked as toggleTodo, duplicateBlocks, moveBlocksVertical, moveBlocks, uuidv7, docToJSON,
} from '@nbe/core';
import { LoroBlockStore, seedFromJSON, redrawOnRemote } from '@nbe/collab';
import { T_TEXT, T_H1, T_H2, T_H3, T_BULLET, T_NUMBER, T_TODO, T_QUOTE, T_CALLOUT, T_CODE, T_DIVIDER, T_TOGGLE, T_OTHER, PAGE_ICONS } from './constants';

/** One row of the page: a block of the document at its depth in the tree. */
export class Block {
  id: string; page: string;
  type: () => string; setType: (v: string) => void;
  text: () => string; setText: (v: string) => void;
  checked: () => boolean; setChecked: (v: boolean) => void;
  indent: () => number; setIndent: (v: number) => void;
  ref: NodeRef = new NodeRef();   // its text field
  constructor(id: string, page: string) {
    this.id = id; this.page = page;
    [this.type, this.setType] = createSignal<string>(T_TEXT);
    [this.text, this.setText] = createSignal<string>('');
    [this.checked, this.setChecked] = createSignal<boolean>(false);
    [this.indent, this.setIndent] = createSignal<number>(0);
  }
}

export class Page {
  id: string;                      // the page block's id, also its room and its file name
  store: LoroBlockStore;
  editor: Editor;
  title: () => string; setTitle: (v: string) => void;
  icon: () => string; setIcon: (v: string) => void;
  blocks: () => Block[]; setBlocks: (v: Block[]) => void;
  ready: () => boolean; setReady: (v: boolean) => void;   // its page block has arrived (a page from another window comes a moment after its name)
  items: Block[] = [];             // the rows in order (blocks() is a copy of it)
  rows = new Map<string, Block>();
  titleRef: NodeRef = new NodeRef();
  constructor(id: string, store: LoroBlockStore) {
    this.id = id; this.store = store;
    this.editor = new Editor({ doc: { blocks: store, rootId: id } });
    [this.title, this.setTitle] = createSignal<string>('');
    [this.icon, this.setIcon] = createSignal<string>('file-text');
    [this.blocks, this.setBlocks] = createSignal<Block[]>([]);
    [this.ready, this.setReady] = createSignal<boolean>(false);
  }
}

/** Someone else editing: where their caret is. */
export class Peer {
  id: string; name: string; color: number;
  page = ''; block = ''; caret = -1; anchor = -1;
  constructor(id: string, name: string, color: number) { this.id = id; this.name = name; this.color = color; }
}

export const [pages, setPages] = createSignal<Page[]>([]);
export const [currentPage, setCurrentPage] = createSignal<Page | null>(null);
export const [peers, setPeers] = createSignal<Peer[]>([]);
/** The block whose field has the focus (null: none), for placeholders and presence. */
export const [focusedBlock, setFocusedBlock] = createSignal<Block | null>(null);

export class Me { id = 'local'; name = 'Me'; color = 0; }
export const me = new Me();

const pageById = new Map<string, Page>();
let changed: (p: Page) => void = () => {};
let opened: (p: Page) => void = () => {};
let removed: (p: Page) => void = () => {};
/** main.ts: what to do when a page changes (save it), appears (list it, connect it to the others) and goes. */
export function setOutputs(pageChanged: (p: Page) => void, pageOpened: (p: Page) => void, pageRemoved: (p: Page) => void): void {
  changed = pageChanged; opened = pageOpened; removed = pageRemoved;
}

// ---- Carnet's block types as the view's kinds, and back
function kindOf(type: string, props: Record<string, unknown>): string {
  switch (type) {
    case 'paragraph': return T_TEXT;
    case 'heading': return props['level'] === 2 ? T_H2 : props['level'] === 3 ? T_H3 : T_H1;
    case 'bulleted_list_item': return T_BULLET;
    case 'numbered_list_item': return T_NUMBER;
    case 'to_do': return T_TODO;
    case 'toggle': return T_TOGGLE;
    case 'quote': return T_QUOTE;
    case 'callout': return T_CALLOUT;
    case 'code': return T_CODE;
    case 'divider': return T_DIVIDER;
    default: return T_OTHER;
  }
}
/** The view's kind as Carnet's type and props. */
export function typeOf(kind: string): [string, Record<string, unknown> | undefined] {
  switch (kind) {
    case T_H1: return ['heading', { level: 1 }];
    case T_H2: return ['heading', { level: 2 }];
    case T_H3: return ['heading', { level: 3 }];
    case T_BULLET: return ['bulleted_list_item', undefined];
    case T_NUMBER: return ['numbered_list_item', undefined];
    case T_TODO: return ['to_do', undefined];
    case T_TOGGLE: return ['toggle', undefined];
    case T_QUOTE: return ['quote', undefined];
    case T_CALLOUT: return ['callout', undefined];
    case T_CODE: return ['code', undefined];
    case T_DIVIDER: return ['divider', undefined];
    default: return ['paragraph', undefined];
  }
}

// ---- the document to rows
/** Reads the page again: its title and icon, and its blocks depth first (a list item's children nest under it). */
export function rebuild(p: Page): void {
  const root = p.store.get(p.id);
  p.setReady(root !== undefined);
  if (root === undefined) { if (p.items.length > 0) { p.items = []; p.setBlocks([]); } return; }
  p.setTitle(String(root.props['title'] ?? ''));
  p.setIcon(String(root.props['icon'] ?? 'file-text'));
  const list: Block[] = [];
  const walk = (id: string, depth: number): void => {
    const b = p.store.get(id);
    if (b === undefined) return;
    for (const c of b.children) {
      const x = p.store.get(c);
      if (x === undefined) continue;
      let row = p.rows.get(c);
      if (row === undefined) { row = new Block(c, p.id); p.rows.set(c, row); }
      row.setType(kindOf(x.type, x.props));
      row.setText(plainText(x.text));
      row.setChecked(x.props['checked'] === true);
      row.setIndent(depth);
      list.push(row);
      walk(c, depth + 1);
    }
  };
  walk(p.id, 0);
  const same = list.length === p.items.length && list.every((b, i) => b === p.items[i]);
  p.items = list;
  if (!same) p.setBlocks(list.slice(0));
}

function watch(p: Page): void {
  p.editor.on(() => { rebuild(p); changed(p); });
  // loro-crdt (1.8+) tells of an import while it runs, before LoroBlockStore.import reindexes its blocks: the rows are read a microtask later,
  // where a web page would paint them (requestAnimationFrame)
  let queued = false;
  redrawOnRemote(p.store.doc, () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; rebuild(p); changed(p); });
  });
}

/** A page from a document (the vault's, or a new one): seeds its Loro document. Only the window that read the file does this;
 *  the others receive the document, since two seeds of one file would be two sets of blocks to Loro. */
export function addPage(json: any): Page {
  const store = new LoroBlockStore();
  seedFromJSON(store, json);
  return addStore(json.id, store);
}
/** A page known by its id only (another window has it): its document arrives from them. */
export function addRemotePage(id: string): Page {
  const known = pageById.get(id);
  return known !== undefined ? known : addStore(id, new LoroBlockStore());
}
function addStore(id: string, store: LoroBlockStore): Page {
  const p = new Page(id, store);
  pageById.set(id, p);
  watch(p);
  rebuild(p);
  setPages([...pageById.values()]);
  opened(p);
  return p;
}
export function pageWithId(id: string): Page | null { return pageById.get(id) ?? null; }
export function allPages(): Page[] { return [...pageById.values()]; }
export function pageOf(b: Block): Page | null { return pageById.get(b.page) ?? null; }
export function blockOf(id: string): Block | null {
  for (const p of pageById.values()) { const b = p.rows.get(id); if (b !== undefined) return b; }
  return null;
}
/** The page as Carnet's JSON (to write it as Markdown). */
export function pageJSON(p: Page): any { return docToJSON(p.editor.doc); }

export function createPage(): Page {
  const icon = PAGE_ICONS[pageById.size % PAGE_ICONS.length];
  return addPage({ id: uuidv7(), type: 'page', version: 1, props: { title: '', icon },
    children: [{ id: uuidv7(), type: 'paragraph', version: 1, props: {}, text: [] }] });
}
function setPageProps(p: Page, props: Record<string, unknown>): void {
  p.editor.dispatch((tx: any) => tx.op({ type: 'update_block', id: p.id, patch: { props } }), { origin: 'input' });
}
export function renamePage(p: Page, title: string): void { if (p.title() !== title) setPageProps(p, { title }); }
export function cyclePageIcon(p: Page): void { setPageProps(p, { icon: PAGE_ICONS[(PAGE_ICONS.indexOf(p.icon()) + 1) % PAGE_ICONS.length] }); }
export function deletePage(p: Page): void {
  if (!pageById.delete(p.id)) return;
  removed(p);
  setPages([...pageById.values()]);
  if (currentPage() === p) setCurrentPage(pageById.size > 0 ? [...pageById.values()][0] : null);
}

// ---- commands: the caret where the view has it, then Carnet's command, then the caret where the command left it
let follow: (b: Block, caret: number) => void = () => {};
/** focus.ts: how to put the caret in a block. */
export function setFollow(f: (b: Block, caret: number) => void): void { follow = f; }
function at(b: Block, anchor: number, head: number): Editor {
  const e = (pageOf(b) as Page).editor;
  e.setSelection({ kind: 'text', anchor: { blockId: b.id, offset: anchor }, head: { blockId: b.id, offset: head } }, 'keyboard');
  return e;
}
function followSelection(p: Page): void {
  const s = p.editor.selection;
  if (s === null || s.kind !== 'text') return;
  const b = p.rows.get(s.head.blockId);
  if (b !== undefined) follow(b, s.head.offset);
}
function run(b: Block, caret: number, command: (e: Editor) => boolean): boolean {
  const p = pageOf(b);
  if (p === null) return false;
  const done = command(at(b, caret, caret));
  if (done) followSelection(p);
  return done;
}

/** A field's new text: the difference with the block's, as Carnet's text operations (the marks of what is kept stay). */
export function editText(b: Block, v: string): void {
  const old = b.text();
  if (old === v) return;
  let s = 0;
  while (s < old.length && s < v.length && old.charCodeAt(s) === v.charCodeAt(s)) s++;
  let e = 0;
  while (e < old.length - s && e < v.length - s && old.charCodeAt(old.length - 1 - e) === v.charCodeAt(v.length - 1 - e)) e++;
  const p = pageOf(b) as Page;
  p.editor.dispatch((tx: any) => {
    if (old.length - e > s) tx.op({ type: 'delete_text', id: b.id, from: s, to: old.length - e });
    if (v.length - e > s) tx.op({ type: 'insert_text', id: b.id, offset: s, runs: [{ text: v.slice(s, v.length - e) }] });
  }, { origin: 'input', selection: textCaret(b.id, v.length - e) });
}
export function changeType(b: Block, kind: string): void {
  const [type, props] = typeOf(kind);
  turnInto((pageOf(b) as Page).editor, b.id, type, props);
}
export function toggleChecked(b: Block): void { toggleTodo((pageOf(b) as Page).editor, [b.id]); }
/** Enter at `caret`: Carnet's split (an empty list item leaves the list, a heading is followed by text...). */
export function split(b: Block, caret: number): boolean { return run(b, caret, splitBlock); }
/** Backspace at the start: Carnet's merge (text first, then into the block above), else out of the nesting. */
export function joinUp(b: Block): boolean { return run(b, 0, mergeBackward) || indentBy(b, -1); }
/** Delete at the end: the block below comes up. */
export function joinDown(b: Block): boolean { return run(b, b.text().length, mergeForward); }
export function indentBy(b: Block, d: number): boolean {
  const e = (pageOf(b) as Page).editor;
  return d > 0 ? indent(e, b.id) : outdent(e, b.id);
}
export function deleteBlock(b: Block): void { deleteBlocks((pageOf(b) as Page).editor, [b.id]); }
export function duplicateBlock(b: Block): Block | null {
  const p = pageOf(b) as Page, ids = duplicateBlocks(p.editor, [b.id]);
  return ids.length > 0 ? p.rows.get(ids[0]) ?? null : null;
}
export function moveUpDown(b: Block, up: boolean): void { moveBlocksVertical((pageOf(b) as Page).editor, [b.id], up ? 'up' : 'down'); }
/** A dragged block dropped on the top or bottom edge of another: it becomes that block's sibling. */
export function moveNear(b: Block, onto: Block, below: boolean): void {
  const p = pageOf(onto) as Page, target = p.store.get(onto.id);
  if (target === undefined || target.parentId === null) return;
  const siblings = p.store.get(target.parentId)?.children ?? [];
  const i = siblings.indexOf(onto.id);
  const after = below ? onto.id : (i > 0 ? siblings[i - 1] : null);
  if (after === b.id) return;
  moveBlocks(p.editor, [b.id], target.parentId, after);
}
/** A new block of `kind` after `after` (null: first of the page), at the same depth. */
export function insertBlockAfter(p: Page, after: Block | null, kind: string, text: string): Block {
  const [type, props] = typeOf(kind);
  const ref = after === null ? null : p.store.get(after.id);
  const parentId = ref ? (ref.parentId ?? p.id) : p.id;
  const siblings = p.store.get(parentId)?.children ?? [];
  const index = ref ? siblings.indexOf(ref.id) + 1 : 0;
  const id = uuidv7();
  p.editor.dispatch((tx: any) => tx.op({ type: 'insert_block', index, block: {
    id, type, version: 1, props: props ?? (type === 'to_do' ? { checked: false } : {}), text: text ? [{ text }] : [], children: [], parentId,
  } }), { origin: 'input', selection: textCaret(id, 0) });
  return p.rows.get(id) as Block;
}
export function undo(b: Block | null, p: Page, redo: boolean): void {
  if (redo ? p.editor.redo() : p.editor.undo()) followSelection(p);
}

/** The neighbour row of a block (d = -1 above, 1 below), skipping dividers when `editable`. */
export function neighbour(b: Block, d: number, editable: boolean): Block | null {
  const p = pageOf(b);
  if (p === null) return null;
  for (let i = p.items.indexOf(b) + d; i >= 0 && i < p.items.length; i += d) if (!editable || p.items[i].type() !== T_DIVIDER) return p.items[i];
  return null;
}
/** 1, 2, 3... along a run of numbered blocks at the same depth (deeper blocks do not break it). */
export function listNumber(b: Block): number {
  const p = pageOf(b);
  if (p === null) return 1;
  const list = p.blocks(), depth = b.indent();
  let n = 1;
  for (let i = list.indexOf(b) - 1; i >= 0; i--) {
    const x = list[i];
    if (x.indent() > depth) continue;
    if (x.indent() < depth || x.type() !== T_NUMBER) break;
    n++;
  }
  return n;
}

// ---- presence (services/sync.ts feeds it from @nbe/collab's createPresence)
export function setPeerList(list: Peer[]): void { setPeers(list); }
/** The people whose caret is in this block. */
export function peersOn(b: Block): Peer[] { return peers().filter((p: Peer) => p.block === b.id); }
