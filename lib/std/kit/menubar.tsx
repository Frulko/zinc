/** @jsxHelpers zinc:ui/kit/host */
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
import { look } from '../platform/index';
import { longPressFeedback } from '../platform/index';

export interface MenuEntry {
  id?: string;
  label?: string;
  mnemonic?: string;
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
  className?: string;
}
export interface ContextMenuProps {
  items: MenuEntry[];
  onSelect?: (id: string) => void;
  children?: () => i32;
  className?: string;
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
  if (e.separator === true) return <View className={`h-px my-1 bg-${t.border}`} />;
  const hint = e.accelerator !== undefined ? keyLabel(e.accelerator) : '';
  const sub = e.submenu;
  const subRef = createNodeRef();
  const row = <View className="flex-col">
    <Button className={`flex-row items-center justify-between gap-6 h-8 px-2 rounded-[8px] bg-transparent focus:bg-${t.subtle} active:bg-${t.subtle} ${e.disabled === true ? 'opacity-45' : ''}`}
      disabled={e.disabled === true}
      onClick={() => {
        if (sub !== undefined) { show(subRef.node, !shown(subRef.node)); return; }
        props.close();
        props.run(e);
      }}>
      <View className="flex-row items-center gap-2">
        <Text className={`text-[13px] w-4 text-${t.foreground}`}>{e.checked === true ? '✓' : ''}</Text>
        <Text className={`text-[13px] text-${t.foreground}`}>{e.label ?? ''}</Text>
      </View>
      <Text className={`text-[11px] tracking-widest text-${t.mutedForeground}`}>{sub !== undefined ? '›' : hint}</Text>
    </Button>
    <View ref={subRef} hidden={1} className={`flex-col p-1 ml-4 rounded-md border border-${t.border} bg-${t.card}`}>
      {sub !== undefined ? sub.map((s: MenuEntry) => <Row entry={s} panel={props.panel} close={props.close} run={props.run} depth={props.depth + 1} />) : NO_ROWS}
    </View>
  </View>;
  return row;
}

