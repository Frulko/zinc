// The slash menu: typing "/" at the start of a block or after a space lists the block types; the text typed after the slash
// filters them, ↑↓ choose, Enter or Tab picks, Escape or a space with no match closes. Picking turns an empty block into the
// type, or adds a block of that type below.
import { createSignal, createMemo, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { turnInto, applyDividerAutoformat } from '@nbe/core';
import { turnIntoTargets } from '@nbe/dom/src/block-types';
import { Block, editText, insertBlockAfter, pageOf, Page, typeOf } from '../state';
import { T_DIVIDER, T_CALLOUT, T_CODE, T_TEXT, MENU_WIDTH, MENU_ROW_HEIGHT, COLOR_TEXT } from '../constants';
import { labels } from '../labels';
import { focusBlock } from './focus';

/** One entry: Carnet's turn-into targets (@nbe/dom's block-types), then the blocks it inserts rather than turns into. */
class Entry { label: string; icon: string; type: string; props: Record<string, unknown> | undefined; kind: string;
  constructor(label: string, icon: string, type: string, props: Record<string, unknown> | undefined, kind: string) {
    this.label = label; this.icon = icon; this.type = type; this.props = props; this.kind = kind;
  }
}
// Carnet's icon names (text glyphs for some) as Lucide's
const ICONS: Record<string, string> = { H1: 'heading-1', H2: 'heading-2', H3: 'heading-3', '•': 'list', '1.': 'list-ordered' };
let entries: Entry[] = [];
function allEntries(p: Page): Entry[] {
  if (entries.length > 0) return entries;
  for (const t of turnIntoTargets({ labels, plugins: p.editor.plugins })) entries.push(new Entry(t.label, ICONS[t.icon] ?? t.icon, t.type, t.props, ''));
  entries.push(new Entry(labels.placeholders.callout, 'lightbulb', 'callout', undefined, T_CALLOUT));
  entries.push(new Entry(labels.divider, 'minus', 'divider', undefined, T_DIVIDER));
  return entries;
}

const MENU_MAX_ROWS: i32 = 7;
let menuBlock: Block | null = null;
let slashAt: i32 = -1;
const [open, setOpen] = createSignal<boolean>(false);
const [query, setQuery] = createSignal<string>('');
const [cursor, setCursor] = createSignal<i32>(0);
const [anchor, setAnchor] = createSignal<number[]>([0, 0]);

export function menuOpen(): boolean { return open(); }

const [shownFor, setShownFor] = createSignal<Page | null>(null);
const items = createMemo<Entry[]>(() => {
  const p = shownFor();
  if (p === null) return [];
  const q = query().toLowerCase(), all = allEntries(p as Page);
  return q === '' ? all : all.filter((k: Entry) => k.label.toLowerCase().indexOf(q) >= 0 || k.type.indexOf(q) >= 0);
}, []);

/** Opens under the block, or above it when there is no room below (`root` is the node the menu is laid out in). */
export function openMenu(b: Block, at: i32, root: i32): void {
  menuBlock = b; slashAt = at; setShownFor(pageOf(b));
  const box = ui.screenBox(b.ref.node), local = ui.toLocal(root, box[0], box[1] + box[3]), top = ui.toLocal(root, box[0], box[1]);
  const rootBox = ui.screenBox(root), rootH = ui.toLocal(root, rootBox[0], rootBox[1] + rootBox[3])[1];
  const h = MENU_MAX_ROWS * MENU_ROW_HEIGHT + 40;
  setAnchor([local[0], local[1] + h + 8 > rootH ? top[1] - h - 4 : local[1] + 4]);
  setQuery(''); setCursor(0); setOpen(true);
  if (listRef.node >= 0) ui.scrollTo(listRef.node, 0, 0);
}
let pendingBlock: Block | null = null;
/** Opens the menu on a block made this frame, once it is laid out (the + of a block's handle). */
export function openMenuWhenShown(b: Block): void { pendingBlock = b; }
/** Called once per frame. */
export function stepMenu(root: i32): void {
  const b = pendingBlock;
  if (b === null || (b as Block).ref.node < 0) return;
  pendingBlock = null;
  openMenu(b as Block, 0, root);
}
export function closeMenu(): void { if (open()) setOpen(false); menuBlock = null; }

/** After each edit of the block that opened the menu: the query, or closing it. */
export function followMenu(b: Block, text: string, caret: i32): void {
  if (!open() || b !== menuBlock) return;
  if (caret <= slashAt || text.charAt(slashAt) !== '/') { closeMenu(); return; }
  const q = text.slice(slashAt + 1, caret);
  if (q.endsWith(' ') && items().length === 0) { closeMenu(); return; }
  setQuery(q); setCursor(0);
}

/** Picking: the "/query" goes; an empty block turns into the type (Carnet's turnInto), else a block of the type goes below. */
function pick(k: Entry): void {
  const b = menuBlock;
  closeMenu();
  if (b === null) return;
  const block = b as Block, h = block.ref.node, caret = h >= 0 ? ui.caretOf(h) : block.text().length;
  const text = block.text(), rest = text.slice(0, slashAt) + text.slice(caret);
  editText(block, rest);
  if (h >= 0) ui.setValue(h, rest);
  const p = pageOf(block) as Page;
  if (k.type === 'divider') {
    if (rest === '') applyDividerAutoformat(p.editor, block.id);
    else { const d = insertBlockAfter(p, block, T_DIVIDER, ''); focusBlock(insertBlockAfter(p, d, T_TEXT, ''), 0); }
  } else if (rest.trim() === '') { turnInto(p.editor, block.id, k.type, k.props); focusBlock(block, 0); }
  else {
    const c = insertBlockAfter(p, block, T_TEXT, '');
    turnInto(p.editor, c.id, k.type, k.props);
    focusBlock(c, 0);
  }
}

const listRef = createNodeRef();
function moveCursor(i: i32): void {
  setCursor(i);
  const sc = listRef.node;
  if (sc < 0) return;
  const top = ui.scrollTop(sc), y = i * MENU_ROW_HEIGHT, h = MENU_MAX_ROWS * MENU_ROW_HEIGHT;
  if (y < top) ui.scrollTo(sc, 0, y);
  else if (y + MENU_ROW_HEIGHT > top + h) ui.scrollTo(sc, 0, y + MENU_ROW_HEIGHT - h);
}

/** Keys while the menu is open (the block's field passes them here first); true when used. */
export function menuKey(e: ui.KeyEvent): boolean {
  if (!open()) return false;
  const n = items().length;
  if (e.key === 'ArrowDown' && n > 0) moveCursor((cursor() + 1) % n);
  else if (e.key === 'ArrowUp' && n > 0) moveCursor((cursor() + n - 1) % n);
  else if ((e.key === 'Enter' || e.key === 'Tab') && n > 0) pick(items()[Math.min(cursor(), n - 1)]);
  else if (e.key === 'Escape') closeMenu();
  else return false;
  return true;
}

function Row(props: { k: Entry }): number {
  const k = props.k;
  const on = (): boolean => items().indexOf(k) === cursor();
  return <View className={`flex-row items-center h-[${MENU_ROW_HEIGHT}] px-2 gap-2.5 rounded-md ${on() ? 'bg-[#ebebea]' : ''}`}
    onPointerEnter={(e: ui.PointerEvent) => setCursor(items().indexOf(k))} onPointerDown={(e: ui.PointerEvent) => pick(k)}>
    <View className="w-[38] h-[38] rounded-md border border-[#e9e9e7] bg-[#ffffff] items-center justify-center">
      <Icon name={k.icon} size={20} color={() => COLOR_TEXT} strokeWidth={1.75} />
    </View>
    <View className="flex-col grow">
      <Text className="text-[14px] text-[#37352f]">{k.label}</Text>
    </View>
  </View>;
}

export function SlashMenu(): i32 {
  return <View keepFocus className={`absolute flex-col w-[${MENU_WIDTH}] rounded-lg border border-[#e9e9e7] bg-[#ffffff] shadow-xl p-1`}
    style={{ hidden: open() ? 0 : 1, left: anchor()[0], top: anchor()[1] }}>
    <Text className="text-[11px] text-[#787774] px-2 pt-1.5 pb-1">{query() === '' ? labels.turnInto ?? 'Blocks' : query()}</Text>
    <ScrollView ref={listRef} className="flex-col" style={{ height: Math.min(MENU_MAX_ROWS, Math.max(1, items().length)) * MENU_ROW_HEIGHT }}>
      {items().map((k: Entry) => <Row k={k} />)}
      {items().length === 0 && <Text className="text-[13px] text-[#a4a29c] px-2 py-3">{labels.iconNoResult}</Text>}
    </ScrollView>
  </View>;
}
