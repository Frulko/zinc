/** @jsxHelpers ./host */
// zinc:ui/nuxt, overlays (ZN-357.03): Modal, Slideover, DropdownMenu, Tooltip and toasts with Nuxt UI 4's look (docs/reports/nuxt-ui-research.md 3.13 to 3.17),
// on zinc:ui's layers: each overlay stays mounted and toggles `hidden`, Escape and a press outside close it, a modal keeps the focus inside.
import * as ui from 'zinc:ui';
import { createNodeRef } from 'zinc:ui/solid';
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
  class?: string; children?: () => i32; footer?: () => i32;
};
function renderHeader(p: ModalProps): i32 {
  return <View class={`flex-row items-start gap-1.5 px-6 py-4 min-h-[64px] border-b border-${hex(theme().border)}`}>
    <View class="flex-col grow">
      <Show when={p.title !== undefined}><Text class={`font-semibold text-${hex(theme().textHighlighted)}`}>{p.title ?? ''}</Text></Show>
      <Show when={p.description !== undefined}><Text class={`mt-1 text-sm text-${hex(theme().textMuted)}`}>{p.description ?? ''}</Text></Show>
    </View>
    <Show when={p.close ?? true}><Button icon="x" color="neutral" variant="ghost" size="md" onClick={() => p.onUpdate(false)} /></Show>
  </View>;
}
/** Nuxt UI's UModal: a 512 px panel over the page dimmed with bg-elevated/75; Escape, a press outside (dismissible) and the close button ask onUpdate(false). */
export function Modal(p: ModalProps): i32 {
  const screen = createNodeRef(), panel = createNodeRef();
  const ask = (): void => { if (p.dismissible ?? true) p.onUpdate(false); };
  const full = p.fullscreen ?? false;
  const node = <View ref={screen} class={`absolute left-0 top-0 right-0 bottom-0 ${full ? '' : 'items-center justify-center p-4'}`} hidden={p.open() ? 0 : 1}>
    <View ref={panel} class={`flex-col bg-${hex(theme().bg)} ${full ? 'w-full h-full' : 'w-[512px] ' + rounded('lg') + ' shadow-lg border border-' + hex(theme().border)} ${p.class ?? ''}`}>
      {renderHeader(p)}
      <View class="flex-col p-6 gap-3">{renderSlot(p.children)}</View>
      <Show when={p.footer !== undefined}><View class={`flex-row items-center justify-end gap-1.5 px-6 py-4 border-t border-${hex(theme().border)}`}>{renderSlot(p.footer)}</View></Show>
    </View>
  </View>;
  ui.openLayer(screen.node, { priority: 200, modal: true, backdrop: rgb(theme().bgElevated), backdropAlpha: 191 });
  ui.focusScope(screen.node, { trap: true, restore: true, autoFocus: true });
  ui.onDismiss(screen.node, ask);
  ui.onOutsidePointer(panel.node, (e: ui.PointerEvent) => ask());
  return node;
}

export type SlideoverProps = {
  open: () => boolean; onUpdate: (open: boolean) => void; title?: string; description?: string; side?: string; close?: boolean; dismissible?: boolean;
  class?: string; children?: () => i32; footer?: () => i32;
};
/** Nuxt UI's USlideover: a panel against one side (right by default, 448 px wide on the sides), the rest dimmed; it closes like a Modal. */
export function Slideover(p: SlideoverProps): i32 {
  const screen = createNodeRef(), panel = createNodeRef();
  const side = p.side ?? 'right';
  const ask = (): void => { if (p.dismissible ?? true) p.onUpdate(false); };
  const place = side === 'left' ? 'left-0 top-0 bottom-0 w-[448px]' : side === 'top' ? 'left-0 right-0 top-0' : side === 'bottom' ? 'left-0 right-0 bottom-0' : 'right-0 top-0 bottom-0 w-[448px]';
  const mp: ModalProps = { open: p.open, onUpdate: p.onUpdate, title: p.title, description: p.description, close: p.close };
  const node = <View ref={screen} class="absolute left-0 top-0 right-0 bottom-0" hidden={p.open() ? 0 : 1}>
    <View ref={panel} class={`absolute flex-col bg-${hex(theme().bg)} shadow-lg border-${hex(theme().border)} ${side === 'left' ? 'border-r' : side === 'top' ? 'border-b' : side === 'bottom' ? 'border-t' : 'border-l'} ${place} ${p.class ?? ''}`}>
      {renderHeader(mp)}
      <View class="flex-col grow p-6 gap-3 overflow-auto">{renderSlot(p.children)}</View>
      <Show when={p.footer !== undefined}><View class={`flex-row items-center gap-1.5 px-6 py-4 border-t border-${hex(theme().border)}`}>{renderSlot(p.footer)}</View></Show>
    </View>
  </View>;
  ui.openLayer(screen.node, { priority: 200, modal: true, backdrop: rgb(theme().bgElevated), backdropAlpha: 191 });
  ui.focusScope(screen.node, { trap: true, restore: true, autoFocus: true });
  ui.onDismiss(screen.node, ask);
  ui.onOutsidePointer(panel.node, (e: ui.PointerEvent) => ask());
  return node;
}

