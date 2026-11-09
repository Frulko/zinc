/** @jsxHelpers zinc:ui/kit/host */
// Controlled selection controls; state changes are immediate, including under reduced motion.
import * as ui from 'zinc:ui';
import { createNodeRef } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { nativeControl, renderSlot } from './host';
import { theme } from './theme';
import { Tooltip } from './overlays';

export interface CheckboxProps {
  checked: () => boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  indeterminate?: () => boolean;
  disabled?: boolean;
  className?: string;
}
export function Checkbox(p: CheckboxProps): i32 {
  const mark = createNodeRef();
  const mixed = (): boolean => p.indeterminate !== undefined && (p.indeterminate as () => boolean)();
  const node = <Button role="checkbox" aria-label={p.label} aria-checked={mixed() ? 'mixed' : String(p.checked())}
    disabled={p.disabled ?? false} onClick={() => p.onChange(mixed() || !p.checked())}
    className={`flex-row items-center justify-start gap-2 min-h-[30px] rounded-[10px] ${p.disabled === true ? 'opacity-45' : ''} ${p.className ?? ''}`}>
    <View ref={mark} className={`w-[18px] h-[18px] shrink-0 items-center justify-center rounded-[5px] border border-${p.checked() || mixed() ? theme().accent : theme().input} bg-${p.checked() || mixed() ? theme().accent : theme().card}`}>
      <Show when={p.checked() || mixed()}><Icon name={mixed() ? 'minus' : 'check'} size={14} color={() => ui.tailwindColor(theme().accentForeground)} /></Show>
    </View>
    <View className="flex-col items-start gap-1">
      <Text className={`text-[13px] text-${theme().foreground}`}>{p.label}</Text>
      <Show when={p.description !== undefined}><Text className={`text-[12px] text-${theme().mutedForeground}`}>{p.description ?? ''}</Text></Show>
    </View>
  </Button>;
  nativeControl(mark.node, 'checkbox', () => ['axlabel', p.label, 'value', mixed() ? 'mixed' : p.checked() ? '1' : '0', 'enabled', p.disabled === true ? '0' : '1'], (value: string) => p.onChange(value === '1'));
  return node;
}

export interface ChoiceOption { value: string; label: string; description?: string; icon?: string; badge?: string; disabled?: boolean }
export interface RadioGroupProps {
  label: string;
  items: ChoiceOption[];
  value: () => string;
  onChange: (value: string) => void;
  orientation?: string;
  variant?: string;
  columns?: i32;
  disabled?: boolean;
  className?: string;
}
function radioNodes(root: i32, out: i32[]): void {
  const node = ui.inspectNode(root);
  if (node === null || node.hidden || ui.isDisabled(root)) return;
  if (node.tag === ui.BUTTON) { out.push(root); return; }
  for (const child of node.children) radioNodes(child, out);
}
export function RadioGroup(p: RadioGroupProps): i32 {
  const root = createNodeRef();
  const first = (): string => {
    for (const item of p.items) if (item.disabled !== true) return item.value;
    return '';
  };
  const tabStop = (): string => p.items.some((item: ChoiceOption) => item.value === p.value() && item.disabled !== true) ? p.value() : first();
  const key = (e: ui.KeyEvent): void => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Home' && e.key !== 'End') return;
    const enabled = p.items.filter((item: ChoiceOption) => item.disabled !== true);
    if (enabled.length === 0) return;
    const current = enabled.findIndex((item: ChoiceOption) => item.value === p.value());
    const reverse = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? enabled.length - 1 : current < 0 ? (reverse ? enabled.length - 1 : 0) : (current + (reverse ? enabled.length - 1 : 1)) % enabled.length;
    const nodes: i32[] = []; radioNodes(root.node, nodes);
    if (next < nodes.length) ui.focusNode(nodes[next]);
    p.onChange(enabled[next].value);
    e.preventDefault();
  };
  const cards = p.variant === 'card';
  const choice = (item: ChoiceOption): i32 => <Button role="radio" aria-label={item.label} aria-checked={String(p.value() === item.value)} disabled={item.disabled ?? false}
      tabIndex={tabStop() === item.value ? 0 : -1}
      onClick={() => p.onChange(item.value)}
      className={`flex-row items-center justify-start gap-2 min-h-[30px] rounded-[10px] ${cards ? 'p-4 border border-' + (p.value() === item.value ? theme().accent : theme().border) + ' bg-' + theme().card : ''} ${cards ? 'flex-1 min-w-0' : ''} ${item.disabled === true && p.disabled !== true ? 'opacity-45' : ''}`}>
      <View className={`w-[18px] h-[18px] rounded-full border border-${p.value() === item.value ? theme().accent : theme().input} items-center justify-center`}>
        <Show when={p.value() === item.value}><View className={`w-2 h-2 rounded-full bg-${theme().accent}`} /></Show>
      </View>
      <Show when={item.icon !== undefined}><Icon name={item.icon ?? ''} size={16} color={() => ui.tailwindColor(theme().foreground)} /></Show>
      <View className="flex-col items-start gap-1">
        <Text className={`text-[13px] text-${theme().foreground}`}>{item.label}</Text>
        <Show when={item.description !== undefined}><Text className={`text-[12px] text-${theme().mutedForeground}`}>{item.description ?? ''}</Text></Show>
      </View>
      <Show when={item.badge !== undefined}><Text className={`text-[11px] text-${theme().mutedForeground}`}>{item.badge ?? ''}</Text></Show>
    </Button>;
  const columns = Math.max(1, p.columns ?? 2) as i32, rows: ChoiceOption[][] = [];
  if (cards) for (let i = 0; i < p.items.length; i += columns) rows.push(p.items.slice(i, i + columns));
  return <View ref={root} role="radiogroup" aria-label={p.label} disabled={p.disabled ?? false} onKeyDown={key}
    className={`flex-col gap-2 ${p.disabled === true ? 'opacity-45' : ''} ${p.className ?? ''}`}>
    <Show when={cards}>{rows.map((row: ChoiceOption[]) => <View className="flex-row gap-2">{row.map((item: ChoiceOption) => renderSlot(() => choice(item)))}</View>)}</Show>
    <Show when={!cards}><View className={`${p.orientation === 'horizontal' ? 'flex-row flex-wrap' : 'flex-col'} gap-2`}>{p.items.map((item: ChoiceOption) => renderSlot(() => choice(item)))}</View></Show>
  </View>;
}
export function RadioCards(p: RadioGroupProps): i32 {
  return <RadioGroup label={p.label} items={p.items} value={p.value} onChange={p.onChange} variant="card" columns={p.columns} disabled={p.disabled} className={p.className} />;
}

