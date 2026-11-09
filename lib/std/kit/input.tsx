/** @jsxHelpers ./host */
// Quiet fields share the engine's editing, undo, selection, IME and focus handling.
import * as ui from 'zinc:ui';
import { createNodeRef, NodeRef } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { theme, themeColor } from './theme';
import { renderSlot, onCleanup, componentRef } from './host';
import { look } from '../platform/index';
import { Button as KitButton } from './button';
import { keyLabel } from './overlays';

export interface InputProps {
  value?: () => string;
  onInput?: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  type?: string;
  name?: string;
  label?: string;
  hint?: string;
  error?: string;
  icon?: () => i32;
  prefix?: string;
  suffix?: string;
  clearable?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  autofocus?: boolean;
  size?: string;
  className?: string;
}
export interface TextareaProps extends InputProps { rows?: number; height?: number }

function fieldClass(disabled: boolean): string {
  const t = theme();
  return `${look().field} border border-${t.input} bg-transparent text-${t.foreground} placeholder:text-${t.mutedForeground} focus-visible:ring-2 focus-visible:ring-${t.accent} focus-visible:ring-offset-2${disabled ? ' opacity-45' : ''}`;
}
function fieldFrame(p: { label?: string; hint?: string; error?: string; className?: string }, field: i32): i32 {
  const node = <View className={`flex-col gap-1.5 ${p.className ?? 'w-full'}`}>
    <Show when={(p.label ?? '') !== ''}><Text className={`text-[13px] font-medium text-${theme().foreground}`}>{p.label ?? ''}</Text></Show>
    <Show when={(p.error ?? '') !== '' || (p.hint ?? '') !== ''}><Text role={(p.error ?? '') !== '' ? 'alert' : ''} className={`text-[12px] text-${(p.error ?? '') !== '' ? theme().destructive : theme().mutedForeground}`}>{(p.error ?? '') !== '' ? p.error ?? '' : p.hint ?? ''}</Text></Show>
  </View>;
  // Integer JSX children are text; mount this existing node handle explicitly.
  ui.insert(node, field, ui.childAt(node, 1));
  return node;
}

function buildTextField(p: InputProps, ref: NodeRef, trailing: (() => i32) | undefined): i32 {
  const h = p.size === 'sm' ? 'h-[30px]' : p.size === 'lg' ? 'h-[44px]' : look().fieldHeight;
  const field = <Input ref={ref} className={`grow min-w-0 ${h} py-1 ${fieldClass(p.disabled === true)} ${trailing !== undefined ? 'pr-11' : ''}`}
    value={p.value !== undefined ? p.value() : ''} placeholder={p.placeholder ?? ''} name={p.name ?? ''}
    aria-label={p.label ?? p.placeholder ?? ''} aria-invalid={(p.error ?? '') !== ''}
    password={p.type === 'password'} readOnly={p.readOnly === true} disabled={p.disabled === true}
    inputMode={p.type === 'search' ? 'search' : p.type === 'number' ? 'decimal' : p.type === 'email' ? 'email' : 'text'}
    onInput={(v: string) => { if (p.onInput !== undefined) p.onInput(v); }} />;
  let editor = field;
  if (trailing !== undefined) {
    editor = <View className="flex-row grow min-w-0" />;
    ui.insert(editor, field, -1);
    ui.insert(editor, trailing(), -1);
  }
  const row = <View className="flex-row items-center gap-2">
    <Show when={p.icon !== undefined}>{renderSlot(p.icon)}</Show>
    <Show when={p.prefix !== undefined}><Text className={`text-[13px] text-${theme().mutedForeground}`}>{p.prefix ?? ''}</Text></Show>
    <Show when={p.suffix !== undefined}><Text className={`text-[13px] text-${theme().mutedForeground}`}>{p.suffix ?? ''}</Text></Show>
    <Show when={p.clearable === true && p.readOnly !== true && (p.value !== undefined && p.value() !== '')}>
      <KitButton label="Clear" size="sm" variant="ghost" disabled={p.disabled} onClick={() => { ui.focusNode(ref.node); ui.select(ref.node, 0, ui.getValue(ref.node).length); ui.insertText(''); }} />
    </Show>
  </View>;
  ui.insert(row, editor, ui.childAt(row, 2));
  const node = fieldFrame(p, row);
  if (p.onSubmit !== undefined) ui.onSubmit(ref.node, p.onSubmit);
  if (p.autofocus === true) ui.focusNode(ref.node);
  return node;
}
function TextField(props?: InputProps): i32 { return buildTextField(props ?? {}, createNodeRef(), undefined); }
export { TextField as Input };

