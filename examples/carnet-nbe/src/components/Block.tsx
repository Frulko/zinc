// One block: the handle (+ adds a block below, the grip drags it), the marker of its type (bullet, number, check box,
// callout icon), its text field (the engine's textarea, as tall as its text) and the people whose caret is in it, drawn in
// the field (their caret and selection) and named on the right. A [[wikilink]] in the text is coloured and followed with
// Cmd+click or Alt+Enter; a line that is only a link (Carnet's link_to_page) is drawn as a link to the note.
import { createEffect, onCleanup, createNodeRef, NodeRef } from 'zinc:ui/solid';
import * as dnd from 'zinc:ui/dnd';
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { Block, Page, Peer, Link, pageOf, peersOn, focusedBlock, setFocusedBlock, toggleChecked, insertBlockAfter, listNumber, openLink,
  resolveLink } from '../state';
import { T_TEXT, T_H1, T_H2, T_H3, T_BULLET, T_NUMBER, T_TODO, T_QUOTE, T_CALLOUT, T_CODE, T_DIVIDER, T_TOGGLE, T_LINK, T_OTHER, HANDLE_WIDTH, INDENT_STEP,
  COLOR_TEXT_FAINT, COLOR_TEXT_SECONDARY, COLOR_PAGE, COLOR_ACCENT, COLOR_LINK_MISSING } from '../constants';
import { onBlockInput, onBlockKey } from './block-keys';
import { focusBlock, registerField, unregisterField } from './focus';
import { openMenuWhenShown } from './SlashMenu';
import { labels } from '../labels';

// ---- dragging a block by its grip (zinc:ui/dnd): every row is a drop target, the page's monitor shows the line and moves it
const rowNodes = new Map<string, i32>();   // block id -> its row node
/** The row of a block (the page view places the drop line from it). */
export function rowOf(id: string): i32 { const h = rowNodes.get(id); return h === undefined ? -1 : h as i32; }

// ---- looks per type
function spaceAbove(t: string): string { return t === T_H1 ? 'pt-[22]' : t === T_H2 ? 'pt-[16]' : t === T_H3 ? 'pt-[10]' : 'pt-[3]'; }
function fieldClass(b: Block): string {
  const t = b.type();
  const base = 'grow border-0 p-0 rounded-none bg-transparent focus:border-[#ffffff] selection:bg-[#2383e2]';
  if (t === T_H1) return `${base} text-[30px] font-bold leading-[38] text-[#37352f]`;
  if (t === T_H2) return `${base} text-[24px] font-semibold leading-[31] text-[#37352f]`;
  if (t === T_H3) return `${base} text-[20px] font-semibold leading-[26] text-[#37352f]`;
  if (t === T_CODE) return `${base} font-mono text-[14px] leading-[21] text-[#37352f]`;
  if (t === T_OTHER) return `${base} text-[16px] leading-[24] text-[#91918e] italic`;
  if (t === T_TODO && b.checked()) return `${base} text-[16px] leading-[24] text-[#a4a29c] line-through`;
  return `${base} text-[16px] leading-[24] text-[#37352f]`;
}
function boxClass(t: string): string {
  if (t === T_CALLOUT) return 'grow flex-row gap-2 rounded-md bg-[#f1f1ef] px-[14] py-[14]';
  if (t === T_CODE) return 'grow flex-row rounded-md bg-[#f7f6f3] px-[20] py-[18]';
  if (t === T_QUOTE) return 'grow flex-row border-l-[3] border-[#37352f] pl-[14] my-[2]';
  return 'grow flex-row';
}
/** Carnet's placeholders (its labels), the empty paragraph's only where the caret is. */
function placeholderOf(b: Block): string {
  const t = b.type(), ph = labels.placeholders as Record<string, string>;
  if (t === T_H1) return labels.heading1;
  if (t === T_H2) return labels.heading2;
  if (t === T_H3) return labels.heading3;
  if (t === T_TODO) return ph['to_do'] ?? '';
  if (t === T_BULLET || t === T_NUMBER) return ph['bulleted_list_item'] ?? '';
  if (t === T_TOGGLE) return ph['toggle'] ?? '';
  if (t === T_QUOTE) return ph['quote'] ?? '';
  if (t === T_CALLOUT) return ph['callout'] ?? '';
  return focusedBlock() === b ? labels.emptyParagraph : '';
}
const BULLETS: string[] = ['•', '◦', '▪'];

