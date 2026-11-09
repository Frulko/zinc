/** @jsxHelpers zinc:ui/kit/host */
// Quiet Actions: composed from the kit's buttons, layers and focus scopes. No registration at import time.
import * as ui from 'zinc:ui';
import { setClipboardText } from 'zinc:gfx';
import { createNodeRef } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { Button as KitButton, buttonLabelColor } from './button';
import { Tooltip, DropdownMenu, MenuItem, Dialog, keyLabel } from './overlays';
import { renderSlot, onCleanup } from './host';
import { theme } from './theme';
import { springTo, SPRING_STATE } from './motion';

export function IconButton(p: { label: string; icon: string; onClick?: () => void; disabled?: boolean; pressed?: boolean; variant?: string }): i32 {
  return <Tooltip label={p.label}><KitButton size="icon" ariaLabel={p.label} variant={p.variant ?? 'ghost'} disabled={p.disabled} pressed={p.pressed} onClick={p.onClick}>
    <Icon name={p.icon} size={16} color={() => ui.tailwindColor(buttonLabelColor(p.variant ?? 'ghost', theme()))} />
  </KitButton></Tooltip>;
}

export function ButtonGroup(p: { label?: string; children: () => i32; className?: string }): i32 {
  return <View role="group" aria-label={p.label ?? ''} className={`flex-row items-center gap-1 ${p.className ?? ''}`}>{renderSlot(p.children)}</View>;
}

export function SplitButton(p: { label: string; onClick: () => void; items: MenuItem[]; disabled?: boolean }): i32 {
  return <ButtonGroup label={p.label}>
    <KitButton label={p.label} onClick={p.onClick} disabled={p.disabled} />
    <DropdownMenu label="More actions" disabled={p.disabled} items={p.items} />
  </ButtonGroup>;
}

/** Focusable actions in a group, through component boundaries; arrows never escape into a neighbouring group. */
function groupButtons(root: i32, out: i32[]): void {
  const n = ui.inspectNode(root);
  if (n === null || n.hidden || ui.isDisabled(root)) return;
  if (n.tag === ui.BUTTON) { out.push(root); return; }
  for (const child of n.children) groupButtons(child, out);
}
function moveGroupFocus(root: i32, e: ui.KeyEvent): void {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
  const buttons: i32[] = []; groupButtons(root, buttons);
  if (buttons.length === 0) return;
  const from = buttons.indexOf(ui.focused());
  const to = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (from + (e.key === 'ArrowLeft' ? buttons.length - 1 : 1)) % buttons.length;
  ui.focusNode(buttons[to]); e.preventDefault();
}

export interface ActionOption { value: string; label: string; disabled?: boolean }
export interface ToggleGroupProps {
  label: string;
  items: ActionOption[];
  value: () => string[];
  onChange: (value: string[]) => void;
  multiple?: boolean;
  className?: string;
}

/** Single selection by default; multiple selection retains order and never mutates the caller's array. */
export function ToggleGroup(p: ToggleGroupProps): i32 {
  const root = createNodeRef();
  return <View ref={root} onKeyDown={(e: ui.KeyEvent) => moveGroupFocus(root.node, e)} role="group" aria-label={p.label} className={`flex-row gap-1 ${p.className ?? ''}`}>
    {p.items.map((it: ActionOption) => <KitButton label={it.label} disabled={it.disabled}
      pressed={p.value().indexOf(it.value) >= 0} variant={p.value().indexOf(it.value) >= 0 ? 'secondary' : 'ghost'}
      onClick={() => {
        const values = p.value(), selected = values.indexOf(it.value) >= 0;
        if (p.multiple === true) p.onChange(selected ? values.filter((v: string) => v !== it.value) : values.concat([it.value]));
        else p.onChange([it.value]);
      }} />)}
  </View>;
}