export interface ChipProps { label: string; selected: () => boolean; onChange: (selected: boolean) => void; disabled?: boolean; onRemove?: () => void }
export function Chip(p: ChipProps): i32 {
  return <View className={`flex-row items-center rounded-full border border-${p.selected() ? theme().accent : theme().border} bg-${p.selected() ? theme().accentSoft : theme().card} ${p.disabled === true ? 'opacity-45' : ''}`}>
    <Button aria-pressed={String(p.selected())} aria-label={p.label} disabled={p.disabled ?? false} onClick={() => p.onChange(!p.selected())} className="h-[30px] px-[11px] rounded-full">
      <Text className={`text-[13px] text-${theme().foreground}`}>{p.label}</Text>
    </Button>
    <Show when={p.onRemove !== undefined}><Tooltip label={'Remove ' + p.label}><Button aria-label={'Remove ' + p.label} disabled={p.disabled ?? false} className="w-[30px] h-[30px] items-center justify-center rounded-full" onClick={() => { const remove = p.onRemove; if (remove !== undefined) remove(); }}>
      <Icon name="x" size={12} color={() => ui.tailwindColor(theme().mutedForeground)} />
    </Button></Tooltip></Show>
  </View>;
}
export function Chips(p: { label: string; items: ChoiceOption[]; value: () => string[]; onChange: (values: string[]) => void; disabled?: boolean }): i32 {
  return <View role="group" aria-label={p.label} className="flex-row flex-wrap gap-2">
    {p.items.map((item: ChoiceOption) => <Chip label={item.label} selected={() => p.value().indexOf(item.value) >= 0} disabled={p.disabled === true || item.disabled === true}
      onChange={(selected: boolean) => p.onChange(selected ? p.value().concat([item.value]) : p.value().filter((value: string) => value !== item.value))} />)}
  </View>;
}
export function Rating(p: { label: string; value: () => number; onChange: (value: number) => void; max?: i32; readOnly?: boolean; disabled?: boolean }): i32 {
  const root = createNodeRef();
  const values: i32[] = [];
  for (let i: i32 = 1; i <= (p.max ?? 5); i++) values.push(i);
  return <View ref={root} role="radiogroup" aria-label={p.label} aria-readonly={String(p.readOnly === true)} className="flex-row gap-1">
    {values.map((value: i32) => <Tooltip label={String(value) + ' of ' + String(p.max ?? 5)}><Button role="radio" aria-label={String(value) + ' of ' + String(p.max ?? 5)} aria-checked={String(value === p.value())}
      tabIndex={value === p.value() || (p.value() === 0 && value === 1) ? 0 : -1} disabled={p.disabled === true || p.readOnly === true} className={`w-[30px] h-[30px] items-center justify-center rounded-[10px] ${p.disabled === true ? 'opacity-45' : ''}`}
      onClick={() => p.onChange(p.value() === value ? 0 : value)}
      onKeyDown={(e: ui.KeyEvent) => {
        const delta = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
        if (delta === 0 && e.key !== 'Home' && e.key !== 'End' && e.key !== 'Delete' && e.key !== 'Backspace') return;
        const next = e.key === 'Home' || e.key === 'Delete' || e.key === 'Backspace' ? 0 : e.key === 'End' ? p.max ?? 5 : Math.max(0, Math.min(p.max ?? 5, p.value() + delta));
        const nodes: i32[] = []; radioNodes(root.node, nodes);
        if (nodes.length > 0) ui.focusNode(nodes[Math.max(0, next - 1)]);
        p.onChange(next);
        e.preventDefault();
      }}><Icon name="star" size={18} filled={value <= p.value()} color={() => ui.tailwindColor(value <= p.value() ? theme().accent : theme().mutedForeground)} /></Button></Tooltip>)}
  </View>;
}
