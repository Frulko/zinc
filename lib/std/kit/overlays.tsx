/** @jsxHelpers zinc:ui/kit/host */
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
// Component-owned state survives parent renders in both UI models. Dialog and Sheet are controlled.
import { createNodeRef, NodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme } from './theme';
import { Button as KitButton } from './button';
import { renderSlot, onCleanup, componentRef } from './host';
import { attachTooltip, TooltipSession } from './tooltip';
import { width, height, rrect } from 'zinc:gfx';
import { look } from '../platform/index';

/** 'mod-shift-s' -> '⌘⇧S' (hints in menus and tooltips). */
export function keyLabel(stroke: string): string {
  const parts = stroke.split('-');
  let out = '';
  let end = parts.length - 1, key = parts[end];
  if (key.length === 0 && parts.length >= 2) { key = '-'; end--; }
  for (let i = 0; i <= end; i++) {
    const p = (i === end ? key : parts[i]).toLowerCase();
    const last = i === end;
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
function show(h: i32, on: boolean): void { if (h >= 0) ui.setNumber(h, 'hidden', on ? 0 : 1); }

// ---------------------------------------------------------------- Tooltip
export interface TooltipProps {
  label: string;
  /** An action bound with ui.bindKeys: its shortcut is shown after the label. */
  action?: string;
  placement?: string;     // 'top' (default), 'bottom', 'left', 'right', with '-start' / '-end'
  delay?: number;         // ms before it shows (default 500)
  className?: string;
  children: () => i32;
}
/** A hint that shows while the pointer rests on its children (not while one is pressed: a button that opens a popover keeps the tip away)
 *  or the keyboard focus is on one of them; a long press (touch) shows it for 3 s. */
export function Tooltip(props: TooltipProps): i32 {
  const wrap = createNodeRef();
  const hint = componentRef(new TooltipSession()).current;
  const keys = shortcutOf(props.action);
  const node = <View ref={wrap} className={`flex-col ${props.className ?? ''}`}>{props.children()}</View>;
  attachTooltip(wrap.node, props.label + (keys.length > 0 ? '  ' + keys : ''), props.placement ?? 'top', props.delay ?? 500, hint);
  return node;
}

// ---------------------------------------------------------------- Popover and DropdownMenu
/** Opens `float` under `trigger` as a layer: anchored, focus scope, Escape and outside presses close it. */
function attach(float: i32, trigger: i32, placement: string, trap: boolean, close: () => void, gap: number = 4): void {
  ui.openLayer(float, { priority: 100, motion: 'scale', duration: 280 });
  ui.anchor(float, trigger, placement, gap);
  ui.focusScope(float, { trap: trap, restore: true, autoFocus: true });
  ui.onDismiss(float, close);
  ui.onOutsidePointer(float, (e: ui.PointerEvent) => close(), trigger);
}

export interface PopoverProps {
  label: string;            // the trigger button
  trigger?: () => i32;      // its content, instead of the label (an icon); `label` then names it for a screen reader
  variant?: string;         // of the trigger button (Button variants; default 'outline')
  placement?: string;       // default 'bottom-start'
  width?: number;
  padding?: number;
  gap?: number;
  className?: string;           // classes of the panel ('w-72', 'p-2'...)
  children: () => i32;
}
/** A button that opens a floating panel with any content. */
export function Popover(props: PopoverProps): i32 {
  const Trigger = props.trigger as () => i32;
  const trig = createNodeRef(), panel = createNodeRef();
  const open = componentRef(false);
  const setOpen = (on: boolean): void => { open.current = on; show(panel.node, on); };
  const t = theme();
  const node = <View className="flex-col">
    <View ref={trig} className="flex-col">{props.trigger !== undefined
      ? <Button aria-label={props.label} className={`cursor-pointer rounded-[10px] focus-visible:ring-2 focus-visible:ring-${t.accent} focus-visible:ring-offset-2`} onClick={() => setOpen(!open.current)}>{renderSlot(Trigger)}</Button>
      : <KitButton label={props.label} variant={props.variant ?? 'outline'} onClick={() => setOpen(!open.current)} />}</View>
    <View ref={panel} hidden={open.current ? 0 : 1} className={`flex-col gap-3 p-[${props.padding ?? 16}px] w-[${props.width ?? 288}px] ${look().panel} border border-${t.border} bg-${t.card} ${props.className ?? ''}`}>
      {props.children()}
    </View>
  </View>;
  attach(panel.node, trig.node, props.placement ?? 'bottom-start', false, () => setOpen(false), props.gap ?? 4);
  return node;
}

export interface MenuItem {
  label: string;
  /** An action (ui.bindKeys / ui.onAction): dispatched on select, its shortcut shown on the right. */
  action?: string;
  onSelect?: () => void;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
  destructive?: boolean;
}
export interface DropdownMenuProps {
  label: string;
  disabled?: boolean;
  items: MenuItem[];
  variant?: string;         // of the trigger button (default 'outline')
  placement?: string;       // default 'bottom-start'
  className?: string;           // classes of the menu ('w-56'...)
}
function MenuRow(props: { item: MenuItem; close: () => void }): i32 {
  const t = theme(), it = props.item, keys = shortcutOf(it.action);
  if (it.separator === true) return <View className={`h-px my-1 bg-${t.border}`} />;
  return <Button role="menuitem" aria-checked={it.checked === undefined ? '' : String(it.checked)} className={`flex-row items-center justify-between gap-6 h-8 px-2 rounded-[8px] bg-transparent focus:bg-${t.subtle} active:bg-${t.subtle} ${it.disabled === true ? 'opacity-45' : ''}`}
    disabled={it.disabled === true}
    onClick={() => {
      props.close();
      const f = it.onSelect;
      if (f !== undefined) f();
      const a = it.action;
      if (a !== undefined) ui.dispatchAction(a);
    }}>
    <Text className={`text-[13px] text-${it.destructive === true ? t.destructive : t.foreground}`}>{it.checked === true ? '✓ ' : ''}{it.label}</Text>
    <Text className={`text-xs tracking-widest text-${t.mutedForeground}`}>{keys}</Text>
  </Button>;
}
/** A button that opens a list of actions: arrows move, Enter picks, Escape or a press outside closes. */
export function DropdownMenu(props: DropdownMenuProps): i32 {
  const trig = createNodeRef(), menu = createNodeRef();
  const open = componentRef(false);
  const setOpen = (on: boolean): void => { open.current = on; show(menu.node, on); };
  const t = theme();
  const node = <View className="flex-col">
    <View ref={trig} className="flex-col" onKeyDown={(e: ui.KeyEvent) => { if (e.key === 'ArrowDown' && props.disabled !== true) { setOpen(true); e.preventDefault(); } }}><KitButton label={props.label} disabled={props.disabled} variant={props.variant ?? 'outline'} onClick={() => setOpen(!open.current)} /></View>
    <View ref={menu} role="menu" hidden={open.current ? 0 : 1} className={`flex-col p-[6px] w-56 ${look().panel} border border-${t.border} bg-${t.card} ${props.className ?? ''}`}>
      {props.items.map((it: MenuItem) => <MenuRow item={it} close={() => setOpen(false)} />)}
    </View>
  </View>;
  attach(menu.node, trig.node, props.placement ?? 'bottom-start', true, () => setOpen(false));
  return node;
}

// ---------------------------------------------------------------- Dialog
export interface DialogProps {
  open: () => boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  width?: number;
  persistent?: boolean;
  closeLabel?: string;
  closeButton?: boolean;
  className?: string;           // classes of the panel ('w-[480px]'...)
  children?: () => i32;
  footer?: () => i32;       // buttons, right-aligned
}
/** A modal panel over a dimmed page: the focus stays inside it; Escape or a press outside asks to close it. The dim fades in and out, the panel
 *  fades and grows from 96%. */
export function Dialog(props: DialogProps): i32 {
  const screen = createNodeRef(), panel = createNodeRef(), description = createNodeRef();
  const t = theme();
  const close = (): void => { if (props.persistent !== true) props.onOpenChange(false); };
  const node = <View ref={screen} className="absolute inset-0 items-center justify-center" hidden={props.open() ? 0 : 1} role="dialog" aria-modal="true" aria-label={props.title ?? ''} aria-description={props.description ?? ''}>
    <View ref={panel} className={`flex-col gap-4 p-6 w-[${props.width ?? 440}px] max-w-full ${look().dialog} border border-${t.border} bg-${t.card} ${props.className ?? ''}`}>
      <View className="flex-row gap-3 items-start">
      <View className="flex-col gap-1.5 grow shrink min-w-0">
        <Text as="h2" className={`text-[17px] font-medium text-${t.foreground}`} hidden={props.title !== undefined ? 0 : 1}>{props.title ?? ''}</Text>
        <Text ref={description} className={`text-sm text-${t.mutedForeground}`} hidden={props.description !== undefined ? 0 : 1}>{props.description ?? ''}</Text>
      </View>
      <Show when={props.persistent !== true && props.closeButton !== false}><KitButton label={props.closeLabel ?? 'Close'} variant="ghost" size="sm" onClick={close} /></Show>
      </View>
      {renderSlot(props.children)}
      <View className="flex-row justify-end gap-2">{renderSlot(props.footer)}</View>
    </View>
  </View>;
  ui.setAttr(description.node, 'id', `kit-dialog-description-${ui.nodeSerial(description.node)}`);
  if (props.description !== undefined) ui.setAttr(screen.node, 'aria-describedby', `kit-dialog-description-${ui.nodeSerial(description.node)}`);
  ui.openLayer(screen.node, { priority: 200, modal: true, backdrop: 0x000000, backdropAlpha: 128, motion: 'scale', duration: 340 });   // the dim fades, the panel grows in
  ui.focusScope(screen.node, { trap: true, restore: true, autoFocus: true });
  ui.onDismiss(screen.node, close);
  ui.onOutsidePointer(panel.node, (e: ui.PointerEvent) => close());
  return node;
}

// ---------------------------------------------------------------- Sheet
export interface SheetProps extends DialogProps { side?: string; size?: number }
/** A scrollable modal at any edge. Its explicit footer can finish a persistent operation. */
export function Sheet(props: SheetProps): i32 {
  const screen = createNodeRef(), panel = createNodeRef();
  const side = props.side ?? 'right', size = props.size ?? 400;
  const place = side === 'left' ? `left-0 top-0 bottom-0 w-[${size}px]` : side === 'top' ? `top-0 left-0 right-0 h-[${size}px]` : side === 'bottom' ? `bottom-0 left-0 right-0 h-[${size}px]` : `right-0 top-0 bottom-0 w-[${size}px]`;
  const close = (): void => { if (props.persistent !== true) props.onOpenChange(false); };
  const node = <View ref={screen} className="absolute inset-0" hidden={props.open() ? 0 : 1} role="dialog" aria-modal="true" aria-label={props.title ?? ''} aria-description={props.description ?? ''}>
    <View ref={panel} className={`absolute flex-col p-6 gap-4 max-w-full border border-${theme().border} bg-${theme().card} ${place} ${props.className ?? ''}`}>
      <View className="flex-row items-start gap-3">
        <View className="flex-col grow shrink min-w-0 gap-1">
          <Text className={`text-[17px] font-medium text-${theme().foreground}`}>{props.title ?? ''}</Text>
          <Text className={`text-[13px] text-${theme().mutedForeground}`}>{props.description ?? ''}</Text>
        </View>
        <Show when={props.persistent !== true && props.closeButton !== false}><KitButton label={props.closeLabel ?? 'Close'} variant="ghost" size="sm" onClick={close} /></Show>
      </View>
      <ScrollView className="grow"><View className="flex-col gap-3">{renderSlot(props.children)}</View></ScrollView>
      <View className="flex-row justify-end gap-2">{renderSlot(props.footer)}</View>
    </View>
  </View>;
  ui.openLayer(screen.node, { priority: 200, modal: true, backdrop: 0, backdropAlpha: 100, motion: `slide-${side}`, duration: 340 });
  ui.focusScope(screen.node, { trap: true, restore: true, autoFocus: true });
  ui.onDismiss(screen.node, close);
  ui.onOutsidePointer(panel.node, (e: ui.PointerEvent) => close());
  return node;
}

// ---------------------------------------------------------------- Hover card
export interface HoverCardProps { label: string; trigger: () => i32; children: () => i32; delay?: number; grace?: number; placement?: string; width?: number; className?: string }
enum HoverState { Closed, Waiting, Open, Grace, Disposed }
/** Rich hover content is a popover, with a grace period for crossing from the trigger to its card. */
export function HoverCard(props: HoverCardProps): i32 {
  const trigger = createNodeRef(), panel = createNodeRef();
  const remembered = componentRef(HoverState.Closed), deadline = componentRef(0);
  let state = remembered.current, timer: i32 = -1;
  const transition = (next: HoverState): void => {
    if (state === HoverState.Disposed || next === state) return;
    if (timer >= 0) ui.cancelAlarm(timer);
    timer = -1;
    state = next;
    if (next === HoverState.Disposed) return;
    remembered.current = next;
    show(panel.node, next === HoverState.Open || next === HoverState.Grace);
    if (next === HoverState.Waiting || next === HoverState.Grace) {
      deadline.current = ui.now() + (next === HoverState.Waiting ? props.delay ?? 450 : props.grace ?? 200);
      timer = ui.alarm(deadline.current, () => transition(next === HoverState.Waiting ? HoverState.Open : HoverState.Closed));
    }
  };
  const enter = (): void => transition(state === HoverState.Grace || state === HoverState.Open || ui.hasFocusWithin(trigger.node) || ui.hasFocusWithin(panel.node) ? HoverState.Open : HoverState.Waiting);
  const leave = (): void => {
    if (ui.hasFocusWithin(trigger.node) || ui.hasFocusWithin(panel.node)) return;
    transition(state === HoverState.Open ? HoverState.Grace : HoverState.Closed);
  };
  const node = <View className="flex-col">
    <Button ref={trigger} aria-label={props.label} className="bg-transparent" onPointerEnter={(e: ui.PointerEvent) => enter()} onPointerLeave={(e: ui.PointerEvent) => leave()} onClick={() => transition(HoverState.Open)}>{renderSlot(props.trigger)}</Button>
    <View ref={panel} role="region" aria-label={props.label} hidden={state === HoverState.Open || state === HoverState.Grace ? 0 : 1} className={`flex-col gap-3 p-4 w-[${props.width ?? 288}px] ${look().panel} border border-${theme().border} bg-${theme().card} ${props.className ?? ''}`}
      onPointerEnter={(e: ui.PointerEvent) => transition(HoverState.Open)} onPointerLeave={(e: ui.PointerEvent) => leave()}>{props.children()}</View>
  </View>;
  ui.openLayer(panel.node, { priority: 100, motion: 'scale', duration: 280 });
  ui.anchor(panel.node, trigger.node, props.placement ?? 'bottom-start', 6);
  ui.focusScope(panel.node, { trap: false, restore: true, autoFocus: false });
  const releaseTrigger = ui.onFocusWithin(trigger.node, (on: boolean) => { if (on) transition(HoverState.Open); else leave(); });
  const releasePanel = ui.onFocusWithin(panel.node, (on: boolean) => { if (on) transition(HoverState.Open); else leave(); });
  ui.onDismiss(panel.node, () => transition(HoverState.Closed));
  ui.onOutsidePointer(panel.node, (e: ui.PointerEvent) => transition(HoverState.Closed), trigger.node);
  if (state === HoverState.Waiting || state === HoverState.Grace) { const pending = state; timer = ui.alarm(deadline.current, () => transition(pending === HoverState.Waiting ? HoverState.Open : HoverState.Closed)); }
  onCleanup(() => { releaseTrigger(); releasePanel(); transition(HoverState.Disposed); });
  return node;
}

// ---------------------------------------------------------------- Confirmation
export interface ConfirmPopoverProps { label: string; title: string; description?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean; onConfirm: () => void; placement?: string; width?: number }
/** The focused confirmation accepts Enter; Escape/outside cancels and restores the invoker. */
export function ConfirmPopover(props: ConfirmPopoverProps): i32 {
  const trigger = createNodeRef(), panel = createNodeRef();
  const open = componentRef(false);
  const setOpen = (on: boolean): void => { open.current = on; show(panel.node, on); };
  const accept = (): void => { setOpen(false); props.onConfirm(); };
  const node = <View className="flex-col">
    <View ref={trigger}><KitButton label={props.label} variant="outline" onClick={() => setOpen(!open.current)} /></View>
    <View ref={panel} hidden={open.current ? 0 : 1} role="dialog" aria-label={props.title} aria-description={props.description ?? ''} className={`flex-col gap-3 p-4 w-[${props.width ?? 288}px] ${look().panel} border border-${theme().border} bg-${theme().card}`}>
      <Text className={`text-[15px] font-medium text-${theme().foreground}`}>{props.title}</Text>
      <Text className={`text-[13px] text-${theme().mutedForeground}`}>{props.description ?? ''}</Text>
      <View className="flex-row gap-2 justify-end">
        <KitButton label={props.confirmLabel ?? 'Confirm'} variant={props.destructive === true ? 'destructive' : 'default'} onClick={accept} />
        <KitButton label={props.cancelLabel ?? 'Cancel'} variant="outline" onClick={() => setOpen(false)} />
      </View>
    </View>
  </View>;
  attach(panel.node, trigger.node, props.placement ?? 'bottom-start', false, () => setOpen(false));
  return node;
}

// ---------------------------------------------------------------- Toast stack
enum ToastState { Running, Paused, Closed }
enum StackState { Collapsed, Expanded }
class ToastEntry {
  node: i32; serial: i32; state: ToastState = ToastState.Running;
  timer: i32 = -1; remaining: number; deadline: number = 0;
  constructor(node: i32, duration: number) { this.node = node; this.serial = ui.nodeSerial(node); this.remaining = duration; }
}
export interface ToastOptions { tone?: string; action?: string; onAction?: () => void }
let toaster: i32 = -1, toasterSerial: i32 = 0;
const toasts: ToastEntry[] = [];
let stackState = StackState.Collapsed;
function layoutToasts(): void {
  for (let i = 0; i < toasts.length; i++) {
    const entry = toasts[i];
    if (ui.nodeSerial(entry.node) === entry.serial) ui.setNumber(entry.node, 'maxHeight', stackState === StackState.Expanded || i === toasts.length - 1 ? 100000 : 16);
  }
}
function toastTransition(entry: ToastEntry, next: ToastState): void {
  if (entry.state === ToastState.Closed) return;
  if (entry.timer >= 0) ui.cancelAlarm(entry.timer);
  entry.timer = -1;
  if (entry.state === ToastState.Running && entry.remaining >= 0) entry.remaining = Math.max(0, entry.deadline - ui.now());
  entry.state = next;
  if (next === ToastState.Closed) {
    const i = toasts.indexOf(entry);
    if (i >= 0) toasts.splice(i, 1);
    if (ui.nodeSerial(entry.node) === entry.serial) ui.destroy(entry.node);
    layoutToasts();
    return;
  }
  if (next === ToastState.Running && entry.remaining >= 0) {
    entry.deadline = ui.now() + entry.remaining;
    entry.timer = ui.alarm(entry.deadline, () => toastTransition(entry, ToastState.Closed));
  }
}
/** Dismisses every kit toast, cancelling their owned timers. Useful when a window or session closes. */
export function clearToasts(): void { for (const entry of toasts.slice()) toastTransition(entry, ToastState.Closed); }
/** Newest in front. Hover/focus expands the stack and pauses expiry; drag sideways to dismiss. Negative duration persists. */
export function toast(title: string, description: string = '', ms: number = 4000, options: ToastOptions = {}): void {
  if (ui.nodeSerial(toaster) !== toasterSerial || toaster < 0) {
    clearToasts();
    toaster = ui.createNode(ui.VIEW);
    toasterSerial = ui.nodeSerial(toaster);
    stackState = StackState.Collapsed;
    ui.setClass(toaster, 'flex-col-reverse gap-0 right-4 bottom-4 w-[340px]');
    ui.openLayer(toaster, { priority: 400 });
    const expand = (on: boolean): void => {
      const host = ui.inspectNode(toaster);
      on = on || (host !== null && host.hovered) || ui.hasFocusWithin(toaster);
      stackState = on ? StackState.Expanded : StackState.Collapsed;
      ui.setClass(toaster, `flex-col-reverse ${on ? 'gap-2' : 'gap-0'} right-4 bottom-4 w-[340px]`);
      layoutToasts();
      for (const entry of toasts) toastTransition(entry, on ? ToastState.Paused : ToastState.Running);
    };
    ui.onPointer(toaster, ui.PENTER, (e: ui.PointerEvent) => expand(true));
    ui.onPointer(toaster, ui.PLEAVE, (e: ui.PointerEvent) => expand(false));
    ui.onFocusWithin(toaster, expand);
  }
  const tone = options.tone ?? 'default';
  const color = tone === 'destructive' || tone === 'error' ? theme().destructive : tone === 'success' ? theme().success : tone === 'warning' ? theme().warningSoftForeground : theme().foreground;
  let entry: ToastEntry | null = null;
  const close = (): void => { if (entry !== null) toastTransition(entry as ToastEntry, ToastState.Closed); };
  const toastNode = createNodeRef();
  const n = <View ref={toastNode} role={tone === 'error' || tone === 'destructive' ? 'alert' : 'status'} className={`flex-col gap-2 p-4 overflow-hidden ${look().dialog} border border-${theme().border} bg-${theme().card}`} grab="keep-x"
    onDrag={(e: ui.PointerEvent) => { if (e.phase === 1) ui.setNumber(toastNode.node, 'translateX', e.dx); else if (e.phase === 2 && Math.abs(e.dx) > 80) close(); else if (e.phase >= 2) ui.setNumber(toastNode.node, 'translateX', 0); }}>
    <View className="flex-row gap-3 items-start">
      <View className="flex-col grow shrink min-w-0 gap-1">
        <Text className={`text-[13px] font-medium text-${color}`}>{tone === 'error' || tone === 'destructive' ? '! ' : tone === 'success' ? '✓ ' : tone === 'warning' ? '! ' : ''}{title}</Text>
        <Text className={`text-[13px] text-${theme().mutedForeground}`} hidden={description.length > 0 ? 0 : 1}>{description}</Text>
      </View>
      <KitButton label="Dismiss" variant="ghost" size="sm" onClick={close} />
    </View>
    <Show when={options.action !== undefined}><KitButton label={options.action ?? ''} variant="outline" size="sm" onClick={() => { if (options.onAction !== undefined) options.onAction(); close(); }} /></Show>
  </View>;
  const item = new ToastEntry(n, ms);
  entry = item;
  ui.insert(toaster, n, -1);
  toasts.push(item);
  // The first deadline is initialized before Running can pause and account for elapsed time.
  item.deadline = ui.now() + ms;
  toastTransition(item, stackState === StackState.Expanded ? ToastState.Paused : ToastState.Running);
  layoutToasts();
}

// ---------------------------------------------------------------- Guided tour
export interface TourStep { title: string; body: string; target?: () => i32; placement?: string; width?: number; padding?: number; blockTarget?: boolean; nextLabel?: string; backLabel?: string }
export interface GuidedTourProps { open: () => boolean; step: () => i32; onStepChange: (step: i32) => void; onOpenChange: (open: boolean) => void; steps: TourStep[]; doneLabel?: string; closeLabel?: string }
function TourPanel(props: { tour: GuidedTourProps; item: TourStep; index: i32 }): i32 {
  const p = props.tour, step = props.item;
  const panel = createNodeRef(), shade = createNodeRef();
  const blockers = [createNodeRef(), createNodeRef(), createNodeRef(), createNodeRef()];
  const active = (): boolean => p.open() && p.step() === props.index;
  const target = step.target !== undefined ? step.target() : -1;
  const serial = ui.nodeSerial(target);
  const advance = (): void => { if (props.index + 1 >= p.steps.length) p.onOpenChange(false); else p.onStepChange(props.index + 1); };
  const node = <View>
    <View ref={shade} hidden={active() ? 0 : 1} className="absolute inset-0">
    <Canvas className="absolute inset-0 pointer-events-none" onDraw={(x: i32, y: i32, w: i32, h: i32) => {
      if (target < 0 || ui.nodeSerial(target) !== serial) { rrect(0, 0, w, h, 0, 0, 100); return; }
      const box = ui.screenBox(target), pad = step.padding ?? 6;
      const left = Math.max(0, box[0] - pad), top = Math.max(0, box[1] - pad), right = Math.min(w, box[0] + box[2] + pad), bottom = Math.min(h, box[1] + box[3] + pad);
      rrect(0, 0, w, top, 0, 0, 100); rrect(0, bottom, w, h - bottom, 0, 0, 100);
      rrect(0, top, left, bottom - top, 0, 0, 100); rrect(right, top, w - right, bottom - top, 0, 0, 100);
    }} />
    {blockers.map((block: NodeRef) => <View ref={block} className="absolute" onPointerDown={(e: ui.PointerEvent) => {}} />)}
    </View>
    <View ref={panel} hidden={active() ? 0 : 1} role="dialog" aria-modal={step.blockTarget === true ? 'true' : 'false'} aria-label={step.title} className={`flex-col gap-3 p-4 w-[${step.width ?? 320}px] ${look().panel} border border-${theme().border} bg-${theme().card}`}
      onKeyDown={(e: ui.KeyEvent) => {
        if (e.key === 'ArrowRight') { advance(); e.preventDefault(); }
        else if (e.key === 'ArrowLeft' && props.index > 0) { p.onStepChange(props.index - 1); e.preventDefault(); }
      }}>
      <Text className={`text-[11px] tabular-nums text-${theme().mutedForeground}`}>{props.index + 1} of {p.steps.length}</Text>
      <Text className={`text-[15px] font-medium text-${theme().foreground}`}>{step.title}</Text>
      <Text className={`text-[13px] text-${theme().mutedForeground}`}>{step.body}</Text>
      <View className="flex-row gap-2 flex-wrap">
        <KitButton label={props.index + 1 === p.steps.length ? p.doneLabel ?? 'Done' : step.nextLabel ?? 'Next'} onClick={advance} />
        <KitButton label={step.backLabel ?? 'Back'} disabled={props.index === 0} variant="outline" onClick={() => p.onStepChange(props.index - 1)} />
        <KitButton label={p.closeLabel ?? 'Close tour'} variant="ghost" onClick={() => p.onOpenChange(false)} />
      </View>
    </View>
  </View>;
  ui.openLayer(shade.node, { priority: 240 });
  ui.openLayer(panel.node, { priority: 250, modal: step.blockTarget === true, motion: 'scale', duration: 280 });
  if (target >= 0) ui.anchor(panel.node, target, step.placement ?? 'bottom', 12);
  const follow = (): void => {
    if (!active()) return;
    const valid = target >= 0 && ui.nodeSerial(target) === serial;
    const box = valid ? ui.screenBox(target) : [0, 0, 0, 0];
    const pad = step.padding ?? 6;
    const left = valid ? Math.max(0, box[0] - pad) : 0, top = valid ? Math.max(0, box[1] - pad) : height();
    const right = valid ? Math.min(width(), box[0] + box[2] + pad) : width(), bottom = valid ? Math.min(height(), box[1] + box[3] + pad) : height();
    const boxes = [[0, 0, width(), top], [0, bottom, width(), height() - bottom], [0, top, left, bottom - top], [right, top, width() - right, bottom - top]];
    for (let i = 0; i < blockers.length; i++) {
      const h = blockers[i].node, b = boxes[i];
      if (ui.getNumber(h, 'left') !== b[0]) ui.setNumber(h, 'left', b[0]);
      if (ui.getNumber(h, 'top') !== b[1]) ui.setNumber(h, 'top', b[1]);
      if (ui.getNumber(h, 'width') !== b[2]) ui.setNumber(h, 'width', b[2]);
      if (ui.getNumber(h, 'height') !== b[3]) ui.setNumber(h, 'height', b[3]);
    }
    if (!valid) {
      ui.unanchor(panel.node);
      const b = ui.screenBox(panel.node), x = (width() - b[2]) / 2, y = (height() - b[3]) / 2;
      if (ui.getNumber(panel.node, 'left') !== x) ui.setNumber(panel.node, 'left', x);
      if (ui.getNumber(panel.node, 'top') !== y) ui.setNumber(panel.node, 'top', y);
    }
  };
  ui.addWatcher(follow);
  onCleanup(() => ui.removeWatcher(follow));
  ui.focusScope(panel.node, { trap: step.blockTarget === true, restore: true, autoFocus: true });
  ui.onDismiss(panel.node, () => p.onOpenChange(false));
  return node;
}
/** Controlled walkthrough; a spotlight leaves its target usable unless the step explicitly blocks it. */
export function GuidedTour(props: GuidedTourProps): i32 {
  return <View>{props.steps.map((step: TourStep, index: i32) => <TourPanel tour={props} item={step} index={index} />)}</View>;
}
