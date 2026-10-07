/** @jsxHelpers ./host */
// zinc:ui/kit — MenuBar and ContextMenu: the application menu drawn by the kit where the system does not draw it (Linux without a global menu, Pi, sim, reMarkable). They show the same template as
// the native menu bar of macOS (docs/reports/system-integration.md 4.3): labels, accelerator hints, checkmarks, separators, submenus. Accelerators work in the window: each item's accelerator is
// bound as a key (Cmd/Ctrl+N -> mod-n) and runs the item, so the menu behaves the same with or without the pointer.
//
//   <MenuBar items={template} native={menu.native} onSelect={(id) => run(id)} />      // native: renders nothing (no double menu)
//   <ContextMenu items={[{ id: 'copy', label: 'Copy' }]} onSelect={...}><Page /></ContextMenu>   // right press
import { createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme } from './theme';
import { keyLabel } from './overlays';
import { renderSlot } from './host';

export interface MenuEntry {
  id?: string;
  label?: string;
  /** 'mod-n', 'mod-shift-s' (the kit's key strokes: mod is Cmd on macOS and Ctrl elsewhere). */
  accelerator?: string;
  checked?: boolean;
  disabled?: boolean;
  separator?: boolean;
  submenu?: MenuEntry[];
  onSelect?: () => void;
}
export interface MenuBarProps {
  items: MenuEntry[];
  /** true when the system draws the menu (menu.native): nothing is rendered. */
  native?: boolean;
  onSelect?: (id: string) => void;
  class?: string;
}
export interface ContextMenuProps {
  items: MenuEntry[];
  onSelect?: (id: string) => void;
  children?: () => i32;
  class?: string;
}

function shown(h: i32): boolean { const n = ui.inspectNode(h); return n !== null && !n.hidden; }
function show(h: i32, on: boolean): void { if (h >= 0) ui.setNumber(h, 'hidden', on ? 0 : 1); }

let bound: string[] = [];
const NO_ROWS: i32[] = [];
const NO_ENTRIES: MenuEntry[] = [];
/** Binds the accelerators of a template once (global actions: they work wherever the focus is). */
function bindAll(items: MenuEntry[], run: (e: MenuEntry) => void): void {
  for (const e of items) {
    if (e.separator === true) continue;
    const a = e.accelerator;
    if (a !== undefined && a.length > 0 && e.disabled !== true) {
      const action = 'menu:' + (e.id ?? e.label ?? a);
      if (bound.indexOf(action) < 0) { bound.push(action); ui.bindKeys(a, action); }
      ui.onAction(-1, action, () => run(e));
    }
    const sub = e.submenu;
    if (sub !== undefined) bindAll(sub, run);
  }
}

function Row(props: { entry: MenuEntry; panel: i32; close: () => void; run: (e: MenuEntry) => void; depth: i32 }): i32 {
  const t = theme(), e = props.entry;
  if (e.separator === true) return <View class={`h-px my-1 bg-${t.border}`} />;
  const hint = e.accelerator !== undefined ? keyLabel(e.accelerator) : '';
  const sub = e.submenu;
  const subRef = createNodeRef();
  const row = <View class="flex-col">
    <button class={`flex-row items-center justify-between gap-6 h-8 px-2 rounded-sm bg-transparent focus:bg-${t.subtle} active:bg-${t.subtle} ${e.disabled === true ? 'opacity-50' : ''}`}
      disabled={e.disabled === true}
      onClick={() => {
        if (sub !== undefined) { show(subRef.node, !shown(subRef.node)); return; }
        props.close();
        props.run(e);
      }}>
      <View class="flex-row items-center gap-2">
        <Text class={`text-sm w-4 text-${t.foreground}`}>{e.checked === true ? '✓' : ''}</Text>
        <Text class={`text-sm text-${t.foreground}`}>{e.label ?? ''}</Text>
      </View>
      <Text class={`text-xs tracking-widest text-${t.mutedForeground}`}>{sub !== undefined ? '›' : hint}</Text>
    </button>
    <View ref={subRef} hidden={1} class={`flex-col p-1 ml-4 rounded-md border border-${t.border} bg-${t.card}`}>
      {sub !== undefined ? sub.map((s: MenuEntry) => <Row entry={s} panel={props.panel} close={props.close} run={props.run} depth={props.depth + 1} />) : NO_ROWS}
    </View>
  </View>;
  return row;
}