export function PasswordField(p: InputProps): i32 {
  const field = createNodeRef(), revealed = componentRef(false);
  let revealButton: i32 = -1;
  return buildTextField({ value: p.value, onInput: p.onInput, onSubmit: p.onSubmit, label: p.label ?? 'Password', hint: p.hint, error: p.error,
    placeholder: p.placeholder, type: revealed.current ? 'text' : 'password', name: p.name, icon: p.icon, prefix: p.prefix, suffix: p.suffix,
    clearable: p.clearable, disabled: p.disabled, readOnly: p.readOnly, autofocus: p.autofocus, size: p.size, className: p.className }, field,
    () => {
      // Keep the button handle itself; a JSX component expression adds a fragment.
      revealButton = KitButton({ ariaLabel: 'Show or hide password', size: 'icon', variant: 'ghost', className: p.size === 'sm' ? 'h-[30px] w-[30px]' : '', pressed: revealed.current, disabled: p.disabled, onClick: () => {
        revealed.current = !revealed.current;
        ui.setNumber(field.node, 'password', revealed.current ? 0 : 1);
        ui.setAttr(revealButton, 'aria-pressed', String(revealed.current));
        ui.focusNode(field.node);
      }, children: () => <Icon name="eye" size={16} color={() => themeColor('mutedForeground')} /> });
      const overlay = <View className="absolute right-0 top-0 bottom-0 justify-center" />;
      ui.insert(overlay, revealButton, -1);
      return overlay;
    });
}
export function SearchField(p: InputProps): i32 {
  return <TextField value={p.value} onInput={p.onInput} onSubmit={p.onSubmit} label={p.label} hint={p.hint} error={p.error}
    placeholder={p.placeholder ?? 'Search'} type="search" icon={p.icon ?? (() => <Icon name="search" size={16} color={() => themeColor('mutedForeground')} />)} prefix={p.prefix} suffix={p.suffix} name={p.name} clearable={true}
    disabled={p.disabled} readOnly={p.readOnly} autofocus={p.autofocus} size={p.size} className={p.className} />;
}
export function Textarea(props?: TextareaProps): i32 {
  const p: TextareaProps = props ?? {}, ref = createNodeRef();
  const field = <TextArea ref={ref} className={`w-full min-h-16 py-2 ${fieldClass(p.disabled === true)} ${p.height === -1 ? 'grow h-full' : p.height !== undefined ? 'h-[' + p.height + 'px]' : ''}`} rows={p.rows ?? 3}
    value={p.value !== undefined ? p.value() : ''} placeholder={p.placeholder ?? ''} name={p.name ?? ''} aria-label={p.label ?? p.placeholder ?? ''}
    disabled={p.disabled === true} readOnly={p.readOnly === true}
    onInput={(v: string) => { if (p.onInput !== undefined) p.onInput(v); }} />;
  if (p.onSubmit !== undefined) ui.onKeyDown(ref.node, (e: ui.KeyEvent) => {
    if (e.primary && e.key === 'Enter' && p.onSubmit !== undefined) { p.onSubmit(); e.preventDefault(); }
  });
  return fieldFrame(p, field);
}

