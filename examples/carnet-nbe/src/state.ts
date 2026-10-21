// The vault as the view sees it: its notes, their blocks and its folders as signals, read from Carnet's own model. A note is a
// Markdown file of the vault (its path); while open it is an `Editor` of @nbe/core over a `LoroBlockStore` of @nbe/collab (one Loro
// document per note), and every action a component calls is a command of @nbe/core. This file flattens the block tree into rows,
// keeps the rows' signals in step with the document after each local or remote change, and tells the services (the files, the
// shared list of notes, the index) what changed. No drawing and no I/O here.
import { createSignal, NodeRef } from 'zinc:ui/solid';
import {
  Editor, plainText, textCaret, splitBlock, mergeBackward, mergeForward, turnInto, indent, outdent, deleteBlocks,
  toggleChecked as toggleTodo, duplicateBlocks, moveBlocksVertical, moveBlocks, uuidv7, docToJSON, docFromJSON, documentOrder,
} from '@nbe/core';
import { LoroBlockStore, seedFromJSON, redrawOnRemote } from '@nbe/collab';
import { slugify } from '@nbe/markdown';
import { T_TEXT, T_H1, T_H2, T_H3, T_BULLET, T_NUMBER, T_TODO, T_QUOTE, T_CALLOUT, T_CODE, T_DIVIDER, T_TOGGLE, T_LINK, T_OTHER, PAGE_ICONS, UNTITLED } from './constants';

/** One row of the page: a block of the document at its depth in the tree. */
export class Block {
  id: string; page: string;
  type: () => string; setType: (v: string) => void;
  text: () => string; setText: (v: string) => void;
  checked: () => boolean; setChecked: (v: boolean) => void;
  indent: () => number; setIndent: (v: number) => void;
  links: () => Link[]; setLinks: (v: Link[]) => void;   // its [[wikilinks]] (mentions), or the note a link block points at
  ref: NodeRef = new NodeRef();   // its text field
  constructor(id: string, page: string) {
    this.id = id; this.page = page;
    [this.type, this.setType] = createSignal<string>(T_TEXT);
    [this.text, this.setText] = createSignal<string>('');
    [this.checked, this.setChecked] = createSignal<boolean>(false);
    [this.indent, this.setIndent] = createSignal<number>(0);
    [this.links, this.setLinks] = createSignal<Link[]>([]);
  }
}

/** A [[wikilink]] in a block's text: where it is (UTF-16 offsets) and the note it names, as written. */
export class Link {
  from: number; to: number; target: string;
  constructor(from: number, to: number, target: string) { this.from = from; this.to = to; this.target = target; }
}

