/** @jsxHelpers zinc:ui/nuxt/host */
// zinc:ui/nuxt, overlays (ZN-357.03): Modal, Slideover, DropdownMenu, Tooltip and toasts with Nuxt UI 4's look (docs/reports/nuxt-ui-research.md 3.13 to 3.17),
// on zinc:ui's layers: each overlay stays mounted and toggles `hidden`, Escape and a press outside close it, a modal keeps the focus inside.
import * as ui from 'zinc:ui';
import { createNodeRef, createSubtree } from 'zinc:ui/solid';
import { theme, hex, mix, rounded } from './theme';
import { rgb, buttonIconSize } from './variants';
import { renderSlot } from './host';
import { Button } from './controls';
import { Icon } from 'zinc:icons';

function shown(h: i32): boolean { const n = ui.inspectNode(h); return n !== null && !n.hidden; }
function show(h: i32, on: boolean): void { if (h >= 0) ui.setNumber(h, 'hidden', on ? 0 : 1); }
/** The node a component returned, through the fragment its caller may have wrapped it in. */
function unwrap(h: i32): i32 { let k = h; for (;;) { const n = ui.inspectNode(k); if (n === null || n.tag !== ui.FRAGMENT || n.children.length !== 1) return k; k = n.children[0]; } }

// ---------------------------------------------------------------- Modal, Slideover
export type ModalProps = {
  open: () => boolean; onUpdate: (open: boolean) => void; title?: string; description?: string; close?: boolean; dismissible?: boolean; fullscreen?: boolean;
  className?: string; children?: () => i32; footer?: () => i32;
};
function renderHeader(p: ModalProps): i32 {
  return <View className={`flex-row items-start gap-1.5 px-6 py-4 min-h-[64px] border-b border-${hex(theme().border)}`}>
    <View className="flex-col grow">
      <Show when={p.title !== undefined}><Text className={`font-semibold text-${hex(theme().textHighlighted)}`}>{p.title ?? ''}</Text></Show>
      <Show when={p.description !== undefined}><Text className={`mt-1 text-sm text-${hex(theme().textMuted)}`}>{p.description ?? ''}</Text></Show>
    </View>
    <Show when={p.close ?? true}><Button icon="x" color="neutral" variant="ghost" size="md" onClick={() => p.onUpdate(false)} /></Show>
  </View>;
}
/** Nuxt UI's UModal: a 512 px panel over the page dimmed with bg-elevated/75; Escape, a press outside (dismissible) and the close button ask onUpdate(false).
 *  The dim fades in and out, the panel fades and grows from 96%. */
export function Modal(p: ModalProps): i32 {
  const screen = createNodeRef(), panel = createNodeRef();
  const ask = (): void => { if (p.dismissible ?? true) p.onUpdate(false); };
  const full = p.fullscreen ?? false;
  const node = <View ref={screen} className={`absolute left-0 top-0 right-0 bottom-0 ${full ? '' : 'items-center justify-center p-4'}`} hidden={p.open() ? 0 : 1}>
    <View ref={panel} className={`flex-col bg-${hex(theme().bg)} ${full ? 'w-full h-full' : 'w-[512px] ' + rounded('lg') + ' shadow-lg border border-' + hex(theme().border)} ${p.className ?? ''}`}>
      {renderHeader(p)}
      <View className="flex-col p-6 gap-3">{renderSlot(p.children)}</View>
      <Show when={p.footer !== undefined}><View className={`flex-row items-center justify-end gap-1.5 px-6 py-4 border-t border-${hex(theme().border)}`}>{renderSlot(p.footer)}</View></Show>
    </View>
  </View>;
  ui.openLayer(screen.node, { priority: 200, modal: true, backdrop: rgb(theme().bgElevated), backdropAlpha: 191, motion: full ? 'fade' : 'scale' });
  ui.focusScope(screen.node, { trap: true, restore: true, autoFocus: true });
  ui.onDismiss(screen.node, ask);
  ui.onOutsidePointer(panel.node, (e: ui.PointerEvent) => ask());
  return node;
}