export interface NumberFieldProps {
  value: () => number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  label?: string;
  suffix?: string;
  disabled?: boolean;
  className?: string;
}
/** Clamp after rounding too: a decimal step must never escape a non-aligned boundary. */
function fieldNumber(value: number, min: number, max: number, decimals: number): number {
  const scale = Math.pow(10, Math.max(0, Math.min(10, decimals)));
  return Math.max(min, Math.min(max, Math.round(value * scale) / scale));
}
function numberKey(p: NumberFieldProps, e: ui.KeyEvent): void {
  const step = p.step ?? 1, min = p.min ?? -1e12, max = p.max ?? 1e12;
  let v = p.value();
  if (e.key === 'ArrowUp') v += step * (e.shift ? 10 : 1);
  else if (e.key === 'ArrowDown') v -= step * (e.shift ? 10 : 1);
  else if (e.key === 'Home') v = min;
  else if (e.key === 'End') v = max;
  else return;
  if (p.disabled !== true) p.onChange(fieldNumber(v, min, max, p.decimals ?? 2));
  e.preventDefault();
}
export function NumberField(p: NumberFieldProps): i32 {
  const ref = createNodeRef();
  const update = (v: number): void => { if (p.disabled !== true && Number.isFinite(v)) p.onChange(fieldNumber(v, p.min ?? -1e12, p.max ?? 1e12, p.decimals ?? 2)); };
  const node = fieldFrame(p, <View className="flex-row items-center gap-1" onKeyDown={(e: ui.KeyEvent) => numberKey(p, e)}>
    <KitButton label="−" size="sm" variant="ghost" ariaLabel={`Decrease ${p.label ?? 'value'}`} disabled={p.disabled} onClick={() => update(p.value() - (p.step ?? 1))} />
    <Input ref={ref} className={`grow min-w-0 h-9 tabular-nums ${fieldClass(p.disabled === true)}`} value={String(p.value())} inputMode="decimal"
      role="spinbutton" aria-label={p.label ?? 'Value'} aria-valuenow={String(p.value())} aria-valuemin={String(p.min ?? -1e12)} aria-valuemax={String(p.max ?? 1e12)} disabled={p.disabled === true}
      onInput={(v: string) => update(Number(v))} />
    <Show when={p.suffix !== undefined}><Text className={`text-[12px] text-${theme().mutedForeground}`}>{p.suffix ?? ''}</Text></Show>
    <KitButton label="+" size="sm" variant="ghost" ariaLabel={`Increase ${p.label ?? 'value'}`} disabled={p.disabled} onClick={() => update(p.value() + (p.step ?? 1))} />
  </View>);
  onCleanup(ui.onFocusWithin(ref.node, (focused: boolean) => { if (!focused) ui.setValue(ref.node, String(p.value())); }));
  return node;
}

export interface MoneyFieldProps extends NumberFieldProps { symbol?: string; code?: string; hint?: string }
function moneyText(value: number, decimals: number): string {
  const parts = value.toFixed(Math.max(0, Math.min(10, decimals))).split('.');
  const sign = value < 0 ? '-' : '';
  let digits = parts[0].startsWith('-') ? parts[0].slice(1) : parts[0], out = '';
  while (digits.length > 3) {
    out = ',' + digits.slice(-3) + out;
    digits = digits.slice(0, -3);
  }
  return sign + digits + out + (parts.length > 1 ? '.' + parts[1] : '');
}
export function MoneyField(p: MoneyFieldProps): i32 {
  const field = createNodeRef(), decimals = Math.max(0, p.decimals ?? 2);
  const displayValue = (): string => {
    const value = p.value();
    return ui.focused() === field.node ? ui.getValue(field.node) : moneyText(value, decimals);
  };
  const node = fieldFrame(p, <View className="flex-row items-center gap-2">
    <Text className={`text-[13px] text-${theme().mutedForeground}`}>{p.symbol ?? '$'}</Text>
    <Input ref={field} className={`grow min-w-0 h-9 tabular-nums ${fieldClass(p.disabled === true)}`} aria-label={p.label ?? 'Amount'} inputMode="decimal"
      value={displayValue()} disabled={p.disabled === true}
      onInput={(v: string) => {
        let clean = '', fractional = 0, dot = false;
        for (let i = 0; i < v.length; i++) {
          const c = v[i];
          if (c === '-' && clean === '') clean += c;
          else if (c === '.' && !dot && decimals > 0) { clean += c; dot = true; }
          else if ('0123456789'.indexOf(c) >= 0 && (!dot || fractional < decimals)) { clean += c; if (dot) fractional++; }
        }
        ui.setValue(field.node, clean);
        const n = Number(clean);
        if (clean !== '' && clean !== '-' && Number.isFinite(n) && p.disabled !== true) p.onChange(fieldNumber(n, p.min ?? -1e12, p.max ?? 1e12, decimals));
      }} />
    <Text className={`text-[12px] text-${theme().mutedForeground}`}>{p.code ?? 'USD'}</Text>
  </View>);
  onCleanup(ui.onFocusWithin(field.node, (focused: boolean) => { ui.setValue(field.node, focused ? p.value().toFixed(decimals) : moneyText(p.value(), decimals)); }));
  return node;
}

