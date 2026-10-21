// The workspace: pages, their blocks, the people editing them, and every action a component calls. Each change of a block
// or a page is stamped and handed to the sender (the collaboration) and marks its page for saving; a record from another
// person is applied when its stamp is larger. No drawing and no I/O here: main.ts plugs the sender in.
import { createSignal, NodeRef } from 'zinc:ui/solid';
import { Wire, W_BLOCK, W_PAGE, W_HELLO } from './wire';
import { T_TEXT, T_NUMBER, T_DIVIDER, MAX_INDENT, PAGE_ICONS } from './constants';

export class Block {
  id: string; page: string;
  pos: number; deleted: boolean = false;
  clock: i32 = 0; peer: string = '';
  type: () => string; setType: (v: string) => void;
  text: () => string; setText: (v: string) => void;
  checked: () => boolean; setChecked: (v: boolean) => void;
  indent: () => i32; setIndent: (v: i32) => void;
  ref: NodeRef = new NodeRef();   // its text field
  constructor(id: string, page: string, pos: number, type: string, text: string, checked: boolean, indent: i32) {
    this.id = id; this.page = page; this.pos = pos;
    const [a, sa] = createSignal<string>(type); this.type = a; this.setType = sa;
    const [b, sb] = createSignal<string>(text); this.text = b; this.setText = sb;
    const [c, sc] = createSignal<boolean>(checked); this.checked = c; this.setChecked = sc;
    const [d, sd] = createSignal<i32>(indent); this.indent = d; this.setIndent = sd;
  }
}

export class Page {
  id: string;
  pos: number; deleted: boolean = false;
  clock: i32 = 0; peer: string = '';
  title: () => string; setTitle: (v: string) => void;
  icon: () => string; setIcon: (v: string) => void;
  blocks: () => Block[]; setBlocks: (v: Block[]) => void;
  items: Block[] = [];             // the live blocks, in order (blocks() is a copy of it)
  titleRef: NodeRef = new NodeRef();
  constructor(id: string, pos: number, title: string, icon: string) {
    this.id = id; this.pos = pos;
    const [a, sa] = createSignal<string>(title); this.title = a; this.setTitle = sa;
    const [b, sb] = createSignal<string>(icon); this.icon = b; this.setIcon = sb;
    const [c, sc] = createSignal<Block[]>([]); this.blocks = c; this.setBlocks = sc;
  }
}

/** Someone else editing: where their caret is. */
export class Peer {
  id: string; name: string; color: i32;
  page: string = ''; block: string = ''; caret: i32 = -1; anchor: i32 = -1;
  link: i32 = -1;                  // the connection that brought them (services/sync.ts)
  constructor(id: string, name: string, color: i32) { this.id = id; this.name = name; this.color = color; }
}

export const [pages, setPages] = createSignal<Page[]>([]);
export const [currentPage, setCurrentPage] = createSignal<Page | null>(null);
export const [peers, setPeers] = createSignal<Peer[]>([]);
/** The block whose field has the focus (null: none), for placeholders and presence. */
export const [focusedBlock, setFocusedBlock] = createSignal<Block | null>(null);

const blockById = new Map<string, Block>();
const pageById = new Map<string, Page>();
const pageList: Page[] = [];       // live pages in order
let lamport: i32 = 0;
let seq: i32 = 0;

// ---- who I am, and where changes go (plugged in by main.ts)
export class Me { id: string = 'local'; name: string = 'Me'; color: i32 = 0; }
export const me = new Me();
let send: (w: Wire) => void = (w: Wire) => {};
let changed: (p: Page) => void = (p: Page) => {};
export function setOutputs(sender: (w: Wire) => void, pageChanged: (p: Page) => void): void { send = sender; changed = pageChanged; }

// ---- ordering: by pos, then id (two people inserting at the same place get the same pos)
function before(a: string, b: string): boolean { return a < b; }
function sortBlocks(list: Block[]): void { list.sort((a: Block, b: Block) => a.pos !== b.pos ? a.pos - b.pos : before(a.id, b.id) ? -1 : 1); }
function sortPages(list: Page[]): void { list.sort((a: Page, b: Page) => a.pos !== b.pos ? a.pos - b.pos : before(a.id, b.id) ? -1 : 1); }
function refreshPage(p: Page): void { sortBlocks(p.items); p.setBlocks(p.items.slice(0)); }
function refreshPages(): void { sortPages(pageList); setPages(pageList.slice(0)); }
// ponytail: float positions halve the gap at each insert at one spot (~50 in a row before they collide); renumber the page then
function between(a: number, b: number): number { return (a + b) / 2; }

export function newId(prefix: string): string { seq++; return `${prefix}${me.id}-${seq}`; }