export class Page {
  id: string;                      // the page block's id for this session, also its room
  store: LoroBlockStore;
  editor: Editor;
  path: () => string; setPath: (v: string) => void;      // in the vault: "Projects/Roadmap.md"
  title: () => string; setTitle: (v: string) => void;    // its `title` property, when the file name cannot hold it (see titleOf)
  icon: () => string; setIcon: (v: string) => void;      // its `icon` property: a Lucide name or an emoji, '' for none
  draft: string | null = null;     // the title being typed: the note is renamed when the field is left (commitTitle)
  blocks: () => Block[]; setBlocks: (v: Block[]) => void;
  ready: () => boolean; setReady: (v: boolean) => void;   // its page block has arrived (a page from another window comes a moment after its name)
  items: Block[] = [];             // the rows in order (blocks() is a copy of it)
  rows = new Map<string, Block>();
  titleRef: NodeRef = new NodeRef();
  constructor(id: string, store: LoroBlockStore) {
    this.id = id; this.store = store;
    this.editor = new Editor({ doc: { blocks: store, rootId: id } });
    [this.path, this.setPath] = createSignal<string>('');
    [this.title, this.setTitle] = createSignal<string>('');
    [this.icon, this.setIcon] = createSignal<string>('');
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
/** The vault's folders ("Projects", "Projects/2026"), sorted, empty ones included. */
export const [folders, setFolders] = createSignal<string[]>([]);
/** The folders folded in the file explorer. */
export const [collapsed, setCollapsed] = createSignal<string[]>([]);
/** The vault's name, as the window that serves it calls its folder. */
export const [vaultName, setVaultName] = createSignal<string>('');
export const [currentPage, setCurrentPage] = createSignal<Page | null>(null);
export const [peers, setPeers] = createSignal<Peer[]>([]);
/** The block whose field has the focus (null: none), for placeholders and presence. */
export const [focusedBlock, setFocusedBlock] = createSignal<Block | null>(null);

export class Me { id = 'local'; name = 'Me'; color = 0; }
export const me = new Me();

const pageById = new Map<string, Page>();
// ---- who hears what: the services (the files, the shared list of notes, the index) listen to the notes
const changedFns: Array<(p: Page) => void> = [], openedFns: Array<(p: Page) => void> = [], removedFns: Array<(p: Page) => void> = [];
const movedFns: Array<(p: Page, from: string) => void> = [];
/** A note's blocks or properties changed (here or in another window). */
export function onPageChanged(f: (p: Page) => void): void { changedFns.push(f); }
/** A note appeared (read from the vault, made here, or listed by another window). */
export function onPageOpened(f: (p: Page) => void): void { openedFns.push(f); }
/** A note went (deleted here or elsewhere). */
export function onPageRemoved(f: (p: Page) => void): void { removedFns.push(f); }
/** A note has another path (renamed or moved, here or elsewhere). */
export function onPageMoved(f: (p: Page, from: string) => void): void { movedFns.push(f); }
const folderFns: Array<(path: string) => void> = [];
/** A folder appeared (made here, read from the vault, or listed by another window). */
export function onFolderAdded(f: (path: string) => void): void { folderFns.push(f); }
const folderGoneFns: Array<(path: string) => void> = [];
/** A folder went (deleted outside, the vault closed, or another window said so). */
export function onFolderRemoved(f: (path: string) => void): void { folderGoneFns.push(f); }
function changed(p: Page): void { for (const f of changedFns) f(p); }

// ---- names and paths, as a vault has them
/** "Projects/Roadmap.md" -> "Roadmap". */
export function stemOf(path: string): string { const s = path.slice(path.lastIndexOf('/') + 1); return s.endsWith('.md') ? s.slice(0, -3) : s; }
/** "Projects/Roadmap.md" -> "Projects" ('' at the vault's root). */
export function folderOf(path: string): string { const i = path.lastIndexOf('/'); return i < 0 ? '' : path.slice(0, i); }
export function joinPath(folder: string, name: string): string { return folder === '' ? name : `${folder}/${name}`; }
/** What a note is called: its `title` property when it has one, its file name otherwise (Carnet's Obsidian plugin). */
export function titleOf(p: Page): string { return p.title() !== '' ? p.title() : stemOf(p.path()); }
/** A free path for `name` in `folder`: "Untitled.md", then "Untitled 1.md"... (`except` may keep its own). */
export function freePath(folder: string, name: string, except: Page | null): string {
  for (let i = 0; ; i++) {
    const path = joinPath(folder, `${i === 0 ? name : `${name} ${i}`}.md`), lower = path.toLowerCase();
    if (![...pageById.values()].some((p: Page) => p !== except && p.path().toLowerCase() === lower)) return path;
  }
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
    case 'link_to_page': return T_LINK;
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
/** The [[wikilinks]] of a block: its mention marks, or the note a link block names. */
function linksOf(x: any): Link[] {
  if (x.type === 'link_to_page') return [new Link(0, 0, String(x.props['target'] ?? x.props['title'] ?? ''))];
  const out: Link[] = [];
  let at = 0;
  for (const run of x.text ?? []) {
    for (const m of run.marks ?? []) if (m.type === 'mention' && m.attrs?.['target']) out.push(new Link(at, at + run.text.length, String(m.attrs['target'])));
    at += run.text.length;
  }
  return out;
}
const sameLinks = (a: Link[], b: Link[]): boolean => a.length === b.length && a.every((l, i) => l.from === b[i].from && l.to === b[i].to && l.target === b[i].target);

/** Reads the note again: its properties, and its blocks depth first (a list item's children nest under it). */
export function rebuild(p: Page): void {
  const root = p.store.get(p.id);
  p.setReady(root !== undefined);
  if (root === undefined) { if (p.items.length > 0) { p.items = []; p.setBlocks([]); } return; }
  p.setTitle(String(root.props['title'] ?? ''));
  p.setIcon(String(root.props['icon'] ?? ''));
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
      const links = linksOf(x);
      if (!sameLinks(links, row.links())) row.setLinks(links);
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

/** A note from a document (a file of the vault, or a new one) at `path`: seeds its Loro document. Only the window that read
 *  the file does this; the others receive the document, since two seeds of one file would be two sets of blocks to Loro. */
export function addPage(json: any, path: string): Page {
  const store = new LoroBlockStore();
  seedFromJSON(store, json);
  return addStore(json.id, store, path);
}
/** A note known by its id and path only (another window has it): its document arrives from them. */
export function addRemotePage(id: string, path: string): Page {
  const known = pageById.get(id);
  return known !== undefined ? known : addStore(id, new LoroBlockStore(), path);
}
function addStore(id: string, store: LoroBlockStore, path: string): Page {
  const p = new Page(id, store);
  p.setPath(path);
  pageById.set(id, p);
  watch(p);
  rebuild(p);
  listPages();
  for (const f of openedFns) f(p);
  return p;
}
/** The notes in the order of their paths (folders first at each level, as a file explorer lists them). */
function listPages(): void { setPages([...pageById.values()].sort((a: Page, b: Page) => a.path().localeCompare(b.path()))); }
/** Moves or renames a note (the vault renames its file). */
export function setPagePath(p: Page, path: string): void {
  const from = p.path();
  if (from === path) return;
  p.setPath(path);
  listPages();
  for (const f of movedFns) f(p, from);
}
/** Renames or moves a note here, as Obsidian does with "update internal links": the links of other notes that named it and
 *  would no longer find it are rewritten to its new name (path-qualified ones to its new path). */
export function movePage(p: Page, path: string): void {
  const from = p.path(), found: Array<[Page, Block, Link]> = [];
  for (const q of pages()) for (const b of q.blocks()) for (const l of b.links()) if (resolveLink(l.target, q) === p) found.push([q, b, l]);
  setPagePath(p, path);
  for (const [q, b, l] of found) {
    if (resolveLink(l.target, q) === p) continue;
    const target = l.target.includes('/') ? path.slice(0, -3) : stemOf(path);
    q.editor.dispatch((tx: any) => {
      if (b.type() === T_LINK) { tx.op({ type: 'update_block', id: b.id, patch: { props: { target, title: target } } }); return; }
      const shown = b.text().slice(l.from, l.to);
      tx.op({ type: 'delete_text', id: b.id, from: l.from, to: l.to });
      tx.op({ type: 'insert_text', id: b.id, offset: l.from, runs: [{ text: shown === l.target ? target : shown, marks: [{ type: 'mention', attrs: { target } }] }] });
    }, { origin: 'input' });
  }
  if (found.length > 0) console.log(`carnet: ${from} is ${path}: ${found.length} link(s) updated`);
}
/** A folder appears (made here, read from the vault, or listed by another window). */
export function addFolder(path: string): void {
  if (path === '' || folders().includes(path)) return;
  const parent = folderOf(path);
  if (parent !== '') addFolder(parent);
  setFolders([...folders(), path].sort());
  for (const f of folderFns) f(path);
}
export function removeFolder(path: string): void {
  const gone = folders().filter((f: string) => f === path || f.startsWith(path + '/'));
  if (gone.length === 0) return;
  setFolders(folders().filter((f: string) => !gone.includes(f)));
  for (const g of gone) for (const f of folderGoneFns) f(g);
}
export function pageWithId(id: string): Page | null { return pageById.get(id) ?? null; }
export function pageOf(b: Block): Page | null { return pageById.get(b.page) ?? null; }
export function blockOf(id: string): Block | null {
  for (const p of pageById.values()) { const b = p.rows.get(id); if (b !== undefined) return b; }
  return null;
}
/** A note by its path, or null. */
export function pageAt(path: string): Page | null {
  const lower = path.toLowerCase();
  for (const p of pageById.values()) if (p.path().toLowerCase() === lower) return p;
  return null;
}
/** The note a [[wikilink]] names, as Obsidian resolves it: a path ("Projects/Roadmap"), else a name, in the folder of the note
 *  that links first, then anywhere in the vault. Null when no note has that name. */
export function resolveLink(target: string, from: Page | null): Page | null {
  const t = target.split('#')[0].split('|')[0].trim().toLowerCase().replace(/\.md$/, '');
  if (t === '') return null;
  let any: Page | null = null;
  for (const p of pageById.values()) {
    const path = p.path().toLowerCase().slice(0, -3);
    if (path === t) return p;
    if (stemOf(p.path()).toLowerCase() !== t) continue;
    if (from !== null && folderOf(p.path()) === folderOf(from.path())) return p;
    if (any === null) any = p;
  }
  return any;
}
/** Follows a [[wikilink]] as Obsidian does: opens the note it names, or makes it (in the folder the link names, else at the root). */
export function openLink(target: string, from: Page | null): void {
  const known = resolveLink(target, from);
  if (known !== null) { setCurrentPage(known); return; }
  const t = target.split('#')[0].split('|')[0].trim().replace(/\.md$/, '');
  if (t !== '') setCurrentPage(createPage(folderOf(t), stemOf(t)));
}
/** The blocks of other notes that link to `p` (Obsidian's "Linked mentions"). */
export function backlinksOf(p: Page): Block[] {
  const out: Block[] = [];
  // ponytail: every link of every note, each time a note or a link changes; an index by target past a few thousand notes
  for (const q of pages()) {
    if (q === p) continue;
    for (const b of q.blocks()) if (b.links().some((l: Link) => resolveLink(l.target, q) === p)) out.push(b);
  }
  return out;
}
/** The note as Carnet's JSON (to write it as Markdown). */
export function pageJSON(p: Page): any { return docToJSON(p.editor.doc); }

/** A new note in `folder` (an empty title and one empty paragraph), named `name` or "Untitled". */
export function createPage(folder: string, name: string = UNTITLED): Page {
  return addPage({ id: uuidv7(), type: 'page', version: 1, props: {},
    children: [{ id: uuidv7(), type: 'paragraph', version: 1, props: {}, text: [] }] }, freePath(folder, slugify(name), null));
}
function setPageProps(p: Page, props: Record<string, unknown>): void {
  p.editor.dispatch((tx: any) => tx.op({ type: 'update_block', id: p.id, patch: { props } }), { origin: 'input' });
}
/** A new title, as the Obsidian plugin commits one: the file takes the name a file system accepts (`slugify`) and the `title`
 *  property keeps the title only when the two differ ("Réunion : 2026/07" is "Réunion 2026 07.md"). */
export function renamePage(p: Page, title: string): void {
  const t = title.replaceAll('\n', ' ').trim(), name = t === '' ? UNTITLED : slugify(t);
  const keep = t !== '' && t !== name ? t : '';
  if (keep !== p.title()) setPageProps(p, { title: keep === '' ? undefined : keep });
  if (name !== stemOf(p.path())) movePage(p, freePath(folderOf(p.path()), name, p));
}
/** The typed title, if any, becomes the note's (the field was left or Enter pressed). */
export function commitTitle(p: Page): void { const d = p.draft; p.draft = null; if (d !== null) renamePage(p, d); }
export function cyclePageIcon(p: Page): void { setPageProps(p, { icon: PAGE_ICONS[(PAGE_ICONS.indexOf(p.icon()) + 1) % PAGE_ICONS.length] }); }
export function deletePage(p: Page): void {
  if (!pageById.delete(p.id)) return;
  for (const f of removedFns) f(p);
  listPages();
  if (currentPage() === p) setCurrentPage(pageById.size > 0 ? pages()[0] : null);
}
/** The note's blocks replaced by those of `json` (the file was changed by another program): one transaction, so the others
 *  see the same and undo puts the note back. */
export function replaceBlocks(p: Page, json: any): void {
  const blocks = p.editor.doc.blocks, root = blocks.get(p.id);
  if (root === undefined) return;
  const fresh = docFromJSON(json);
  const order = documentOrder(fresh).slice(1);
  p.editor.dispatch((tx: any) => {
    const gone = (id: string): void => { const b = blocks.get(id); if (b === undefined) return; for (const c of [...b.children]) gone(c); tx.op({ type: 'delete_block', id }); };
    for (const c of [...root.children]) gone(c);
    let i = 0;
    for (const id of order) {
      const b = fresh.blocks.get(id);
      const top = b.parentId === fresh.rootId;
      tx.op({ type: 'insert_block', index: top ? i++ : 0, block: { ...b, parentId: top ? p.id : b.parentId } });
    }
    tx.op({ type: 'update_block', id: p.id, patch: { props: { title: json.props?.['title'], icon: json.props?.['icon'] } } });
  }, { origin: 'file' });
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
/** Every "[[Name]]" typed or pasted in the block (not yet a link): the brackets go and the name is a link (a mention, written
 *  back as [[Name]]; "[[Name|shown]]" shows its second half). Returns where the caret goes, or -1 when there was none. */
export function makeLinks(b: Block, caret: number): number {
  const v = b.text(), found: number[][] = [], re = /\[\[([^\[\]\n]+)\]\]/g;
  for (let m = re.exec(v); m !== null; m = re.exec(v)) {
    const from = m.index, to = from + m[0].length;
    if (m[1].trim() !== '' && !b.links().some((l: Link) => l.from < to && from < l.to)) found.push([from, to]);
  }
  if (found.length === 0) return -1;
  let at = caret;
  (pageOf(b) as Page).editor.dispatch((tx: any) => {
    for (let i = found.length - 1; i >= 0; i--) {   // from the end: the offsets before stay right
      const [from, to] = found[i], raw = v.slice(from + 2, to - 2), pipe = raw.indexOf('|');
      const target = pipe < 0 ? raw : raw.slice(0, pipe), shown = pipe < 0 ? raw : raw.slice(pipe + 1);
      tx.op({ type: 'delete_text', id: b.id, from, to });
      tx.op({ type: 'insert_text', id: b.id, offset: from, runs: [{ text: shown, marks: [{ type: 'mention', attrs: { target } }] }] });
      if (caret >= to) at -= to - from - shown.length; else if (caret > from) at = from + shown.length;
    }
  }, { origin: 'input' });
  return at;
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
