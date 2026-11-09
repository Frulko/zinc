/** @jsxHelpers ./host */
// Quiet app chrome. Application-owned document/panel identities and state survive close/reopen and layout saves.
import * as ui from 'zinc:ui';
import * as dnd from 'zinc:ui/dnd';
import { createNodeRef } from 'zinc:ui/solid';
import { Button } from './button';
import { IconButton } from './actions';
import { Popover, DropdownMenu, MenuItem } from './overlays';
import { ResizeHandle } from './separator';
import { Progress } from './progress';
import { renderSlot, onCleanup } from './host';
import { theme } from './theme';

export interface ToolbarItem { label: string; icon?: string; checked?: boolean; disabled?: boolean; separator?: boolean; onSelect?: () => void }
function ToolbarAction(p: { item: ToolbarItem; nodes: i32[]; menu?: boolean }): i32 {
  const ref = createNodeRef(), it = p.item;
  const h = <View ref={ref} className={it.separator === true ? `w-px h-5 mx-1 bg-${theme().border}` : 'flex-col shrink-0'}>
    <Show when={it.separator !== true}>
      {it.icon !== undefined && p.menu !== true
        ? <IconButton label={it.label} icon={it.icon ?? ''} disabled={it.disabled} pressed={it.checked} variant={it.checked === true ? 'secondary' : 'ghost'} onClick={it.onSelect} />
        : <Button label={it.label} size="sm" variant="ghost" pressed={it.checked} disabled={it.disabled} onClick={it.onSelect} />}
    </Show>
  </View>;
  p.nodes.push(ref.node);
  return h;
}

/** Overflow retains the same actions; the watcher only changes visibility when the available width changes. */
export function Toolbar(p: { label: string; items: ToolbarItem[]; trailing?: () => i32; className?: string }): i32 {
  const root = createNodeRef(), more = createNodeRef(), tail = createNodeRef();
  const buttons: i32[] = [], menu: i32[] = [], widths: number[] = [];
  let lastWidth: number = -1;
  const node = <View ref={root} role="toolbar" aria-label={p.label} className={`flex-row items-center gap-1 h-11 px-2 border-b border-${theme().border} ${p.className ?? ''}`}>
    {p.items.map((it: ToolbarItem) => <ToolbarAction item={it} nodes={buttons} />)}
    <View ref={more} className="shrink-0"><Popover label="More actions" className="w-56 p-[6px]">
      {p.items.map((it: ToolbarItem) => <ToolbarAction item={it} nodes={menu} menu={true} />)}
    </Popover></View>
    <View className="grow" /><View ref={tail} className="flex-row items-center min-w-0 overflow-hidden">{renderSlot(p.trailing)}</View>
  </View>;
  const fit = (): void => {
    const available = ui.screenBox(root.node)[2];
    if (available === lastWidth || available <= 0) return;
    lastWidth = available;
    for (const h of buttons) ui.setNumber(h, 'hidden', 1);
    ui.setNumber(more.node, 'hidden', 1);
    const remaining = Math.max(0, available - 16 - ui.screenBox(tail.node)[2] - 8);
    ui.setNumber(more.node, 'hidden', 0);
    const moreWidth = ui.screenBox(more.node)[2];
    for (let i = 0; i < buttons.length; i++) {
      ui.setNumber(buttons[i], 'hidden', 0);
      widths[i] = ui.screenBox(buttons[i])[2] + 4;
    }
    let used: number = 0, count: i32 = buttons.length;
    for (const w of widths) used += w;
    if (used > remaining) {
      used = moreWidth + 4; count = 0;
      for (let i = 0; i < widths.length; i++) { if (used + widths[i] > remaining) break; used += widths[i]; count++; }
    }
    if (count < buttons.length && count > 0 && p.items[count - 1].separator === true) count--;
    for (let i = 0; i < buttons.length; i++) {
      ui.setNumber(buttons[i], 'hidden', i < count ? 0 : 1);
      ui.setNumber(menu[i], 'hidden', i < count || (i === count && p.items[i].separator === true) ? 1 : 0);
    }
    ui.setNumber(more.node, 'hidden', count < buttons.length ? 0 : 1);
  };
  ui.addWatcher(fit);
  onCleanup(() => ui.removeWatcher(fit));
  return node;
}

