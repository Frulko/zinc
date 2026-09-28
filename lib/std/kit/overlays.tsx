/** @jsxHelpers ./host */
// zinc:ui/kit — overlays, after shadcn/ui's: Tooltip, Popover, DropdownMenu, Dialog and toast(). They are built on the
// engine's layers (they escape clipping and scrolling, and paint above the page), anchored positioning (they flip when
// there is no room), focus scopes (menus and dialogs take the focus and give it back), the dismiss stack (Escape closes
// the latest one) and outside presses.
//
//   <Tooltip label="Save" action="save"><Button label="Save" onClick={save} /></Tooltip>
//   <Popover label="Filters"><FilterForm /></Popover>
//   <DropdownMenu label="Edit" items={[{ label: 'Undo', action: 'undo' }, { label: 'Delete', onSelect: remove }]} />
//   <Dialog open={confirming} onOpenChange={setConfirming} title="Delete file?" footer={() => <Buttons />} />
//   toast('Saved', 'All changes are on disk.')
//
// Tooltip, Popover and DropdownMenu keep their open state in the engine (the overlay node's `hidden`), so they behave the
// same under Solid and React; under React a re-render of the parent closes them. Dialog is controlled (open /
// onOpenChange), like a checkbox.
import { createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme } from './theme';
import { Button } from './button';
import { renderSlot } from './host';

/** 'mod-shift-s' -> '⌘⇧S' (hints in menus and tooltips). */
export function keyLabel(stroke: string): string {
  const parts = stroke.split('-');
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].toLowerCase();
    const last = i === parts.length - 1;
    if (!last && (p === 'mod' || p === 'cmd' || p === 'meta')) out += '⌘';
    else if (!last && p === 'ctrl') out += '⌃';
    else if (!last && (p === 'alt' || p === 'option')) out += '⌥';
    else if (!last && p === 'shift') out += '⇧';
    else if (last) out += p === 'enter' ? '↵' : p === 'escape' || p === 'esc' ? 'Esc' : p === 'backspace' ? '⌫' : p === 'up' ? '↑' : p === 'down' ? '↓' : p === 'left' ? '←' : p === 'right' ? '→' : p === 'space' ? 'Space' : p.toUpperCase();
  }
  return out;
}
/** The first binding of an action as a label, '' when it has none. */
function shortcutOf(action: string | undefined): string {
  if (action === undefined) return '';
  const k = ui.keysFor(action);
  return k.length > 0 ? keyLabel(k[0]) : '';
}
function shown(h: i32): boolean { const n = ui.inspectNode(h); return n !== null && !n.hidden; }
function show(h: i32, on: boolean): void { if (h >= 0) ui.setNumber(h, 'hidden', on ? 0 : 1); }

// ---------------------------------------------------------------- Tooltip
export interface TooltipProps {
  label: string;
  /** An action bound with ui.bindKeys: its shortcut is shown after the label. */
  action?: string;
  placement?: string;     // 'top' (default), 'bottom', 'left', 'right', with '-start' / '-end'
  delay?: number;         // ms before it shows (default 500)
  class?: string;
  children: () => i32;
}
/** A hint that shows while the pointer rests on its children. */
export function Tooltip(props: TooltipProps): i32 {
  const wrap = createNodeRef(), tip = createNodeRef();
  const t = theme(), keys = shortcutOf(props.action);
  let timer: i32 = -1;
  const node = <View ref={wrap} class={`flex-col ${props.class ?? ''}`}
    onPointerEnter={(e: ui.PointerEvent) => { if (timer >= 0) clearTimeout(timer); timer = setTimeout(() => { timer = -1; show(tip.node, true); }, props.delay ?? 500); }}
    onPointerLeave={(e: ui.PointerEvent) => { if (timer >= 0) clearTimeout(timer); timer = -1; show(tip.node, false); }}>
    {props.children()}
    <View ref={tip} class={`flex-row items-center gap-2 px-2 py-1 rounded-md bg-${t.primary}`} hidden={1}>
      <Text class={`text-xs text-${t.primaryForeground}`}>{props.label}</Text>
      <Text class={`text-xs text-${t.mutedForeground}`} hidden={keys.length > 0 ? 0 : 1}>{keys}</Text>
    </View>
  </View>;
  ui.openLayer(tip.node, { priority: 300 });
  ui.anchor(tip.node, wrap.node, props.placement ?? 'top', 6);
  return node;
}

// ---------------------------------------------------------------- Popover and DropdownMenu
/** Opens `float` under `trigger` as a layer: anchored, focus scope, Escape and outside presses close it. */
function attach(float: i32, trigger: i32, placement: string, trap: boolean): void {
  ui.openLayer(float, { priority: 100 });
  ui.anchor(float, trigger, placement, 4);
  ui.focusScope(float, { trap: trap, restore: true, autoFocus: true });
  ui.onDismiss(float, () => show(float, false));
  ui.onOutsidePointer(float, (e: ui.PointerEvent) => show(float, false), trigger);
}