function Panel(props: { items: MenuEntry[]; menu: i32; close: () => void; run: (e: MenuEntry) => void; class?: string }): i32 {
  const t = theme();
  return <View class={`flex-col p-1 w-56 rounded-md border border-${t.border} bg-${t.card} shadow-md ${props.class ?? ''}`}>
    {props.items.map((e: MenuEntry) => <Row entry={e} panel={props.menu} close={props.close} run={props.run} depth={0} />)}
  </View>;
}

function runner(onSelect: ((id: string) => void) | undefined): (e: MenuEntry) => void {
  return (e: MenuEntry): void => {
    const f = e.onSelect;
    if (f !== undefined) f();
    if (onSelect !== undefined && e.id !== undefined) onSelect(e.id);
  };
}

function TopMenu(props: { top: MenuEntry; run: (e: MenuEntry) => void }): i32 {
  const t = theme();
  const trig = createNodeRef(), menu = createNodeRef();
  const close = (): void => show(menu.node, false);
  const node = <View class="flex-col">
    <View ref={trig} class="flex-col">
      <button class={`h-7 px-3 rounded-sm bg-transparent focus:bg-${t.subtle} active:bg-${t.subtle}`} onClick={() => show(menu.node, !shown(menu.node))}>
        <Text class={`text-sm text-${t.foreground}`}>{props.top.label ?? ''}</Text>
      </button>
    </View>
    <View ref={menu} hidden={1}>
      <Panel items={props.top.submenu !== undefined ? props.top.submenu : NO_ENTRIES} menu={menu.node} close={close} run={props.run} />
    </View>
  </View>;
  ui.openLayer(menu.node, { priority: 100 });
  ui.anchor(menu.node, trig.node, 'bottom-start', 2);
  ui.focusScope(menu.node, { trap: true, restore: true, autoFocus: true });
  ui.onDismiss(menu.node, close);
  ui.onOutsidePointer(menu.node, (e: ui.PointerEvent) => close(), trig.node);
  return node;
}

/** The menu bar: one button per top-level entry, each opening its menu as a layer (arrows move, Enter picks, Escape closes). */
export function MenuBar(props: MenuBarProps): i32 {
  if (props.native === true) return <View class="hidden" hidden={1} />;   // the system draws it: no double menu
  const t = theme();
  const run = runner(props.onSelect);
  bindAll(props.items, run);
  return <View class={`flex-row items-center gap-1 px-2 h-9 border-b border-${t.border} bg-${t.background} ${props.class ?? ''}`}>
    {props.items.map((top: MenuEntry) => <TopMenu top={top} run={run} />)}
  </View>;
}

/** A right press (or a long press) on the children opens the menu under the pointer. */
export function ContextMenu(props: ContextMenuProps): i32 {
  const area = createNodeRef(), menu = createNodeRef();
  const run = runner(props.onSelect);
  const close = (): void => show(menu.node, false);
  bindAll(props.items, run);
  const node = <View ref={area} class="flex-col grow">
    {renderSlot(props.children)}
    <View ref={menu} hidden={1}>
      <Panel items={props.items} menu={menu.node} close={close} run={run} class={props.class} />
    </View>
  </View>;
  ui.openLayer(menu.node, { priority: 100 });
  ui.focusScope(menu.node, { trap: true, restore: true, autoFocus: true });
  ui.onDismiss(menu.node, close);
  ui.onOutsidePointer(menu.node, (e: ui.PointerEvent) => close());
  ui.onPointer(area.node, ui.PCONTEXT, (e: ui.PointerEvent) => { ui.anchorPoint(menu.node, e.x, e.y); show(menu.node, true); });
  return node;
}