export type SlideoverProps = {
  open: () => boolean; onUpdate: (open: boolean) => void; title?: string; description?: string; side?: string; close?: boolean; dismissible?: boolean;
  className?: string; children?: () => i32; footer?: () => i32;
};
/** Nuxt UI's USlideover: a panel against one side (right by default, 448 px wide on the sides), the rest dimmed; it closes like a Modal. */
export function Slideover(p: SlideoverProps): i32 {
  const screen = createNodeRef(), panel = createNodeRef();
  const side = p.side ?? 'right';
  const ask = (): void => { if (p.dismissible ?? true) p.onUpdate(false); };
  const place = side === 'left' ? 'left-0 top-0 bottom-0 w-[448px]' : side === 'top' ? 'left-0 right-0 top-0' : side === 'bottom' ? 'left-0 right-0 bottom-0' : 'right-0 top-0 bottom-0 w-[448px]';
  const mp: ModalProps = { open: p.open, onUpdate: p.onUpdate, title: p.title, description: p.description, close: p.close };
  const node = <View ref={screen} className="absolute left-0 top-0 right-0 bottom-0" hidden={p.open() ? 0 : 1}>
    <View ref={panel} className={`absolute flex-col bg-${hex(theme().bg)} shadow-lg border-${hex(theme().border)} ${side === 'left' ? 'border-r' : side === 'top' ? 'border-b' : side === 'bottom' ? 'border-t' : 'border-l'} ${place} ${p.className ?? ''}`}>
      {renderHeader(mp)}
      <View className="flex-col grow p-6 gap-3 overflow-auto">{renderSlot(p.children)}</View>
      <Show when={p.footer !== undefined}><View className={`flex-row items-center gap-1.5 px-6 py-4 border-t border-${hex(theme().border)}`}>{renderSlot(p.footer)}</View></Show>
    </View>
  </View>;
  ui.openLayer(screen.node, { priority: 200, modal: true, backdrop: rgb(theme().bgElevated), backdropAlpha: 191, motion: `slide-${side}`, duration: 220 });   // the panel slides, the dim fades
  ui.focusScope(screen.node, { trap: true, restore: true, autoFocus: true });
  ui.onDismiss(screen.node, ask);
  ui.onOutsidePointer(panel.node, (e: ui.PointerEvent) => ask());
  return node;
}