export interface PopoverProps {
  label: string;            // the trigger button
  variant?: string;         // of the trigger button (Button variants; default 'outline')
  placement?: string;       // default 'bottom-start'
  class?: string;           // classes of the panel ('w-72', 'p-2'...)
  children: () => i32;
}
/** A button that opens a floating panel with any content. */
export function Popover(props: PopoverProps): i32 {
  const trig = createNodeRef(), panel = createNodeRef();
  const t = theme();
  const node = <View class="flex-col">
    <View ref={trig} class="flex-col"><Button label={props.label} variant={props.variant ?? 'outline'} onClick={() => show(panel.node, !shown(panel.node))} /></View>
    <View ref={panel} hidden={1} class={`flex-col gap-3 p-4 w-72 rounded-md border border-${t.border} bg-${t.card} shadow-md ${props.class ?? ''}`}>
      {props.children()}
    </View>
  </View>;
  attach(panel.node, trig.node, props.placement ?? 'bottom-start', false);
  return node;
}

export interface MenuItem {
  label: string;
  /** An action (ui.bindKeys / ui.onAction): dispatched on select, its shortcut shown on the right. */
  action?: string;
  onSelect?: () => void;
  disabled?: boolean;
}
export interface DropdownMenuProps {
  label: string;
  items: MenuItem[];
  variant?: string;         // of the trigger button (default 'outline')
  placement?: string;       // default 'bottom-start'
  class?: string;           // classes of the menu ('w-56'...)
}
function MenuRow(props: { item: MenuItem; menu: i32 }): i32 {
  const t = theme(), it = props.item, keys = shortcutOf(it.action);
  return <button class={`flex-row items-center justify-between gap-6 h-8 px-2 rounded-sm bg-transparent focus:bg-${t.subtle} active:bg-${t.subtle} ${it.disabled === true ? 'opacity-50' : ''}`}
    disabled={it.disabled === true}
    onClick={() => {
      show(props.menu, false);
      const f = it.onSelect;
      if (f !== undefined) f();
      const a = it.action;
      if (a !== undefined) ui.dispatchAction(a);
    }}>
    <Text class={`text-sm text-${t.foreground}`}>{it.label}</Text>
    <Text class={`text-xs tracking-widest text-${t.mutedForeground}`}>{keys}</Text>
  </button>;
}
/** A button that opens a list of actions: arrows move, Enter picks, Escape or a press outside closes. */
export function DropdownMenu(props: DropdownMenuProps): i32 {
  const trig = createNodeRef(), menu = createNodeRef();
  const t = theme();
  const node = <View class="flex-col">
    <View ref={trig} class="flex-col"><Button label={props.label} variant={props.variant ?? 'outline'} onClick={() => show(menu.node, !shown(menu.node))} /></View>
    <View ref={menu} hidden={1} class={`flex-col p-1 w-56 rounded-md border border-${t.border} bg-${t.card} shadow-md ${props.class ?? ''}`}>
      {props.items.map((it: MenuItem) => <MenuRow item={it} menu={menu.node} />)}
    </View>
  </View>;
  attach(menu.node, trig.node, props.placement ?? 'bottom-start', true);
  return node;
}

// ---------------------------------------------------------------- Dialog
export interface DialogProps {
  open: () => boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  class?: string;           // classes of the panel ('w-[480px]'...)
  children?: () => i32;
  footer?: () => i32;       // buttons, right-aligned
}
/** A modal panel over a dimmed page: the focus stays inside it; Escape or a press outside asks to close it. */
export function Dialog(props: DialogProps): i32 {
  const screen = createNodeRef(), panel = createNodeRef();
  const t = theme();
  const close = (): void => props.onOpenChange(false);
  const node = <View ref={screen} class="absolute inset-0 items-center justify-center" hidden={props.open() ? 0 : 1}>
    <View ref={panel} class={`flex-col gap-4 p-6 w-[420px] rounded-lg border border-${t.border} bg-${t.card} shadow-lg ${props.class ?? ''}`}>
      <View class="flex-col gap-1.5">
        <Text class={`text-lg font-semibold tracking-tight text-${t.foreground}`} hidden={props.title !== undefined ? 0 : 1}>{props.title ?? ''}</Text>
        <Text class={`text-sm text-${t.mutedForeground}`} hidden={props.description !== undefined ? 0 : 1}>{props.description ?? ''}</Text>
      </View>
      {renderSlot(props.children)}
      <View class="flex-row justify-end gap-2">{renderSlot(props.footer)}</View>
    </View>
  </View>;
  ui.openLayer(screen.node, { priority: 200, modal: true, backdrop: 0x000000, backdropAlpha: 128 });
  ui.focusScope(screen.node, { trap: true, restore: true, autoFocus: true });
  ui.onDismiss(screen.node, close);
  ui.onOutsidePointer(panel.node, (e: ui.PointerEvent) => close());
  return node;
}

// ---------------------------------------------------------------- toast
let toaster: i32 = -1;
/** Shows a notification in the bottom-right corner for `ms` milliseconds (stacked, newest last). No component to mount. */
export function toast(title: string, description: string = '', ms: number = 4000): void {
  if (toaster < 0) {
    toaster = ui.createNode(ui.VIEW);
    ui.setClass(toaster, 'flex-col gap-2 right-4 bottom-4 w-[320px]');
    ui.openLayer(toaster, { priority: 400 });
  }
  const t = theme();
  const n = <View class={`flex-col gap-1 p-4 rounded-lg border border-${t.border} bg-${t.card} shadow-lg`}>
    <Text class={`text-sm font-semibold text-${t.foreground}`}>{title}</Text>
    <Text class={`text-sm text-${t.mutedForeground}`} hidden={description.length > 0 ? 0 : 1}>{description}</Text>
  </View>;
  ui.insert(toaster, n, -1);
  setTimeout(() => { ui.remove(toaster, n); }, ms);
}