export function StatusBar(p: { children?: () => i32; trailing?: () => i32; className?: string }): i32 {
  return <View role="status" className={`flex-row items-center gap-4 px-3 h-[30px] shrink-0 border-t border-${theme().border} ${p.className ?? ''}`}>
    {renderSlot(p.children)}<View className="grow" />{renderSlot(p.trailing)}
  </View>;
}
export function StatusItem(p: { label: string; onClick?: () => void; progress?: () => number }): i32 {
  return <View className="flex-row items-center gap-2">
    {p.onClick !== undefined ? <Button label={p.label} variant="ghost" size="sm" onClick={p.onClick} /> : <Text className={`text-[12px] tabular-nums text-${theme().mutedForeground}`}>{p.label}</Text>}
    <Show when={p.progress !== undefined}><Progress className="w-16" value={p.progress as () => number} /></Show>
  </View>;
}

export interface DocumentTab { id: string; label: string; dirty?: boolean; closable?: boolean }
export interface DocumentTabsProps {
  items: () => DocumentTab[];
  selected: () => string;
  onSelect: (id: string) => void;
  onClose?: (id: string) => void;
  onMove?: (from: i32, to: i32) => void;
  className?: string;
}
function DocumentTabItem(p: { tab: DocumentTab; owner: DocumentTabsProps }): i32 {
  const ref = createNodeRef(), it = p.tab, owner = p.owner;
  const close = (): void => { if (it.closable !== false && owner.onClose !== undefined) owner.onClose(it.id); };
  const node = <View ref={ref} role="tab" aria-selected={String(owner.selected() === it.id)} tabIndex={owner.selected() === it.id ? 0 : -1}
    className={`flex-row items-center gap-2 h-9 px-3 shrink-0 border-b-2 ${owner.selected() === it.id ? 'border-' + theme().accent : 'border-transparent'} focus:bg-${theme().subtle}`}
    onClick={() => owner.onSelect(it.id)} onPointerDown={(e: ui.PointerEvent) => { if (e.button === 1) close(); }}>
    <Text className={`text-[13px] text-${owner.selected() === it.id ? theme().foreground : theme().mutedForeground}`}>{it.label}{it.dirty === true ? ' •' : ''}</Text>
    <Show when={it.closable !== false && owner.onClose !== undefined}><IconButton label={'Close ' + it.label} icon="x" onClick={close} /></Show>
  </View>;
  if (owner.onMove !== undefined) {
    onCleanup(dnd.draggable(ref.node, { data: it.id }));
    onCleanup(dnd.dropTarget(ref.node, { edges: dnd.EDGES_HORIZONTAL, onDrop: (e: dnd.DragInfo) => {
      const from = owner.items().findIndex((t: DocumentTab) => t.id === e.data), to = owner.items().findIndex((t: DocumentTab) => t.id === it.id);
      if (from >= 0 && to >= 0 && from !== to && owner.onMove !== undefined) owner.onMove(from, to);
    } }));
  }
  return node;
}

/** The caller confirms dirty closes and applies moves; selecting a tab never discards another document. */
export function DocumentTabs(p: DocumentTabsProps): i32 {
  const keys = (e: ui.KeyEvent): void => {
    if (e.key === 'Escape' && dnd.cancelDrag()) { e.preventDefault(); return; }
    const tabs = p.items();
    if (tabs.length === 0) return;
    const from = Math.max(0, tabs.findIndex((it: DocumentTab) => it.id === p.selected()));
    if (e.key === 'Delete' || (e.primary && e.key === 'w')) {
      if (tabs[from].closable !== false && p.onClose !== undefined) p.onClose(tabs[from].id);
      e.preventDefault(); return;
    }
    const next = e.key === 'ArrowRight' || (e.ctrl && (e.key === 'PageDown' || e.key === 'Tab') && !e.shift);
    const previous = e.key === 'ArrowLeft' || (e.ctrl && (e.key === 'PageUp' || (e.key === 'Tab' && e.shift)));
    if (!next && !previous && e.key !== 'Home' && e.key !== 'End') return;
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (from + (previous ? tabs.length - 1 : 1)) % tabs.length;
    if (e.shift && !e.ctrl && p.onMove !== undefined) p.onMove(from, to);
    else p.onSelect(tabs[to].id);
    e.preventDefault();
  };
  return <ScrollView role="tablist" onKeyDown={keys} className={`flex-row h-10 shrink-0 border-b border-${theme().border} ${p.className ?? ''}`}>
    {p.items().map((it: DocumentTab) => <DocumentTabItem tab={it} owner={p} />)}
  </ScrollView>;
}