// ---------------------------------------------------------------- DropdownMenu
/** An entry of a menu: an action (label, icon, color, kbds, onSelect), a `type: 'label'` heading, or a checkbox (`type: 'checkbox'` with checked). */
export type DropdownMenuItem = { label?: string; icon?: string; color?: string; kbds?: string[]; type?: string; checked?: () => boolean; disabled?: boolean; onSelect?: () => void };
export type DropdownMenuProps = { items: DropdownMenuItem[][]; label?: string; icon?: string; color?: string; variant?: string; size?: string; placement?: string; className?: string };
/** Nuxt UI's UDropdownMenu: a Button that opens groups of items (separated by a line) under it; Escape, a press outside or a choice close it. */
export function DropdownMenu(p: DropdownMenuProps): i32 {
  const trig = createNodeRef(), menu = createNodeRef();
  const size = p.size ?? 'md';
  const text = size === 'xs' || size === 'sm' ? 'text-xs' : size === 'xl' ? 'text-base' : 'text-sm';
  const row = (it: DropdownMenuItem): i32 => {
    const t = theme();
    if (it.type === 'label') return <Text className={`p-1.5 ${text} font-semibold text-${hex(t.textHighlighted)}`}>{it.label ?? ''}</Text>;
    const col = it.color !== undefined ? t.color(it.color as string) : t.text;
    const ink = (): i32 => rgb(it.color !== undefined ? theme().color(it.color as string) : theme().textDimmed);
    return <View className={`flex-row items-center gap-1.5 p-1.5 ${rounded('md')} ${it.disabled === true ? 'opacity-75' : 'hover:bg-' + (it.color !== undefined ? hex(mix(col, 10, theme().bg)) : hex(mix(t.bgElevated, 50, theme().bg)))}`}
      onClick={() => { if (it.disabled === true) return; show(menu.node, false); const f = it.onSelect; if (f !== undefined) f(); }} role="menuitem">
      <Show when={it.icon !== undefined}><Icon name={it.icon ?? ''} size={buttonIconSize(size)} color={ink} /></Show>
      <Text className={`grow ${text} text-${hex(col)}`}>{it.label ?? ''}</Text>
      <Show when={it.type === 'checkbox' && it.checked !== undefined && (it.checked as () => boolean)()}><Icon name="check" size={16} color={ink} /></Show>
      <Show when={it.kbds !== undefined}><Text className={`text-xs px-1 ${rounded('sm')} bg-${hex(t.bgElevated)} text-${hex(t.textMuted)}`}>{(it.kbds ?? []).join(' ')}</Text></Show>
    </View>;
  };
  const node = <View className={`flex-col ${p.className ?? ''}`}>
    <View ref={trig} className="flex-row"><Button label={p.label} icon={p.icon} trailingIcon="chevron-down" color={p.color ?? 'neutral'} variant={p.variant ?? 'outline'} size={size}
      onClick={() => show(menu.node, !shown(menu.node))} /></View>
    <View ref={menu} hidden={1} className={`flex-col min-w-[128px] w-[208px] shadow-lg overflow-hidden ${rounded('md')} bg-${hex(theme().bg)} border border-${hex(theme().border)}`} role="menu">
      <For each={p.items}>{(group: DropdownMenuItem[], g: i32) => <View className={`flex-col p-1 ${g > 0 ? 'border-t border-' + hex(theme().border) : ''}`}>
        <For each={group}>{(it: DropdownMenuItem, i: i32) => row(it)}</For>
      </View>}</For>
    </View>
  </View>;
  ui.openLayer(menu.node, { priority: 100 });
  ui.anchor(menu.node, trig.node, p.placement ?? 'bottom-start', 8);
  ui.focusScope(menu.node, { trap: false, restore: true, autoFocus: true });
  ui.onDismiss(menu.node, () => show(menu.node, false));
  ui.onOutsidePointer(menu.node, (e: ui.PointerEvent) => show(menu.node, false), trig.node);
  return node;
}
/** Whether the menu of a DropdownMenu (the node it returned, or a fragment around it) is open (tests). */
export function isMenuOpen(dropdown: i32): boolean { const n = ui.inspectNode(unwrap(dropdown)); return n !== null && n.children.length > 1 && shown(n.children[1]); }

// ---------------------------------------------------------------- Tooltip
export type TooltipProps = { text: string; kbds?: string[]; placement?: string; delay?: number; className?: string; children: () => i32 };
/** Nuxt UI's UTooltip: 24 px high, 12 px text, bg-default with a ring, under its children (side bottom, 8 px) after 700 ms of hover. */
export function Tooltip(p: TooltipProps): i32 {
  const wrap = createNodeRef(), tip = createNodeRef();
  let timer: i32 = -1;
  const node = <View ref={wrap} className={`flex-col ${p.className ?? ''}`}
    onPointerEnter={(e: ui.PointerEvent) => { if (timer >= 0) clearTimeout(timer); timer = setTimeout(() => { timer = -1; show(tip.node, true); }, p.delay ?? 700); }}
    onPointerLeave={(e: ui.PointerEvent) => { if (timer >= 0) clearTimeout(timer); timer = -1; show(tip.node, false); }}>
    {p.children()}
    <View ref={tip} hidden={1} className={`flex-row items-center gap-1 h-[24px] px-2.5 shadow-sm ${rounded('sm')} bg-${hex(theme().bg)} border border-${hex(theme().border)}`} role="tooltip">
      <Text className={`text-xs text-${hex(theme().textHighlighted)}`}>{p.text}</Text>
      <Show when={p.kbds !== undefined}><Text className={`text-xs text-${hex(theme().textMuted)}`}>{(p.kbds ?? []).join(' · ')}</Text></Show>
    </View>
  </View>;
  ui.openLayer(tip.node, { priority: 300 });
  ui.anchor(tip.node, wrap.node, p.placement ?? 'bottom', 8);
  return node;
}
/** Shows the tooltip of a Tooltip node at once (tests, screenshots). */
export function showTooltip(tooltip: i32, on: boolean): void { const n = ui.inspectNode(unwrap(tooltip)); if (n !== null && n.children.length > 1) show(n.children[n.children.length - 1], on); }

