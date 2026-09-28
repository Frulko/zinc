// Project panel: the folder tree. Click a folder to expand it (the chevron turns on a spring), click a file to open a
// preview tab, double-click to keep it. Keyboard (⌘⇧E focuses the panel): ↑↓ select, → expand / enter, ← collapse /
// parent, Enter open, Space preview. The right edge is a drag handle that resizes the panel.
import { createNodeRef, For } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme, bg, fg, bd } from '../app/theme';
import { Entry, rows, selected, setSelected, toggle, setOpen, root } from '../app/project';
import { active, buffers, Buffer, openFile } from '../app/workspace';
import { panelW, panelWidth, setPanelWidth } from '../app/settings';
import { drawChevron, drawFileIcon } from './icons';
import { rrect } from 'zinc:gfx';

export const panelRef = createNodeRef();
const ROW_H: i32 = 24, INDENT: i32 = 14;

function open(e: Entry, preview: boolean, focus: boolean): void {
  setSelected(e);
  if (e.dir) { toggle(e); return; }
  openFile(e.path, e.name, preview, focus);
}

function rowDown(e: Entry, ev: ui.PointerEvent): void {
  if (ev.button !== 0) return;
  if (ev.clicks >= 2 && !e.dir) { open(e, false, true); return; }
  if (ev.clicks >= 2) return;   // the first click already toggled the folder
  open(e, true, true);
}

function move(step: i32): void {
  const list = rows();
  if (list.length === 0) return;
  const s = selected();
  const i = s === null ? -1 : list.indexOf(s as Entry);
  const k = Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + step));
  setSelected(list[k]);
  revealRow(k);
}
/** Scrolls the tree so row k is visible. */
function revealRow(k: i32): void {
  const sc = scrollRef.node;
  if (sc < 0) return;
  const box = ui.screenBox(sc), top = ui.scrollTop(sc), y = k * ROW_H + 4;
  if (y < top) ui.scrollTo(sc, 0, y);
  else if (y + ROW_H > top + box[3]) ui.scrollTo(sc, 0, y + ROW_H - box[3]);
}

function treeKey(ev: ui.KeyEvent): void {
  const s = selected();
  if (ev.key === 'ArrowDown') move(1);
  else if (ev.key === 'ArrowUp') move(-1);
  else if (ev.key === 'ArrowRight' && s !== null) {
    const e = s as Entry;
    if (e.dir && !e.open) setOpen(e, true); else if (e.dir && e.children.length > 0) move(1);
  } else if (ev.key === 'ArrowLeft' && s !== null) {
    const e = s as Entry;
    if (e.dir && e.open) setOpen(e, false);
    else if (e.parent !== null && e.parent !== root) { setSelected(e.parent); revealRow(rows().indexOf(e.parent as Entry)); }
  } else if (ev.key === 'Enter' && s !== null) open(s as Entry, false, true);
  else if (ev.key === ' ' && s !== null) open(s as Entry, true, false);
  else return;
  ev.preventDefault();
}

function isOpenModified(e: Entry): boolean {
  for (const b of buffers()) if (b.path === e.path) return b.modified();
  return false;
}

function TreeRow(props: { e: Entry }): i32 {
  const e = props.e;
  const isSel = (): boolean => selected() === e;
  const isActive = (): boolean => { const b = active(); return b !== null && (b as Buffer).path === e.path; };
  const lead = e.depth * INDENT + 44;
  const color = (): i32 => isOpenModified(e) ? theme().modified : isActive() || isSel() ? theme().text : theme().muted;
  return <View class={`flex-row items-center h-[24] pr-3 cursor-pointer ${isSel() ? bg(theme().selected) : ''} hover:${bg(theme().hover)}`}
    onPointerDown={(ev: ui.PointerEvent) => rowDown(e, ev)}>
    <Canvas style={{ width: lead, height: 24, lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
      const t = theme();
      // indent guides of the ancestors, then the chevron (folders) and the file-type icon
      for (let d = 0; d < e.depth; d++) rrect(x + 12 + d * INDENT + 7, y, 1, h, 0, t.borderSoft, 255);
      const cx = x + 8 + e.depth * INDENT;
      if (e.dir) drawChevron(cx, y + 4, 16, e.chevron.get(), t.faint);
      drawFileIcon(e.name, e.dir, e.open, cx + 15, y + 4, 16, t);
    }} />
    <Text class={`text-[13px] ${fg(color())}`}>{e.name}</Text>
  </View>;
}

const scrollRef = createNodeRef();
let dragFrom: number = -1, dragW: number = 0;

export function ProjectPanel(): i32 {
  return <View ref={panelRef} focusable class={`flex-col h-full overflow-hidden border-r ${bg(theme().surface)} ${bd(theme().borderSoft)} focus:${bd(theme().borderSoft)}`}
    style={{ width: panelW.get(), hidden: panelW.get() < 1 ? 1 : 0 }} onKeyDown={treeKey}>
    <View class="flex-row items-center h-[30] px-3">
      <Text class={`text-[11px] font-semibold tracking-wider ${fg(theme().faint)}`}>{root.name.toUpperCase()}</Text>
    </View>
    <ScrollView ref={scrollRef} class="grow pb-2" style={{ width: panelWidth() }}>
      <For each={rows()}>{(e: Entry, i: i32) => <TreeRow e={e} />}</For>
    </ScrollView>
    <View class={`absolute top-0 bottom-0 right-0 w-[5] cursor-col-resize hover:${bg(theme().accent)}`}
      onPointerDown={(ev: ui.PointerEvent) => { dragFrom = ev.gx; dragW = panelWidth(); }}
      onPointerMove={(ev: ui.PointerEvent) => { if (dragFrom >= 0) setPanelWidth(dragW + ev.gx - dragFrom); }}
      onPointerUp={(ev: ui.PointerEvent) => { dragFrom = -1; }} />
  </View>;
}

/** Focuses the tree (⌘⇧E), selecting the active file's row. */
export function focusPanel(): void { if (panelRef.node >= 0) ui.focusNode(panelRef.node); }
