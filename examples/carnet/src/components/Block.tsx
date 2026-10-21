// One block: the handle (+ adds a block below, the grip drags it), the marker of its type (bullet, number, check box,
// callout icon), its text field (the engine's textarea, as tall as its text) and the people whose caret is in it, drawn in
// the field (their caret and selection) and named on the right.
import { createEffect, onCleanup, createNodeRef, NodeRef } from 'zinc:ui/solid';
import * as dnd from 'zinc:ui/dnd';
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { Block, Page, Peer, pageOf, peersOn, focusedBlock, toggleChecked, insertBlockAfter, listNumber } from '../state';
import { T_TEXT, T_H1, T_H2, T_H3, T_BULLET, T_NUMBER, T_TODO, T_QUOTE, T_CALLOUT, T_CODE, T_DIVIDER, HANDLE_WIDTH, INDENT_STEP,
  COLOR_TEXT_FAINT, COLOR_TEXT_SECONDARY, COLOR_PAGE } from '../constants';
import { onBlockInput, onBlockKey } from './block-keys';
import { focusBlock, registerField, unregisterField } from './focus';
import { openMenuWhenShown } from './SlashMenu';

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
  if (t === T_TODO && b.checked()) return `${base} text-[16px] leading-[24] text-[#a4a29c] line-through`;
  return `${base} text-[16px] leading-[24] text-[#37352f]`;
}
function boxClass(t: string): string {
  if (t === T_CALLOUT) return 'grow flex-row gap-2 rounded-md bg-[#f1f1ef] px-[14] py-[14]';
  if (t === T_CODE) return 'grow flex-row rounded-md bg-[#f7f6f3] px-[20] py-[18]';
  if (t === T_QUOTE) return 'grow flex-row border-l-[3] border-[#37352f] pl-[14] my-[2]';
  return 'grow flex-row';
}
function placeholderOf(b: Block): string {
  const t = b.type();
  if (t === T_H1) return 'Heading 1';
  if (t === T_H2) return 'Heading 2';
  if (t === T_H3) return 'Heading 3';
  if (t === T_TODO) return 'To-do';
  if (t === T_BULLET || t === T_NUMBER) return 'List';
  if (t === T_QUOTE) return 'Empty quote';
  if (t === T_CALLOUT) return 'Callout';
  return focusedBlock() === b ? "Type '/' for commands" : '';
}
const BULLETS: string[] = ['•', '◦', '▪'];

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
    {t() === T_CALLOUT && <View className="w-[24] h-[24] items-center justify-center"><Icon name="lightbulb" size={18} color={() => 0xd9730d} strokeWidth={2} /></View>}
  </View>;
}

function Handle(props: { b: Block; grip: NodeRef }): i32 {
  const b = props.b;
  return <View keepFocus className={`flex-row w-[${HANDLE_WIDTH}] h-[24] items-center justify-end pr-1 opacity-0 group-hover:opacity-100`}>
    <View className="w-[22] h-[24] rounded-[4] items-center justify-center hover:bg-[#ebebea] cursor-pointer"
      onPointerDown={(e: ui.PointerEvent) => {
        const nb = insertBlockAfter(pageOf(b) as Page, b, T_TEXT, '/', b.indent());   // as Notion: a new block with the slash typed
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

export function BlockRow(props: { b: Block }): i32 {
  const b = props.b;
  const row = createNodeRef(), grip = createNodeRef();
  const node = <View ref={row} className={`flex-row items-start group ${spaceAbove(b.type())}`} style={{ paddingLeft: b.indent() * INDENT_STEP }}>
    <Handle b={b} grip={grip} />
    {b.type() === T_DIVIDER && <View className="grow h-[24] justify-center"><View className="h-[1] bg-[#e9e9e7]" /></View>}
    <View className={boxClass(b.type())} style={{ hidden: b.type() === T_DIVIDER ? 1 : 0 }}>
      <Marker b={b} />
      <TextArea ref={b.ref} rows={0} className={fieldClass(b)} placeholder={placeholderOf(b)} value={b.text()}
        onInput={(v: string) => onBlockInput(b, v)} onKeyDown={(e: ui.KeyEvent) => onBlockKey(b, e)} />
    </View>
    <Presence b={b} />
  </View>;
  rowNodes.set(b.id, row.node);
  registerField(b.ref.node, b);
  const field = b.ref.node;
  const undrag = dnd.draggable(row.node, { data: b.id, handle: grip.node });
  const undrop = dnd.dropTarget(row.node, { data: b.id, edges: dnd.EDGES_VERTICAL });
  onCleanup(() => { rowNodes.delete(b.id); unregisterField(field); undrag(); undrop(); });
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