export interface DockNode { id: string; axis: string; ratio: number; tabs: string[]; selected: string; first?: DockNode; second?: DockNode }
export interface DockLayoutState { root: DockNode; closed: string[] }
export interface DockPanel { id: string; label: string; content: () => i32 }

/** Unknown panel ids are intentionally retained, so temporarily missing plugins keep their places. */
export function parseDockLayout(text: string): DockLayoutState {
  if (text.length > 65536) throw new Error('Dock layout is too large');
  const raw: any = JSON.parse(text);
  const ids: string[] = [], panels: string[] = [];
  const read = (value: any, depth: i32): DockNode => {
    if (depth > 16 || value === null || typeof value !== 'object' || typeof value.id !== 'string' || value.id.length === 0 || ids.indexOf(value.id) >= 0) throw new Error('Invalid dock node');
    ids.push(value.id);
    if (ids.length > 95) throw new Error('Too many dock nodes');
    if (value.axis !== 'tabs' && value.axis !== 'horizontal' && value.axis !== 'vertical') throw new Error('Invalid dock axis');
    const node: DockNode = { id: value.id, axis: value.axis, ratio: 0.5, tabs: [], selected: '' };
    if (node.axis === 'tabs') {
      if (!Array.isArray(value.tabs) || typeof value.selected !== 'string') throw new Error('Invalid dock tabs');
      for (const id of value.tabs) {
        if (typeof id !== 'string' || id.length === 0 || panels.indexOf(id) >= 0 || panels.length >= 48) throw new Error('Invalid or duplicate dock panel');
        panels.push(id); node.tabs.push(id);
      }
      if (value.selected !== '' && node.tabs.indexOf(value.selected) < 0) throw new Error('Invalid dock selection');
      node.selected = value.selected;
    } else {
      if (typeof value.ratio !== 'number' || !Number.isFinite(value.ratio) || value.ratio < 0.05 || value.ratio > 0.95) throw new Error('Invalid dock ratio');
      node.ratio = value.ratio; node.first = read(value.first, depth + 1); node.second = read(value.second, depth + 1);
    }
    return node;
  };
  if (raw === null || typeof raw !== 'object' || !Array.isArray(raw.closed)) throw new Error('Invalid dock layout');
  const root = read(raw.root, 0), closed: string[] = [];
  for (const id of raw.closed) {
    if (typeof id !== 'string' || panels.indexOf(id) < 0 || closed.indexOf(id) >= 0) throw new Error('Invalid closed panel');
    closed.push(id);
  }
  return { root: root, closed: closed };
}
export function saveDockLayout(layout: DockLayoutState): string { return JSON.stringify(layout); }
function findDock(node: DockNode, id: string): DockNode | undefined {
  if (node.id === id) return node;
  if (node.first !== undefined) { const found = findDock(node.first, id); if (found !== undefined) return found; }
  if (node.second !== undefined) return findDock(node.second, id);
  return undefined;
}
/** Pure updates validate a copy first, leaving the caller's current layout intact on failure. */
export function moveDockPanel(layout: DockLayoutState, panel: string, target: string, edge: string = 'tabs'): DockLayoutState {
  const next = parseDockLayout(saveDockLayout(layout));
  let leaf = findDock(next.root, target);
  if (leaf === undefined || leaf.axis !== 'tabs') throw new Error('Dock target is not a tab group');
  if (edge !== 'tabs' && edge !== 'left' && edge !== 'right' && edge !== 'top' && edge !== 'bottom') throw new Error('Invalid dock edge');
  const contains = (node: DockNode): boolean => node.tabs.indexOf(panel) >= 0 || (node.first !== undefined && contains(node.first)) || (node.second !== undefined && contains(node.second));
  if (!contains(next.root)) throw new Error('Unknown dock panel');
  const remove = (node: DockNode): void => {
    node.tabs = node.tabs.filter((id: string) => id !== panel);
    if (node.selected === panel) node.selected = node.tabs.length > 0 ? node.tabs[0] : '';
    if (node.first !== undefined) remove(node.first);
    if (node.second !== undefined) remove(node.second);
  };
  if (leaf.tabs.length === 1 && leaf.tabs[0] === panel) return next;
  remove(next.root);
  const compact = (node: DockNode): DockNode => {
    if (node.first === undefined || node.second === undefined) return node;
    node.first = compact(node.first); node.second = compact(node.second);
    if (node.first.axis === 'tabs' && node.first.tabs.length === 0) return node.second;
    if (node.second.axis === 'tabs' && node.second.tabs.length === 0) return node.first;
    return node;
  };
  next.root = compact(next.root);
  leaf = findDock(next.root, target);
  if (leaf === undefined) throw new Error('Dock target was removed');
  next.closed = next.closed.filter((id: string) => id !== panel);
  if (edge === 'tabs') { leaf.tabs.push(panel); leaf.selected = panel; return parseDockLayout(saveDockLayout(next)); }
  let suffix: i32 = 0;
  while (findDock(next.root, target + ':' + suffix) !== undefined || findDock(next.root, target + ':' + (suffix + 1)) !== undefined) suffix += 2;
  const old: DockNode = { id: target + ':' + suffix, axis: 'tabs', ratio: 0.5, tabs: leaf.tabs, selected: leaf.selected };
  const added: DockNode = { id: target + ':' + (suffix + 1), axis: 'tabs', ratio: 0.5, tabs: [panel], selected: panel };
  const before = edge === 'left' || edge === 'top';
  leaf.axis = edge === 'left' || edge === 'right' ? 'horizontal' : 'vertical';
  leaf.ratio = 0.5; leaf.tabs = []; leaf.selected = ''; leaf.first = before ? added : old; leaf.second = before ? old : added;
  return parseDockLayout(saveDockLayout(next));
}
export function setDockPanelOpen(layout: DockLayoutState, id: string, open: boolean): DockLayoutState {
  const next = parseDockLayout(saveDockLayout(layout));
  next.closed = next.closed.filter((v: string) => v !== id);
  if (!open) next.closed.push(id);
  return parseDockLayout(saveDockLayout(next));
}