export function SegmentedControl(p: { label: string; items: ActionOption[]; value: () => string; onChange: (value: string) => void }): i32 {
  const root = createNodeRef();
  return <View ref={root} role="group" aria-label={p.label} onKeyDown={(e: ui.KeyEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    const enabled = p.items.filter((it: ActionOption) => it.disabled !== true);
    if (enabled.length === 0) return;
    let i = enabled.findIndex((it: ActionOption) => it.value === p.value());
    i = e.key === 'Home' ? 0 : e.key === 'End' ? enabled.length - 1 : (i + (e.key === 'ArrowLeft' ? enabled.length - 1 : 1)) % enabled.length;
    p.onChange(enabled[i].value);
    const buttons: i32[] = []; groupButtons(root.node, buttons);
    if (i < buttons.length) ui.focusNode(buttons[i]);
    e.preventDefault();
  }} className={`flex-row p-1 gap-1 rounded-[14px] border border-${theme().border} bg-${theme().muted}`}>
    {p.items.map((it: ActionOption) => <KitButton label={it.label} variant={p.value() === it.value ? 'outline' : 'ghost'} disabled={it.disabled} onClick={() => p.onChange(it.value)} />)}
  </View>;
}

/** Success is announced in place; the caller can surface clipboard errors through onError. */
export function CopyButton(p: { text: () => string; label?: string; onError?: (error: string) => void }): i32 {
  const caption = createNodeRef();
  const copy = (): void => {
    try { setClipboardText(p.text()); ui.setText(caption.node, 'Copied'); }
    catch (e) { ui.setText(caption.node, 'Copy failed'); if (p.onError !== undefined) p.onError(e.message); else throw e; }
  };
  return <KitButton variant="outline" onClick={copy}><Text ref={caption} role="status" className={`text-[13px] text-${theme().foreground}`}>{p.label ?? 'Copy'}</Text></KitButton>;
}

enum HoldState { Idle, Holding, Confirmed }
/** Pointer or Space/Enter must stay held for duration ms. Leaving, releasing or losing focus cancels. */
export function HoldToConfirm(p: { label: string; onConfirm: () => void; duration?: number; disabled?: boolean }): i32 {
  const button = createNodeRef(), caption = createNodeRef(), fill = createNodeRef();
  let state = HoldState.Idle;
  let timer: i32 = -1;
  let serial: i32 = -1;
  const transition = (next: HoldState): void => {
    if (next === state) return;
    if (next === HoldState.Holding && state !== HoldState.Idle) return;
    if (next === HoldState.Confirmed && state !== HoldState.Holding) return;
    if (timer >= 0) ui.cancelAlarm(timer);
    timer = -1;
    state = next;
    springTo(fill.node, 'width', ui.getNumber(fill.node, 'width'), next === HoldState.Confirmed ? ui.screenBox(button.node)[2] : 0, SPRING_STATE);
    ui.setText(caption.node, state === HoldState.Holding ? 'Keep holding…' : state === HoldState.Confirmed ? 'Confirmed' : p.label);
    if (next === HoldState.Holding) {
      serial = ui.nodeSerial(button.node);
      if (!ui.prefersReducedMotion()) ui.animate(fill.node, 'width', ui.screenBox(button.node)[2], p.duration ?? 1200, 'linear', 0);
      timer = ui.alarm(ui.now() + (p.duration ?? 1200), () => {
        timer = -1;
        if (ui.nodeSerial(button.node) !== serial) return;
        transition(HoldState.Confirmed);
        p.onConfirm();
      });
    }
  };
  const node = <Button ref={button} disabled={p.disabled ?? false} aria-label={p.label}
    className={`h-9 px-[14px] rounded-[10px] border border-${theme().border} bg-${theme().card} ${p.disabled === true ? 'opacity-45' : ''}`}
    onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) transition(HoldState.Holding); }}
    onPointerUp={(e: ui.PointerEvent) => transition(HoldState.Idle)}
    onPointerLeave={(e: ui.PointerEvent) => transition(HoldState.Idle)}
    onPointerCancel={(e: ui.PointerEvent) => transition(HoldState.Idle)}
    onKeyDown={(e: ui.KeyEvent) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) transition(HoldState.Holding); } else if (e.key === 'Escape') transition(HoldState.Idle); }}
    onKeyUp={(e: ui.KeyEvent) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); transition(HoldState.Idle); } }}>
    <View ref={fill} className={`absolute left-0 bottom-0 h-1 w-0 bg-${theme().destructive}`} />
    <Text ref={caption} role="status" className={`text-[13px] text-${theme().foreground}`}>{p.label}</Text>
  </Button>;
  const signal = (kind: string, arg: string): void => {
    if (kind === 'background' || (kind === 'focus' && arg === '0')) transition(HoldState.Idle);
  };
  ui.addSignalListener(signal);
  onCleanup(() => { if (timer >= 0) ui.cancelAlarm(timer); ui.removeSignalListener(signal); });
  ui.onFocusWithin(button.node, (on: boolean) => { if (!on) transition(HoldState.Idle); });
  return node;
}