function onWindowBlur(cancel: () => void): void {
  const listener = (kind: string, arg: string): void => { if ((kind === 'focus' && arg === '0') || kind === 'background') cancel(); };
  ui.addSignalListener(listener);
  onCleanup(() => ui.removeSignalListener(listener));
}

enum ScrubState { Idle, Pressed, Dragging }
interface ScrubGesture { state: ScrubState; originX: number; originValue: number }
export function ScrubField(p: NumberFieldProps): i32 {
  const min = p.min ?? 0, max = p.max ?? 100, field = createNodeRef();
  const gesture = componentRef<ScrubGesture>({ state: ScrubState.Idle, originX: 0, originValue: 0 });
  const transition = (next: ScrubState): void => {
    if (next === ScrubState.Pressed && gesture.current.state !== ScrubState.Idle) return;
    if (next === ScrubState.Dragging && gesture.current.state !== ScrubState.Pressed) return;
    gesture.current.state = next;
  };
  const update = (v: number): void => { if (p.disabled !== true && Number.isFinite(v)) p.onChange(fieldNumber(v, min, max, p.decimals ?? 2)); };
  onWindowBlur(() => transition(ScrubState.Idle));
  return fieldFrame(p, <View className="flex-col">
    <Input ref={field} className={`h-9 tabular-nums ${fieldClass(p.disabled === true)}`} value={String(p.value())} inputMode="decimal" aria-label={p.label ?? 'Value'} disabled={p.disabled === true} grab="keep-x"
      onPointerDown={(e: ui.PointerEvent) => { if (p.disabled === true || e.button !== 0) return; gesture.current.originX = e.x; gesture.current.originValue = p.value(); transition(ScrubState.Pressed); }}
      onPointerMove={(e: ui.PointerEvent) => {
        if (gesture.current.state === ScrubState.Idle) return;
        if (Math.abs(e.x - gesture.current.originX) > 4) transition(ScrubState.Dragging);
        if (gesture.current.state === ScrubState.Dragging) update(gesture.current.originValue + (e.x - gesture.current.originX) * (p.step ?? (max - min) / 100) * (e.shift ? 0.1 : 1));
      }} onPointerUp={(e: ui.PointerEvent) => transition(ScrubState.Idle)} onPointerCancel={(e: ui.PointerEvent) => transition(ScrubState.Idle)}
      onKeyDown={(e: ui.KeyEvent) => numberKey(p, e)} onInput={(v: string) => update(Number(v))} onChange={(v: string) => ui.setValue(field.node, String(p.value()))} />
    <View className={`h-px bg-${theme().accent} w-${Math.round(100 * (p.value() - min) / Math.max(1, max - min))}/100`} />
    <Show when={p.suffix !== undefined}><Text className={`text-[12px] text-${theme().mutedForeground}`}>{p.suffix ?? ''}</Text></Show>
  </View>);
}

export interface TagInputProps { value: () => string[]; onChange: (tags: string[]) => void; label?: string; placeholder?: string; disabled?: boolean; maxTags?: number; className?: string }
export function TagInput(p: TagInputProps): i32 {
  const ref = createNodeRef();
  const add = (): void => {
    const tag = ui.getValue(ref.node).trim();
    if (p.disabled === true || tag === '' || p.value().length >= (p.maxTags ?? 100)) return;
    if (p.value().indexOf(tag) < 0) p.onChange(p.value().concat([tag]));
    ui.setValue(ref.node, '');
  };
  return fieldFrame(p, <View className="flex-row flex-wrap items-center gap-1">
    {p.value().map((tag: string) => <KitButton label={tag + ' ×'} size="sm" variant="outline" ariaLabel={'Remove ' + tag} disabled={p.disabled} onClick={() => p.onChange(p.value().filter((v: string) => v !== tag))} />)}
    <Input ref={ref} className={`grow min-w-[100px] h-9 ${fieldClass(p.disabled === true)}`} aria-label={p.label ?? 'Tags'} placeholder={p.placeholder ?? 'Add a tag'} disabled={p.disabled === true}
      onKeyDown={(e: ui.KeyEvent) => {
        if (e.key === 'Enter' || e.key === ',') { add(); e.preventDefault(); }
        else if (e.key === 'Backspace' && ui.getValue(ref.node) === '' && p.value().length > 0) { p.onChange(p.value().slice(0, -1)); e.preventDefault(); }
      }} />
  </View>);
}