// ---------------------------------------------------------------- toasts
export type ToastOptions = { title?: string; description?: string; icon?: string; color?: string; duration?: number; progress?: boolean; value?: number; actions?: string[]; onAction?: (label: string) => void };
/** value is live progress, 0..100 (clamped); negative restores the boolean expiry bar. Updates retain the deadline. */
export type ToastUpdate = { title?: string; description?: string; value?: number; actions?: string[]; onAction?: (label: string) => void };
export interface ToastHandle { update: (patch: ToastUpdate) => void; close: () => void }
enum ToastState { Running, Closed }
class ToastEntry {
  node: i32; serial: i32; state: ToastState = ToastState.Running; timer: i32 = -1;
  constructor(node: i32) { this.node = node; this.serial = ui.nodeSerial(node); }
}
let toaster: i32 = -1, toasterSerial: i32 = 0;
const live: ToastEntry[] = [];
function closeToast(entry: ToastEntry): void {
  if (entry.state === ToastState.Closed) return;
  entry.state = ToastState.Closed;
  if (entry.timer >= 0) ui.cancelAlarm(entry.timer);
  entry.timer = -1;
  const i = live.indexOf(entry); if (i >= 0) live.splice(i, 1);
  if (ui.nodeSerial(entry.node) === entry.serial) {
      const parent = ui.parentOf(entry.node);
      if (ui.nodeSerial(parent) !== 0) ui.remove(parent, entry.node); else ui.destroy(entry.node);
    }
}
export function clearToasts(): void { for (const entry of live.slice()) closeToast(entry); }
/** Bottom right, at most five. Negative duration persists; progress:boolean retains the expiry-bar meaning. */
export function addToast(o: ToastOptions): ToastHandle {
  if (toaster < 0 || ui.nodeSerial(toaster) !== toasterSerial) {
    clearToasts();
    toaster = ui.createNode(ui.VIEW); toasterSerial = ui.nodeSerial(toaster);
    ui.setClass(toaster, 'flex-col gap-2 right-4 bottom-4 w-[384px]');
    ui.openLayer(toaster, { priority: 400 });
    const owned = toaster, serial = toasterSerial;
    // React's initial effects can create the stack before ui.mount supplies its root.
    const bindRoot = (): void => {
      const root = ui.rootNode();
      if (ui.nodeSerial(root) === 0) return;
      ui.removeWatcher(bindRoot);
      ui.onDestroy(root, () => { if (ui.nodeSerial(owned) === serial) ui.destroy(owned); });
    };
    ui.onDestroy(owned, () => ui.removeWatcher(bindRoot));
    ui.addWatcher(bindRoot);
    bindRoot();
  }
  if (live.length >= 5) closeToast(live[0]);
  const t = theme(), ms = o.duration ?? 5000, color = o.color ?? 'primary';
  const bar = createNodeRef(), liveBar = createNodeRef(), heading = createNodeRef(), body = createNodeRef(), actions = createNodeRef();
  let entry: ToastEntry | null = null;
  let actionCallback = o.onAction;
  const close = (): void => { if (entry !== null) closeToast(entry as ToastEntry); };
  const content = createSubtree(() => <View className={`relative flex-row gap-2.5 p-4 overflow-hidden shadow-lg ${rounded('lg')} bg-${hex(t.bg)} border border-${hex(t.border)}`} role="status">
    <Show when={o.icon !== undefined}><Icon name={o.icon ?? ''} size={20} color={() => rgb(color === 'neutral' ? theme().textHighlighted : theme().color(color))} /></Show>
    <View className="flex-col grow">
      <Text ref={heading} className={`text-sm font-medium text-${hex(t.textHighlighted)}`}>{o.title ?? ''}</Text>
      <Text ref={body} className={`text-sm text-${hex(t.textMuted)} mt-1`}>{o.description ?? ''}</Text>
      <View ref={actions} className="flex-row gap-1.5 mt-2.5" />
    </View>
    <Button icon="x" color="neutral" variant="link" size="sm" onClick={close} />
    <View ref={bar} className={`absolute left-0 bottom-0 h-[4px] w-[384px] bg-${hex(color === 'neutral' ? t.bgInverted : t.color(color))}`} />
    <View ref={liveBar} role="progressbar" aria-label="Progress" aria-valuemin="0" aria-valuemax="100" className={`absolute left-0 bottom-0 h-[4px] w-[384px] bg-${hex(color === 'neutral' ? t.bgInverted : t.color(color))}`} />
  </View>);
  const n = content.node;
  ui.onDestroy(n, content.dispose);
  const item = new ToastEntry(n); entry = item;
  ui.onDestroy(n, close);
  ui.insert(toaster, n, -1); live.push(item);
  const update = (patch: ToastUpdate): void => {
    if (item.state === ToastState.Closed || ui.nodeSerial(n) !== item.serial) { close(); return; }
    if (patch.title !== undefined) { ui.setText(heading.node, patch.title); ui.setNumber(heading.node, 'hidden', patch.title === '' ? 1 : 0); }
    if (patch.description !== undefined) { ui.setText(body.node, patch.description); ui.setNumber(body.node, 'hidden', patch.description === '' ? 1 : 0); }
    if (patch.onAction !== undefined) actionCallback = patch.onAction;
    if (patch.actions !== undefined) {
      ui.clearChildren(actions.node);
      for (const label of patch.actions) {
        const button = createSubtree(() => <Button label={label} size="xs" color={color} onClick={() => { if (actionCallback !== undefined) actionCallback(label); close(); }} />);
        ui.onDestroy(button.node, button.dispose);
        ui.insert(actions.node, button.node, -1);
      }
      ui.setNumber(actions.node, 'hidden', patch.actions.length === 0 ? 1 : 0);
    }
    if (patch.value !== undefined) {
      ui.setNumber(bar.node, 'hidden', patch.value >= 0 || !(o.progress ?? true) ? 1 : 0);
      ui.setNumber(liveBar.node, 'hidden', patch.value < 0 ? 1 : 0);
      const value = Math.max(0, Math.min(100, Number.isFinite(patch.value) ? patch.value : 0));
      ui.setNumber(liveBar.node, 'width', 384 * value / 100);
      ui.setAttr(liveBar.node, 'aria-valuenow', String(value));
    }
  };
  const deadline = ui.now() + ms;
  update({ title: o.title ?? '', description: o.description ?? '', actions: o.actions ?? [], value: o.value ?? -1 });
  if ((o.progress ?? true) && ms >= 0) ui.animate(bar.node, 'width', 0, ms, 'linear', 0);
  if (ms >= 0) item.timer = ui.alarm(deadline, close);
  return { update: update, close: close };
}
/** The toasts on screen (tests). */
export function toastCount(): i32 { return live.length; }