// Cmd+click on a link: the click puts the caret first, so the link under it is followed at the next frame
let followAfterClick: Block | null = null;
/** Called once per frame. */
export function stepLinks(): void {
  const b = followAfterClick;
  if (b === null) return;
  followAfterClick = null;
  const h = (b as Block).ref.node;
  if (h < 0) return;
  const c = ui.caretOf(h), l = (b as Block).links().find((x: Link) => x.from <= c && c <= x.to);
  if (l !== undefined) openLink(l.target, pageOf(b as Block));
}

function Marker(props: { b: Block }): i32 {
  const b = props.b;
  const t = (): string => b.type();
  const lead = (): string => t() === T_H1 ? 'h-[38]' : 'h-[24]';
  return <View className="flex-row">
    {t() === T_BULLET && <View className={`w-[26] ${lead()} items-center justify-center`}><Text className="text-[16px] text-[#37352f]">{BULLETS[b.indent() % 3]}</Text></View>}
    {t() === T_NUMBER && <View className={`min-w-[26] ${lead()} items-end justify-center pr-1.5`}><Text className="text-[16px] text-[#37352f]">{`${listNumber(b)}.`}</Text></View>}
    {t() === T_TODO && <View keepFocus className="w-[26] h-[24] items-center justify-center cursor-pointer" onPointerDown={(e: ui.PointerEvent) => toggleChecked(b)}>
      <View className={`w-[16] h-[16] rounded-[3] items-center justify-center ${b.checked() ? 'bg-[#2383e2]' : 'border-[1.5] border-[#37352f]'}`}>
        {b.checked() && <Icon name="check" size={12} color={() => COLOR_PAGE} strokeWidth={3} />}
      </View>
    </View>}
    {t() === T_TOGGLE && <View className={`w-[26] ${lead()} items-center justify-center`}><Icon name="chevron-right" size={16} color={() => COLOR_TEXT_SECONDARY} strokeWidth={2} /></View>}
    {t() === T_CALLOUT && <View className="w-[24] h-[24] items-center justify-center"><Icon name="lightbulb" size={18} color={() => 0xd9730d} strokeWidth={2} /></View>}
  </View>;
}

function Handle(props: { b: Block; grip: NodeRef }): i32 {
  const b = props.b;
  return <View keepFocus className={`flex-row w-[${HANDLE_WIDTH}] h-[24] items-center justify-end pr-1 opacity-0 group-hover:opacity-100`}>
    <View className="w-[22] h-[24] rounded-[4] items-center justify-center hover:bg-[#ebebea] cursor-pointer"
      onPointerDown={(e: ui.PointerEvent) => {
        const nb = insertBlockAfter(pageOf(b) as Page, b, T_TEXT, '/');   // as Notion: a new block with the slash typed
        focusBlock(nb, 1);
        openMenuWhenShown(nb);
      }}>
      <Icon name="plus" size={16} color={() => COLOR_TEXT_FAINT} strokeWidth={2} />
    </View>
    <View ref={props.grip} className="w-[18] h-[24] rounded-[4] items-center justify-center hover:bg-[#ebebea] cursor-grab">
      <Icon name="grip-vertical" size={16} color={() => COLOR_TEXT_FAINT} strokeWidth={2} />
    </View>
  </View>;
}

/** The names of the people in this block, on the right. */
function Presence(props: { b: Block }): i32 {
  return <View className="w-[72] flex-col items-start pl-2 pt-[3] gap-1">
    {peersOn(props.b).map((p: Peer) => <View className="rounded-[4] px-1.5 h-[18] justify-center" bg={p.color}>
      <Text className="text-[11px] font-semibold text-[#ffffff]">{p.name}</Text>
    </View>)}
  </View>;
}