export interface OneTimeCodeProps { value: () => string; onChange: (value: string) => void; length?: number; label?: string; disabled?: boolean; onComplete?: (value: string) => void }
export function OneTimeCode(p: OneTimeCodeProps): i32 {
  const count = Math.max(1, Math.min(12, p.length ?? 6)), field = createNodeRef();
  return fieldFrame({ label: p.label ?? 'Verification code' }, <Input ref={field} className={`h-9 tabular-nums tracking-widest ${fieldClass(p.disabled === true)}`} aria-label={p.label ?? 'Verification code'}
    value={p.value()} inputMode="numeric" placeholder={'0'.repeat(count)} disabled={p.disabled === true} autoComplete="one-time-code" onInput={(v: string) => {
      let digits = '';
      for (let i = 0; i < v.length && digits.length < count; i++) if ('0123456789'.indexOf(v[i]) >= 0) digits += v[i];
      const previous = p.value();
      ui.setValue(field.node, digits);
      p.onChange(digits);
      if (digits !== previous && digits.length === count && p.onComplete !== undefined) p.onComplete(digits);
    }} />);
}

export interface SelectOption { value: string; label: string; icon?: string; disabled?: boolean }
export interface SelectProps { items: SelectOption[]; value: () => string; onChange: (value: string) => void; label?: string; placeholder?: string; searchable?: boolean; disabled?: boolean; className?: string }
enum SelectionState { Closed, Open }
/** The caller owns values; component state survives parent renders and the engine restores focus. */
function selectionField(p: SelectProps, multiple: (() => string[]) | null, changeMany: ((value: string[]) => void) | null, maxChips: number): i32 {
  const trigger = createNodeRef(), panel = createNodeRef(), search = createNodeRef(), list = createNodeRef(), empty = createNodeRef();
  const state = componentRef(SelectionState.Closed);
  const selected = (v: string): boolean => multiple !== null ? multiple().indexOf(v) >= 0 : p.value() === v;
  const caption = (): string => {
    const chosen = p.items.filter((it: SelectOption) => selected(it.value));
    if (chosen.length === 0) return p.placeholder ?? 'Select an option';
    return chosen.slice(0, maxChips).map((it: SelectOption) => it.label).join(', ') + (chosen.length > maxChips ? ' +' + (chosen.length - maxChips) : '');
  };
  const rows = (root: i32, out: i32[]): void => {
    const n = ui.inspectNode(root);
    if (n === null) return;
    if (n.role === 'option') { out.push(root); return; }
    for (const child of n.children) rows(child, out);
  };
  const buttons = (): i32[] => {
    const all: i32[] = []; rows(list.node, all);
    return all.filter((h: i32) => ui.getNumber(h, 'hidden') !== 1 && !ui.isDisabled(h));
  };
  const transition = (next: SelectionState): void => {
    if (next === SelectionState.Open && p.disabled === true) return;
    state.current = next;
    ui.setNumber(panel.node, 'hidden', next === SelectionState.Open ? 0 : 1);
    ui.setAttr(trigger.node, 'aria-expanded', next === SelectionState.Open ? 'true' : 'false');
  };
  const close = (): void => transition(SelectionState.Closed);
  const open = (): void => transition(SelectionState.Open);
  const choose = (v: string): void => {
    if (p.disabled === true || p.items.some((it: SelectOption) => it.value === v && it.disabled === true)) return;
    if (multiple !== null && changeMany !== null) changeMany(selected(v) ? multiple().filter((s: string) => s !== v) : multiple().concat([v]));
    else { p.onChange(v); close(); }
  };
  const key = (e: ui.KeyEvent): void => {
    const b = buttons(), index = b.indexOf(ui.focused());
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      if (b.length > 0) ui.focusNode(b[e.key === 'Home' ? 0 : e.key === 'End' ? b.length - 1 : index < 0 ? (e.key === 'ArrowUp' ? b.length - 1 : 0) : (index + (e.key === 'ArrowUp' ? b.length - 1 : 1)) % b.length]);
      e.preventDefault();
    } else if (e.key === 'Escape') { close(); e.preventDefault(); }
    else if (ui.focused() !== search.node && e.key.length === 1 && !e.primary && !e.alt) {
      for (let offset = 1; offset <= b.length; offset++) {
        const h = b[(Math.max(-1, index) + offset) % b.length], n = ui.inspectNode(h);
        if (n !== null && n.label.toLowerCase().startsWith(e.key.toLowerCase())) { ui.focusNode(h); e.preventDefault(); break; }
      }
    }
  };
  const node = fieldFrame(p, <View className="flex-col">
    <Button ref={trigger} role="combobox" aria-label={p.label ?? 'Select'} aria-expanded={state.current === SelectionState.Open} aria-haspopup="listbox" disabled={p.disabled === true}
      className={`flex-row items-center justify-between gap-3 h-9 ${fieldClass(p.disabled === true)}`}
      onClick={() => { if (state.current === SelectionState.Closed) open(); else close(); }}
      onKeyDown={(e: ui.KeyEvent) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { open(); e.preventDefault(); } }}>
      <Text className={`text-[13px] text-${theme().foreground}`}>{caption()}</Text><Icon name="chevron-down" size={14} color={() => themeColor('mutedForeground')} />
    </Button>
    <View ref={panel} hidden={state.current === SelectionState.Open ? 0 : 1} role="group" aria-label={p.label ?? 'Options'} className={`flex-col gap-1 p-1.5 w-64 max-h-[320px] rounded-[14px] border border-${theme().border} bg-${theme().card} shadow-lg`} onKeyDown={key}>
      <Show when={p.searchable === true}><Input ref={search} className={`h-9 ${fieldClass(false)}`} placeholder="Filter options" aria-label="Filter options" onKeyDown={key} onInput={(q: string) => {
        const all: i32[] = []; rows(list.node, all);
        let matches = 0;
        for (const h of all) {
          const n = ui.inspectNode(h);
          if (n !== null) {
            const match = n.label.toLowerCase().includes(q.toLowerCase());
            if (match) matches++;
            ui.setNumber(h, 'hidden', match ? 0 : 1);
          }
        }
        ui.setNumber(empty.node, 'hidden', matches === 0 ? 0 : 1);
      }} /></Show>
      <ScrollView className="max-h-[220px]"><View ref={list} role="listbox" aria-label={p.label ?? 'Options'} aria-multiselectable={multiple !== null} className="flex-col gap-1">
        {p.items.map((it: SelectOption) => <Button role="option" aria-selected={selected(it.value)} disabled={it.disabled === true} aria-label={it.label}
          className={`flex-row items-center gap-2 h-8 px-2 rounded-[8px] focus-visible:ring-2 focus-visible:ring-${theme().accent} focus:bg-${theme().accentSoft} ${selected(it.value) ? 'bg-' + theme().accentSoft : ''} ${it.disabled === true ? 'opacity-45' : ''}`} onClick={() => choose(it.value)}>
          <Show when={it.icon !== undefined}><Icon name={it.icon ?? ''} size={14} color={() => themeColor('mutedForeground')} /></Show>
          <Text className={`grow text-[13px] text-${theme().foreground}`}>{it.label}</Text>
          <Show when={selected(it.value)}><Icon name="check" size={14} color={() => themeColor('foreground')} /></Show>
        </Button>)}
      </View></ScrollView>
      <Show when={multiple !== null}><View className="flex-row gap-1">
        <KitButton label="Select all" ariaLabel={'Select all ' + (p.label ?? 'options')} size="sm" variant="ghost" onClick={() => { if (changeMany !== null) changeMany(p.items.filter((it: SelectOption) => it.disabled !== true || selected(it.value)).map((it: SelectOption) => it.value)); }} />
        <KitButton label="Clear" ariaLabel={'Clear ' + (p.label ?? 'selection')} size="sm" variant="ghost" onClick={() => { if (changeMany !== null) changeMany(p.items.filter((it: SelectOption) => it.disabled === true && selected(it.value)).map((it: SelectOption) => it.value)); }} />
      </View></Show>
      <Text ref={empty} hidden={p.items.length > 0 ? 1 : 0} className={`p-2 text-[12px] text-${theme().mutedForeground}`}>No matching options</Text>
    </View>
    <Show when={multiple !== null}><View className="flex-row flex-wrap gap-1 pt-1">
      {p.items.filter((it: SelectOption) => selected(it.value)).slice(0, maxChips).map((it: SelectOption) => <KitButton label={it.label + ' ×'} ariaLabel={'Remove ' + it.label} size="sm" variant="outline" disabled={p.disabled === true || it.disabled === true} onClick={() => choose(it.value)} />)}
    </View></Show>
  </View>);
  if (p.disabled === true) close();
  ui.openLayer(panel.node, { priority: 100 });
  ui.anchor(panel.node, trigger.node, 'bottom-start', 4);
  ui.focusScope(panel.node, { trap: false, restore: true, autoFocus: true });
  ui.onDismiss(panel.node, close);
  ui.onOutsidePointer(panel.node, (e: ui.PointerEvent) => close(), trigger.node);
  return node;
}
export function Select(p: SelectProps): i32 { return selectionField(p, null, null, 1); }
export function Combobox(p: SelectProps): i32 {
  return selectionField({ items: p.items, value: p.value, onChange: p.onChange, label: p.label, placeholder: p.placeholder, searchable: true, disabled: p.disabled, className: p.className }, null, null, 1);
}
export interface MultiSelectProps { items: SelectOption[]; value: () => string[]; onChange: (value: string[]) => void; label?: string; placeholder?: string; searchable?: boolean; maxChips?: number; disabled?: boolean; className?: string }
export function MultiSelect(p: MultiSelectProps): i32 {
  return selectionField({ items: p.items, value: () => '', onChange: (v: string) => {}, label: p.label, placeholder: p.placeholder, searchable: p.searchable, disabled: p.disabled, className: p.className }, p.value, p.onChange, Math.max(1, p.maxChips ?? 3));
}