export interface DockLayoutProps { layout: () => DockLayoutState; onChange: (layout: DockLayoutState) => void; panels: DockPanel[]; className?: string }
function DockBranch(p: { node: DockNode; owner: DockLayoutProps }): i32 {
  const ref = createNodeRef(), node = p.node, owner = p.owner;
  if (node.axis !== 'tabs') {
    const horizontal = node.axis === 'horizontal';
    return <View ref={ref} className={`grow basis-0 min-w-0 min-h-0 overflow-hidden ${horizontal ? 'flex-row' : 'flex-col'}`}>
      <View className={`flex-col basis-0 grow-[${node.ratio}] min-w-0 min-h-0 overflow-hidden`}><DockBranch node={node.first as DockNode} owner={owner} /></View>
      <ResizeHandle vertical={horizontal} size={() => Math.max(0, ui.screenBox(ref.node)[horizontal ? 2 : 3] - 4) * node.ratio} min={0} onResize={(px: number) => {
          const layout = parseDockLayout(saveDockLayout(owner.layout())), changed = findDock(layout.root, node.id);
          const total = Math.max(0, ui.screenBox(ref.node)[horizontal ? 2 : 3] - 4);
          if (changed !== undefined && total > 0) { const min = Math.min(120, total * 0.45); changed.ratio = Math.max(min / total, Math.min(1 - min / total, px / total)); owner.onChange(layout); }
        }} />
      <View className={`flex-col basis-0 grow-[${1 - node.ratio}] min-w-0 min-h-0 overflow-hidden`}><DockBranch node={node.second as DockNode} owner={owner} /></View>
    </View>;
  }
  const available = (): DockPanel[] => owner.panels.filter((panel: DockPanel) => node.tabs.indexOf(panel.id) >= 0 && owner.layout().closed.indexOf(panel.id) < 0);
  const active = (): string => available().some((panel: DockPanel) => panel.id === node.selected) ? node.selected : available().length > 0 ? available()[0].id : '';
  const destinations = (): MenuItem[] => {
    const items: MenuItem[] = [];
    for (const edge of ['left', 'right', 'top', 'bottom']) items.push({ label: 'Split ' + edge, onSelect: () => owner.onChange(moveDockPanel(owner.layout(), active(), node.id, edge)) });
    const visit = (leaf: DockNode): void => {
      if (leaf.axis === 'tabs' && leaf.id !== node.id) {
        const selected = owner.panels.find((panel: DockPanel) => panel.id === leaf.selected);
        const name = selected !== undefined ? selected.label : 'empty group';
        items.push({ label: 'Move to ' + name, onSelect: () => owner.onChange(moveDockPanel(owner.layout(), active(), leaf.id)) });
      }
      if (leaf.first !== undefined) visit(leaf.first);
      if (leaf.second !== undefined) visit(leaf.second);
    };
    visit(owner.layout().root);
    return items;
  };
  const base = 'flex-col grow basis-0 min-w-0 min-h-0';
  const nodeView = <View ref={ref} className={base}>
    <View className="flex-row items-center">

    <DocumentTabs items={() => available().map((panel: DockPanel): DocumentTab => ({ id: panel.id, label: panel.label }))} selected={active}
      onSelect={(id: string) => { const next = parseDockLayout(saveDockLayout(owner.layout())), leaf = findDock(next.root, node.id); if (leaf !== undefined) { leaf.selected = id; owner.onChange(next); } }}
      onClose={(id: string) => owner.onChange(setDockPanelOpen(owner.layout(), id, false))}
      className="grow min-w-0" onMove={(from: i32, to: i32) => {
        const next = parseDockLayout(saveDockLayout(owner.layout())), leaf = findDock(next.root, node.id), tabs = available();
        if (leaf !== undefined) { const id = tabs[from].id; leaf.tabs.splice(leaf.tabs.indexOf(id), 1); leaf.tabs.splice(leaf.tabs.indexOf(tabs[to].id), 0, id); owner.onChange(next); }
      }} />
      <Show when={active() !== ''}><DropdownMenu label="Panel actions" variant="ghost" items={destinations()} /></Show>
    </View>
    <View className="flex-col grow basis-0 min-h-0 overflow-hidden p-4">
      {available().filter((panel: DockPanel) => panel.id === active()).map((panel: DockPanel) => <View className="flex-col grow">{renderSlot(panel.content)}</View>)}
    </View>
  </View>;
  onCleanup(dnd.dropTarget(ref.node, { onDragEnter: (e: dnd.DragInfo) => ui.setClass(ref.node, base + ' border border-' + theme().accent),
    onDragLeave: (e: dnd.DragInfo) => ui.setClass(ref.node, base), edges: dnd.EDGE_TOP | dnd.EDGE_BOTTOM | dnd.EDGE_LEFT | dnd.EDGE_RIGHT,
    onDrop: (e: dnd.DragInfo) => {
      ui.setClass(ref.node, base);
      if (e.self === null || e.targets.length === 0 || e.targets[0].node !== ref.node || owner.panels.findIndex((panel: DockPanel) => panel.id === e.data) < 0) return;
      const edge = e.self.edge, box = ui.screenBox(ref.node);
      const centered = Math.min(e.x - box[0], box[0] + box[2] - e.x, e.y - box[1], box[1] + box[3] - e.y) > 36;
      owner.onChange(moveDockPanel(owner.layout(), e.data, node.id, centered ? 'tabs' : edge === dnd.EDGE_LEFT ? 'left' : edge === dnd.EDGE_RIGHT ? 'right' : edge === dnd.EDGE_TOP ? 'top' : 'bottom'));
    } }));
  return nodeView;
}
/** Save/load is explicit: use storage.set(key, saveDockLayout(layout)); only apply parseDockLayout(text) after it succeeds. */
export function DockLayout(p: DockLayoutProps): i32 {
  return <View className={`flex-col grow basis-0 min-h-0 overflow-hidden ${p.className ?? ''}`}><DockBranch node={p.layout().root} owner={p} /></View>;
}