function Panel(props: { items: MenuEntry[]; menu: i32; close: () => void; run: (e: MenuEntry) => void; className?: string }): i32 {
  const t = theme();
  return <View role="menu" className={`flex-col p-[6px] w-56 ${look().panel} border border-${t.border} bg-${t.card} ${props.className ?? ''}`}>
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

enum MenuPhase { Closed, Open }
class MenuController {
  phase: MenuPhase = MenuPhase.Closed;
  active: i32 = 0;
  panels: i32[] = [];
  triggers: i32[] = [];
  transition(next: MenuPhase, index: i32): void {
    if (index < 0 || index >= this.panels.length) return;
    for (let i = 0; i < this.panels.length; i++) show(this.panels[i], next === MenuPhase.Open && i === index);
    this.phase = next; this.active = index;
  }
  move(delta: i32): void {
    if (this.panels.length === 0) return;
    const next = (this.active + delta + this.panels.length) % this.panels.length;
    this.transition(this.phase, next);
    if (this.phase === MenuPhase.Closed) ui.focusNode(this.triggers[next]);
  }
}
function TopMenu(props: { top: MenuEntry; index: i32; control: MenuController; run: (e: MenuEntry) => void }): i32 {
  const t = theme(), c = props.control, i = props.index;
  const trig = createNodeRef(), menu = createNodeRef();
  const close = (): void => c.transition(MenuPhase.Closed, i);
  const node = <View className="flex-col" onPointerEnter={(e: ui.PointerEvent) => { if (c.phase === MenuPhase.Open) c.transition(MenuPhase.Open, i); }}>
    <Button ref={trig} role="menuitem" aria-haspopup="menu" className={`h-[30px] px-3 rounded-[8px] bg-transparent focus:bg-${t.subtle} active:bg-${t.subtle}`}
      onKeyDown={(e: ui.KeyEvent) => {
        c.active = i;
        if (e.key === 'ArrowDown') { c.transition(MenuPhase.Open, i); e.preventDefault(); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { c.move(e.key === 'ArrowLeft' ? -1 : 1); e.preventDefault(); }
      }} onClick={() => c.transition(c.phase === MenuPhase.Open && c.active === i ? MenuPhase.Closed : MenuPhase.Open, i)}>
      <Text className={`text-[13px] text-${t.foreground}`}>{props.top.label ?? ''}</Text>
    </Button>
    <View ref={menu} hidden={1} onKeyDown={(e: ui.KeyEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { c.move(e.key === 'ArrowLeft' ? -1 : 1); e.preventDefault(); }
    }}>
      <Panel items={props.top.submenu !== undefined ? props.top.submenu : NO_ENTRIES} menu={menu.node} close={close} run={props.run} />
    </View>
  </View>;
  c.triggers.push(trig.node); c.panels.push(menu.node);
  ui.openLayer(menu.node, { priority: 100, motion: 'fade' });
  ui.anchor(menu.node, trig.node, 'bottom-start', 2);
  ui.focusScope(menu.node, { trap: true, restore: true, autoFocus: true });
  ui.onDismiss(menu.node, close);
  ui.onOutsidePointer(menu.node, (e: ui.PointerEvent) => close(), trig.node);
  return node;
}

/** F10 enters the bar; arrows traverse titles, Down opens, Escape returns focus. Alt+mnemonic opens a named menu. */
export function MenuBar(props: MenuBarProps): i32 {
  if (props.native === true) return <View className="hidden" hidden={1} />;
  const t = theme(), ref = createNodeRef(), control = new MenuController();
  const run = runner(props.onSelect);
  const node = <View ref={ref} role="menubar" className={`flex-row items-center gap-1 px-2 h-9 border-b border-${t.border} ${props.className ?? ''}`}>
    {props.items.map((top: MenuEntry, i: i32) => <TopMenu top={top} index={i} control={control} run={run} />)}
  </View>;
  const serial = ui.nodeSerial(ref.node);
  bindAll(props.items, (entry: MenuEntry) => { if (ui.nodeSerial(ref.node) === serial) run(entry); });
  const bind = (stroke: string, action: string, invoke: () => void): void => {
    if (bound.indexOf(action) < 0) { bound.push(action); ui.bindKeys(stroke, action); }
    ui.onAction(-1, action, () => { if (ui.nodeSerial(ref.node) === serial) invoke(); });
  };
  bind('f10', 'menubar:focus', () => { if (control.triggers.length > 0) ui.focusNode(control.triggers[0]); });
  for (let i = 0; i < props.items.length; i++) {
    const mnemonic = props.items[i].mnemonic;
    if (mnemonic !== undefined && mnemonic.length === 1) bind('alt-' + mnemonic, 'menubar:' + mnemonic, () => control.transition(MenuPhase.Open, i));
  }
  return node;
}

/** A right press opens the menu under the pointer; on a touch screen a finger's long press does (with the platform's haptic), as on iOS and Android. */
export function ContextMenu(props: ContextMenuProps): i32 {
  const area = createNodeRef(), menu = createNodeRef();
  const run = runner(props.onSelect);
  const close = (): void => show(menu.node, false);
  bindAll(props.items, run);
  const node = <View ref={area} className="flex-col grow">
    {renderSlot(props.children)}
    <View ref={menu} hidden={1}>
      <Panel items={props.items} menu={menu.node} close={close} run={run} className={props.className} />
    </View>
  </View>;
  ui.setFocusable(area.node, true);
  ui.onKeyDown(area.node, (e: ui.KeyEvent) => {
    if (e.key === 'ContextMenu' || (e.shift && e.key === 'F10')) {
      ui.anchor(menu.node, area.node, 'bottom-start', 2); show(menu.node, true); e.preventDefault();
    }
  });
  ui.openLayer(menu.node, { priority: 100 });
  ui.focusScope(menu.node, { trap: true, restore: true, autoFocus: true });
  ui.onDismiss(menu.node, close);
  ui.onOutsidePointer(menu.node, (e: ui.PointerEvent) => close());
  ui.onPointer(area.node, ui.PCONTEXT, (e: ui.PointerEvent) => { ui.anchorPoint(menu.node, e.x, e.y); show(menu.node, true); });
  // a touch screen (a phone; the pointer is coarse from the start there): a long press, which would drop a mouse's slow clicks on a desktop
  if (ui.pointerIsCoarse()) ui.onPointer(area.node, ui.PLONG, (e: ui.PointerEvent) => { longPressFeedback(); ui.anchorPoint(menu.node, e.x, e.y); show(menu.node, true); });
  return node;
}