// ---------------------------------------------------------------- DropdownMenu
/** An entry of a menu: an action (label, icon, color, kbds, onSelect), a `type: 'label'` heading, or a checkbox (`type: 'checkbox'` with checked). */
export type DropdownMenuItem = { label?: string; icon?: string; color?: string; kbds?: string[]; type?: string; checked?: () => boolean; disabled?: boolean; onSelect?: () => void };
export type DropdownMenuProps = { items: DropdownMenuItem[][]; label?: string; icon?: string; color?: string; variant?: string; size?: string; placement?: string; class?: string };
/** Nuxt UI's UDropdownMenu: a Button that opens groups of items (separated by a line) under it; Escape, a press outside or a choice close it. */
export function DropdownMenu(p: DropdownMenuProps): i32 {
  const trig = createNodeRef(), menu = createNodeRef();
  const size = p.size ?? 'md';
  const text = size === 'xs' || size === 'sm' ? 'text-xs' : size === 'xl' ? 'text-base' : 'text-sm';
  const row = (it: DropdownMenuItem): i32 => {
    const t = theme();
    if (it.type === 'label') return <Text class={`p-1.5 ${text} font-semibold text-${hex(t.textHighlighted)}`}>{it.label ?? ''}</Text>;
    const col = it.color !== undefined ? t.color(it.color as string) : t.text;
    const ink = (): i32 => rgb(it.color !== undefined ? theme().color(it.color as string) : theme().textDimmed);
    return <View class={`flex-row items-center gap-1.5 p-1.5 ${rounded('md')} ${it.disabled === true ? 'opacity-75' : 'hover:bg-' + (it.color !== undefined ? hex(mix(col, 10, theme().bg)) : hex(mix(t.bgElevated, 50, theme().bg)))}`}
      onClick={() => { if (it.disabled === true) return; show(menu.node, false); const f = it.onSelect; if (f !== undefined) f(); }} role="menuitem">
      <Show when={it.icon !== undefined}><Icon name={it.icon ?? ''} size={buttonIconSize(size)} color={ink} /></Show>
      <Text class={`grow ${text} text-${hex(col)}`}>{it.label ?? ''}</Text>
      <Show when={it.type === 'checkbox' && it.checked !== undefined && (it.checked as () => boolean)()}><Icon name="check" size={16} color={ink} /></Show>
      <Show when={it.kbds !== undefined}><Text class={`text-xs px-1 ${rounded('sm')} bg-${hex(t.bgElevated)} text-${hex(t.textMuted)}`}>{(it.kbds ?? []).join(' ')}</Text></Show>
    </View>;
  };
  const node = <View class={`flex-col ${p.class ?? ''}`}>
    <View ref={trig} class="flex-row"><Button label={p.label} icon={p.icon} trailingIcon="chevron-down" color={p.color ?? 'neutral'} variant={p.variant ?? 'outline'} size={size}
      onClick={() => show(menu.node, !shown(menu.node))} /></View>
    <View ref={menu} hidden={1} class={`flex-col min-w-[128px] w-[208px] shadow-lg overflow-hidden ${rounded('md')} bg-${hex(theme().bg)} border border-${hex(theme().border)}`} role="menu">
      <For each={p.items}>{(group: DropdownMenuItem[], g: i32) => <View class={`flex-col p-1 ${g > 0 ? 'border-t border-' + hex(theme().border) : ''}`}>
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
export type TooltipProps = { text: string; kbds?: string[]; placement?: string; delay?: number; class?: string; children: () => i32 };
/** Nuxt UI's UTooltip: 24 px high, 12 px text, bg-default with a ring, under its children (side bottom, 8 px) after 700 ms of hover. */
export function Tooltip(p: TooltipProps): i32 {
  const wrap = createNodeRef(), tip = createNodeRef();
  let timer: i32 = -1;
  const node = <View ref={wrap} class={`flex-col ${p.class ?? ''}`}
    onPointerEnter={(e: ui.PointerEvent) => { if (timer >= 0) clearTimeout(timer); timer = setTimeout(() => { timer = -1; show(tip.node, true); }, p.delay ?? 700); }}
    onPointerLeave={(e: ui.PointerEvent) => { if (timer >= 0) clearTimeout(timer); timer = -1; show(tip.node, false); }}>
    {p.children()}
    <View ref={tip} hidden={1} class={`flex-row items-center gap-1 h-[24px] px-2.5 shadow-sm ${rounded('sm')} bg-${hex(theme().bg)} border border-${hex(theme().border)}`} role="tooltip">
      <Text class={`text-xs text-${hex(theme().textHighlighted)}`}>{p.text}</Text>
      <Show when={p.kbds !== undefined}><Text class={`text-xs text-${hex(theme().textMuted)}`}>{(p.kbds ?? []).join(' · ')}</Text></Show>
    </View>
  </View>;
  ui.openLayer(tip.node, { priority: 300 });
  ui.anchor(tip.node, wrap.node, p.placement ?? 'bottom', 8);
  return node;
}
/** Shows the tooltip of a Tooltip node at once (tests, screenshots). */
export function showTooltip(tooltip: i32, on: boolean): void { const n = ui.inspectNode(unwrap(tooltip)); if (n !== null && n.children.length > 1) show(n.children[n.children.length - 1], on); }

// ---------------------------------------------------------------- toasts
export type ToastOptions = { title?: string; description?: string; icon?: string; color?: string; duration?: number; progress?: boolean; actions?: string[]; onAction?: (label: string) => void };
let toaster: i32 = -1;
const live: i32[] = [];
/** Nuxt UI's useToast().add: a toast at the bottom right (384 px wide, at most 5, newest last) for `duration` ms (5000) with a progress bar, a close button
 *  and optional action buttons. */
export function addToast(o: ToastOptions): void {
  if (toaster < 0) {
    toaster = ui.createNode(ui.VIEW);
    ui.setClass(toaster, 'flex-col gap-2 right-4 bottom-4 w-[384px]');
    ui.openLayer(toaster, { priority: 400 });
  }
  if (live.length >= 5) { ui.remove(toaster, live[0]); live.splice(0, 1); }
  const t = theme(), ms = o.duration ?? 5000, color = o.color ?? 'primary';
  const bar = createNodeRef();
  let n: i32 = -1;
  const close = (): void => { const i = live.indexOf(n); if (i < 0) return; live.splice(i, 1); ui.remove(toaster, n); };
  n = <View class={`relative flex-row gap-2.5 p-4 overflow-hidden shadow-lg ${rounded('lg')} bg-${hex(t.bg)} border border-${hex(t.border)}`} role="status">
    <Show when={o.icon !== undefined}><Icon name={o.icon ?? ''} size={20} color={() => rgb(color === 'neutral' ? theme().textHighlighted : theme().color(color))} /></Show>
    <View class="flex-col grow">
      <Show when={o.title !== undefined}><Text class={`text-sm font-medium text-${hex(t.textHighlighted)}`}>{o.title ?? ''}</Text></Show>
      <Show when={o.description !== undefined}><Text class={`text-sm text-${hex(t.textMuted)} ${o.title !== undefined ? 'mt-1' : ''}`}>{o.description ?? ''}</Text></Show>
      <Show when={o.actions !== undefined}><View class="flex-row gap-1.5 mt-2.5">
        <For each={o.actions ?? []}>{(a: string, i: i32) => <Button label={a} size="xs" color={color} onClick={() => { const f = o.onAction; if (f !== undefined) f(a); close(); }} />}</For>
      </View></Show>
    </View>
    <Button icon="x" color="neutral" variant="link" size="sm" onClick={close} />
    <Show when={o.progress ?? true}><View ref={bar} class={`absolute left-0 bottom-0 h-[4px] w-[384px] bg-${hex(color === 'neutral' ? t.bgInverted : t.color(color))}`} /></Show>
  </View>;
  ui.insert(toaster, n, -1);
  live.push(n);
  if (bar.node >= 0) ui.animate(bar.node, 'width', 0, ms, 'linear', 0);
  setTimeout(close, ms);
}
/** The toasts on screen (tests). */
export function toastCount(): i32 { return live.length; }