enum RecorderState { Idle, Recording }
export function ShortcutRecorder(p: { value: () => string; onChange: (value: string) => void; label?: string; disabled?: boolean }): i32 {
  const root = createNodeRef(), text = createNodeRef();
  const state = componentRef(RecorderState.Idle);
  const caption = (): string => {
    const value = p.value();
    return state.current === RecorderState.Recording ? 'Press a shortcut…' : value === '' ? 'Record shortcut' : keyLabel(value);
  };
  const transition = (next: RecorderState): void => {
    state.current = next;
    ui.setText(text.node, caption());
  };
  const preview = (e: ui.KeyEvent): void => {
    if (state.current === RecorderState.Recording) ui.setText(text.node, (e.ctrl ? 'Ctrl ' : '') + (e.meta ? 'Cmd ' : '') + (e.alt ? 'Alt ' : '') + (e.shift ? 'Shift ' : '') + '…');
  };
  const node = <Button ref={root} aria-label={p.label ?? 'Shortcut'} disabled={p.disabled === true} className={`h-9 ${fieldClass(p.disabled === true)}`}
    onClick={() => transition(RecorderState.Recording)} onKeyUp={preview} onKeyDown={(e: ui.KeyEvent) => {
      if (state.current === RecorderState.Idle) { if (e.key === 'Enter' || e.key === ' ') { transition(RecorderState.Recording); e.preventDefault(); } return; }
      if (e.key === 'Escape' || e.key === 'Tab') { transition(RecorderState.Idle); if (e.key !== 'Tab') e.preventDefault(); return; }
      e.preventDefault();
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Meta' || e.key === 'Alt') {
        preview(e);
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') p.onChange('');
      else {
        const key = e.key.startsWith('Arrow') ? e.key.slice(5).toLowerCase() : e.key === ' ' ? 'space' : e.key.toLowerCase();
        p.onChange((e.ctrl ? 'ctrl-' : '') + (e.meta ? 'meta-' : '') + (e.alt ? 'alt-' : '') + (e.shift ? 'shift-' : '') + key);
      }
      transition(RecorderState.Idle);
    }}><Text ref={text} className={`text-[13px] text-${theme().foreground}`}>{caption()}</Text></Button>;
  onCleanup(ui.onFocusWithin(root.node, (focused: boolean) => { if (!focused) transition(RecorderState.Idle); }));
  onWindowBlur(() => transition(RecorderState.Idle));
  return node;
}