export interface CommandItem { label: string; group?: string; keywords?: string; shortcut?: string; disabled?: boolean; onSelect: () => void }
export interface CommandPaletteProps { open: () => boolean; onOpenChange: (open: boolean) => void; items: CommandItem[]; title?: string }
/** A searchable modal action list; the app owns its shortcut (usually mod-k), so multiple palettes never steal one another's binding. */
export function CommandPalette(p: CommandPaletteProps): i32 {
  const field = createNodeRef(), empty = createNodeRef();
  const rows: i32[] = [];
  let order: i32[] = [];
  const filter = (query: string): void => {
    const q = query.trim().toLowerCase();
    const ranked: i32[] = [];
    const scores: i32[] = [];
    for (let i = 0; i < rows.length; i++) {
      const it = p.items[i], text = (it.label + ' ' + (it.keywords ?? '')).toLowerCase();
      let at: i32 = 0, score: i32 = 0;
      for (let j = 0; j < q.length; j++) {
        const found = text.indexOf(q[j], at);
        if (found < 0) { score = -1; break; }
        score += found - at;
        at = found + 1;
      }
      scores.push(score);
      ui.setNumber(rows[i], 'hidden', score >= 0 ? 0 : 1);
      if (score >= 0) ranked.push(i);
    }
    ranked.sort((a: i32, b: i32): number => scores[a] - scores[b]);
    order = ranked.map((i: i32) => rows[i]);
    for (let i = 0; i < order.length; i++) {
      const row = ui.inspectNode(order[i]);
      if (row !== null) ui.moveChild(row.parent, order[i], i);
    }
    ui.setNumber(empty.node, 'hidden', ranked.length === 0 ? 0 : 1);
  };
  const navigate = (e: ui.KeyEvent): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const visible: i32[] = [];
    for (const h of order.length > 0 ? order : rows) {
      const n = ui.inspectNode(h);
      if (n !== null && !n.hidden && ui.getNumber(h, 'disabled') !== 1) visible.push(h);
    }
    if (visible.length === 0) return;
    const at = visible.indexOf(ui.focused());
    if (e.key === 'ArrowUp' && at <= 0) ui.focusNode(field.node);
    else ui.focusNode(visible[(at + (e.key === 'ArrowDown' ? 1 : visible.length - 1)) % visible.length]);
    e.preventDefault();
  };
  return <Dialog open={p.open} onOpenChange={p.onOpenChange} title={p.title ?? 'Run a command'}>
    <Input ref={field} placeholder="Search commands…" aria-label="Search commands" className={`h-9 px-3 rounded-[10px] border border-${theme().input} text-[13px] text-${theme().foreground}`}
      onInput={filter} onKeyDown={navigate} />
    <View className="flex-col gap-1">
      {p.items.map((it: CommandItem) => {
        const h = <Button role="menuitem" disabled={it.disabled ?? false} onKeyDown={navigate} className={`h-9 px-3 flex-row justify-between rounded-[8px] focus:bg-${theme().subtle} ${it.disabled === true ? 'opacity-45' : ''}`}
          onClick={() => { p.onOpenChange(false); it.onSelect(); }}>
          <Text className={`text-[13px] text-${theme().foreground}`}>{it.label}</Text>
          <Text className={`text-[11px] text-${theme().mutedForeground}`}>{it.group ?? ''} {keyLabel(it.shortcut ?? '')}</Text>
        </Button>;
        rows.push(h);
        return h;
      })}
      <Text ref={empty} hidden={1} className={`text-[13px] text-${theme().mutedForeground}`}>No commands found</Text>
    </View>
  </Dialog>;
}