// ---- records out
function blockWire(b: Block): Wire {
  const w = new Wire();
  w.k = W_BLOCK; w.id = b.id; w.page = b.page; w.type = b.type(); w.text = b.text(); w.checked = b.checked(); w.indent = b.indent();
  w.pos = b.pos; w.del = b.deleted; w.c = b.clock; w.p = b.peer;
  return w;
}
function pageWire(p: Page): Wire {
  const w = new Wire();
  w.k = W_PAGE; w.id = p.id; w.title = p.title(); w.icon = p.icon(); w.pos = p.pos; w.del = p.deleted; w.c = p.clock; w.p = p.peer;
  return w;
}
function publishBlock(b: Block): void {
  lamport++; b.clock = lamport; b.peer = me.id;
  send(blockWire(b));
  const p = pageById.get(b.page);
  if (p !== undefined) changed(p);
}
function publishPage(p: Page): void {
  lamport++; p.clock = lamport; p.peer = me.id;
  send(pageWire(p));
  changed(p);
}
/** Every record, tombstones included: what a person who joins receives. */
export function snapshot(): Wire[] {
  const out: Wire[] = [];
  pageById.forEach((p: Page, id: string) => { out.push(pageWire(p)); });
  blockById.forEach((b: Block, id: string) => { out.push(blockWire(b)); });
  return out;
}
export function presenceWire(p: Peer): Wire {
  const w = new Wire();
  w.k = W_HELLO; w.id = p.id; w.name = p.name; w.color = p.color; w.page = p.page; w.block = p.block; w.caret = p.caret; w.anchor = p.anchor;
  return w;
}

// ---- pages
export function pageOf(b: Block): Page | null { const p = pageById.get(b.page); return p === undefined ? null : p; }
export function blockOf(id: string): Block | null { const b = blockById.get(id); return b === undefined ? null : b; }
export function pageWithId(id: string): Page | null { const p = pageById.get(id); return p === undefined ? null : p; }

/** A page read from the vault: stamp 0, so any edit made since by anyone wins over it. */
export function addLoadedPage(id: string, pos: number, title: string, icon: string): Page {
  const p = new Page(id, pos, title, icon);
  pageById.set(id, p); pageList.push(p);
  refreshPages();
  return p;
}
export function addLoadedBlock(p: Page, id: string, type: string, text: string, checked: boolean, indent: i32): Block {
  const b = new Block(id, p.id, p.items.length, type, text, checked, indent);
  blockById.set(id, b); p.items.push(b);
  refreshPage(p);
  return b;
}

export function createPage(): Page {
  const last = pageList.length > 0 ? pageList[pageList.length - 1].pos : 0;
  const p = new Page(newId('page-'), last + 1, '', PAGE_ICONS[pageList.length % PAGE_ICONS.length]);
  pageById.set(p.id, p); pageList.push(p);
  refreshPages();
  publishPage(p);
  insertBlockAfter(p, null, T_TEXT, '', 0);
  return p;
}
export function renamePage(p: Page, title: string): void { if (p.title() === title) return; p.setTitle(title); publishPage(p); }
export function cyclePageIcon(p: Page): void {
  const i = PAGE_ICONS.indexOf(p.icon());
  p.setIcon(PAGE_ICONS[(i + 1) % PAGE_ICONS.length]);
  publishPage(p);
}
export function deletePage(p: Page): void {
  p.deleted = true;
  pageList.splice(pageList.indexOf(p), 1);
  refreshPages();
  publishPage(p);
  if (currentPage() === p) setCurrentPage(pageList.length > 0 ? pageList[0] : null);
}