/** A line that is only a link: the note's name, a click opens it (or makes it, faded while it does not exist). */
function LinkLine(props: { b: Block }): i32 {
  const b = props.b, target = (): string => b.links().length > 0 ? b.links()[0].target : '';
  return <View className="grow flex-row items-center h-[24] gap-1.5 cursor-pointer" onPointerDown={(e: ui.PointerEvent) => openLink(target(), pageOf(b))}>
    <Icon name="arrow-up-right" size={16} color={() => COLOR_ACCENT} strokeWidth={2} />
    <Text className={`text-[16px] underline ${resolveLink(target(), pageOf(b)) !== null ? 'text-[#2383e2]' : 'text-[#8fb8e6]'}`}>{target()}</Text>
  </View>;
}

/** The colour runs of one visual line of a block's text (from `start`): its links in the accent colour, faded when no note has that name. */
function linkRuns(b: Block, line: string, start: i32): i32[] {
  const out: i32[] = [], end = start + line.length;
  let at = start;
  for (const l of b.links()) {
    const from = Math.max(l.from, at), to = Math.min(l.to, end);
    if (to <= from) continue;
    if (from > at) out.push(from - at, -1);
    out.push(to - from, resolveLink(l.target, pageOf(b)) !== null ? COLOR_ACCENT : COLOR_LINK_MISSING);
    at = to;
  }
  if (end > at) out.push(end - at, -1);
  return out;
}

export function BlockRow(props: { b: Block }): i32 {
  const b = props.b;
  const row = createNodeRef(), grip = createNodeRef();
  const node = <View ref={row} className={`flex-row items-start group ${spaceAbove(b.type())}`} style={{ paddingLeft: b.indent() * INDENT_STEP }}>
    <Handle b={b} grip={grip} />
    {b.type() === T_DIVIDER && <View className="grow h-[24] justify-center"><View className="h-[1] bg-[#e9e9e7]" /></View>}
    {b.type() === T_LINK && <LinkLine b={b} />}
    <View className={boxClass(b.type())} style={{ hidden: b.type() === T_DIVIDER || b.type() === T_LINK ? 1 : 0 }}>
      <Marker b={b} />
      <TextArea ref={b.ref} rows={0} className={fieldClass(b)} placeholder={placeholderOf(b)} value={b.text()}
        onInput={(v: string) => onBlockInput(b, v)} onKeyDown={(e: ui.KeyEvent) => onBlockKey(b, e)}
        onPointerDown={(e: ui.PointerEvent) => { if (e.meta || e.ctrl) followAfterClick = b; }} />
    </View>
    <Presence b={b} />
  </View>;
  rowNodes.set(b.id, row.node);
  registerField(b.ref.node, b);
  const field = b.ref.node;
  const undrag = dnd.draggable(row.node, { data: b.id, handle: grip.node });
  const undrop = dnd.dropTarget(row.node, { data: b.id, edges: dnd.EDGES_VERTICAL, canDrop: (d: dnd.DragInfo) => !d.data.startsWith('note:') });
  ui.setHighlightAt(field, (line: string, start: i32): i32[] => b.links().length === 0 ? [line.length, -1] : linkRuns(b, line, start));
  onCleanup(() => {
    rowNodes.delete(b.id); unregisterField(field); undrag(); undrop();
    if (b.ref.node === field) b.ref.node = -1;   // its node is freed (page closed, block deleted): no caret to ask it for
    if (focusedBlock() === b) setFocusedBlock(null);
  });
  // the others' carets and selections in this block
  createEffect(() => {
    const marks: i32[] = [];
    b.text();
    for (const p of peersOn(b)) {
      if (p.caret < 0) continue;
      if (p.anchor >= 0 && p.anchor !== p.caret) { marks.push(Math.min(p.anchor, p.caret)); marks.push(Math.max(p.anchor, p.caret)); marks.push(p.color); marks.push(ui.MARK_FILL); }
      marks.push(p.caret); marks.push(p.caret); marks.push(p.color); marks.push(ui.MARK_CARET);
    }
    ui.setMarks(field, marks);
  });
  return node;
}