// ---- blocks
/** A new block after `after` (null: first of the page). */
export function insertBlockAfter(p: Page, after: Block | null, type: string, text: string, indent: i32): Block {
  const i = after === null ? -1 : p.items.indexOf(after);
  const lo = i >= 0 ? p.items[i].pos : (p.items.length > 0 ? p.items[0].pos - 2 : 0);
  const hi = i + 1 < p.items.length ? p.items[i + 1].pos : lo + 2;
  const b = new Block(newId('b-'), p.id, between(lo, hi), type, text, false, indent);
  blockById.set(b.id, b); p.items.push(b);
  refreshPage(p);
  publishBlock(b);
  return b;
}
export function editText(b: Block, text: string): void { if (b.text() === text) return; b.setText(text); publishBlock(b); }
export function changeType(b: Block, type: string): void { b.setType(type); publishBlock(b); }
export function toggleChecked(b: Block): void { b.setChecked(!b.checked()); publishBlock(b); }
export function indentBy(b: Block, d: i32): boolean {
  const v = Math.max(0, Math.min(MAX_INDENT, b.indent() + d));
  if (v === b.indent()) return false;
  b.setIndent(v); publishBlock(b);
  return true;
}
export function deleteBlock(b: Block): void {
  const p = pageOf(b);
  b.deleted = true;
  if (p !== null) { p.items.splice(p.items.indexOf(b), 1); refreshPage(p); }
  publishBlock(b);
}
/** Moves a block to index `to` of its page's list (the index among the other blocks). */
export function moveBlock(b: Block, to: i32): void {
  const p = pageOf(b);
  if (p === null) return;
  const rest = p.items.filter((x: Block) => x !== b);
  const k = Math.max(0, Math.min(rest.length, to));
  const lo = k > 0 ? rest[k - 1].pos : (rest.length > 0 ? rest[0].pos - 2 : 0);
  const hi = k < rest.length ? rest[k].pos : lo + 2;
  b.pos = between(lo, hi);
  refreshPage(p);
  publishBlock(b);
}
export function duplicateBlock(b: Block): Block {
  const p = pageOf(b) as Page;
  const c = insertBlockAfter(p, b, b.type(), b.text(), b.indent());
  if (b.checked()) toggleChecked(c);
  return c;
}
/** The neighbour of a block in its page (d = -1 above, 1 below), skipping dividers when `editable`. */
export function neighbour(b: Block, d: i32, editable: boolean): Block | null {
  const p = pageOf(b);
  if (p === null) return null;
  for (let i = p.items.indexOf(b) + d; i >= 0 && i < p.items.length; i += d) if (!editable || p.items[i].type() !== T_DIVIDER) return p.items[i];
  return null;
}
/** 1, 2, 3... along a run of numbered blocks at the same indentation (deeper blocks do not break it). */
export function listNumber(b: Block): i32 {
  const p = pageOf(b);
  if (p === null) return 1;
  const list = p.blocks(), ind = b.indent();
  let n: i32 = 1;
  for (let i = list.indexOf(b) - 1; i >= 0; i--) {
    const x = list[i];
    if (x.indent() > ind) continue;
    if (x.indent() < ind || x.type() !== T_NUMBER) break;
    n++;
  }
  return n;
}

// ---- records in
/** Applies a block or page record from someone else; false when ours was newer. */
export function applyRecord(w: Wire): boolean {
  if (w.c > lamport) lamport = w.c;
  if (w.k === W_PAGE) {
    let p = pageWithId(w.id);
    if (p !== null && !(w.c > p.clock || (w.c === p.clock && w.p > p.peer))) return false;
    if (p === null) { p = new Page(w.id, w.pos, w.title, w.icon); pageById.set(w.id, p); if (!w.del) pageList.push(p); }
    else {
      p.setTitle(w.title); p.setIcon(w.icon); p.pos = w.pos;
      if (w.del && !p.deleted) pageList.splice(pageList.indexOf(p), 1);
    }
    p.deleted = w.del; p.clock = w.c; p.peer = w.p;
    refreshPages();
    if (p.deleted && currentPage() === p) setCurrentPage(pageList.length > 0 ? pageList[0] : null);
    if (currentPage() === null && !p.deleted) setCurrentPage(p);
    changed(p);
    return true;
  }
  if (w.k !== W_BLOCK) return false;
  let page = pageWithId(w.page);
  if (page === null) { page = new Page(w.page, 1e9, '', 'file-text'); pageById.set(w.page, page); page.deleted = true; }   // its page record comes later
  let b = blockOf(w.id);
  if (b !== null && !(w.c > b.clock || (w.c === b.clock && w.p > b.peer))) return false;
  if (b === null) {
    b = new Block(w.id, w.page, w.pos, w.type, w.text, w.checked, w.indent);
    blockById.set(w.id, b);
    if (!w.del) page.items.push(b);
  } else {
    b.setType(w.type); b.setText(w.text); b.setChecked(w.checked); b.setIndent(w.indent); b.pos = w.pos;
    if (w.del && !b.deleted) page.items.splice(page.items.indexOf(b), 1);
  }
  b.deleted = w.del; b.clock = w.c; b.peer = w.p;
  refreshPage(page);
  changed(page);
  return true;
}

// ---- presence
function publishPeers(list: Peer[]): void { setPeers(list.slice(0)); }
const peerList: Peer[] = [];
export function applyPresence(w: Wire, link: i32): void {
  if (w.id === me.id) return;
  let p: Peer | null = null;
  for (const x of peerList) if (x.id === w.id) p = x;
  if (p === null) { p = new Peer(w.id, w.name, w.color); peerList.push(p); }
  p.name = w.name; p.color = w.color; p.page = w.page; p.block = w.block; p.caret = w.caret; p.anchor = w.anchor;
  if (link >= 0) p.link = link;
  publishPeers(peerList);
}
/** The people known now (the host hands them to a person who joins). */
export function knownPeers(): Peer[] { return peerList; }
/** Removes the people for whom `match` is true (they left, or their connection dropped); returns their ids. */
export function dropPeers(match: (p: Peer) => boolean): string[] {
  const gone: string[] = [];
  for (let i = peerList.length - 1; i >= 0; i--) if (match(peerList[i])) { gone.push(peerList[i].id); peerList.splice(i, 1); }
  if (gone.length > 0) publishPeers(peerList);
  return gone;
}
/** The people whose caret is in this block. */
export function peersOn(b: Block): Peer[] { return peers().filter((p: Peer) => p.block === b.id); }
