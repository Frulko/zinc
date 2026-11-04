// A label beside a control; a number field that commits on each change; a slider over a value of the show.
import { Icon } from 'zinc:icons';
import { Button, Slider } from 'zinc:ui/kit';
import { createSignal } from 'zinc:ui/solid';

export function Row(props: { label: string; children: () => i32 }): i32 {
  return <View className="flex-row items-center gap-2 min-h-[28]">
    <Text className="text-xs text-zinc-400 w-[72]">{props.label}</Text>
    <View className="w-0 grow">{props.children()}</View>
  </View>;
}

export function NumberField(props: { value: () => number; onChange: (value: number) => void; label: string }): i32 {
  return <Input className="w-[84] h-[28] px-2 rounded bg-zinc-800 text-zinc-100 text-xs" aria-label={props.label} value={`${props.value()}`}
    onChange={(text: string) => {
      const parsed = parseFloat(text);
      if (!isNaN(parsed)) props.onChange(parsed);
    }} />;
}

export function Heading(props: { text: string }): i32 {
  return <Text className="text-[11px] uppercase text-zinc-500 mt-3 mb-1">{props.text}</Text>;
}

/** The kit's thumb follows a signal: this holds one over a value kept in the store. */
export function ValueSlider(props: { min: number; max: number; step?: number; read: () => number; write: (value: number) => void }): i32 {
  const [value, setValue] = createSignal<number>(props.read());
  return <Slider min={props.min} max={props.max} step={props.step ?? (props.max - props.min) / 200} value={value} onChange={(v: number) => {
    setValue(v);
    props.write(v);
  }} />;
}

const ON_LIGHT: i32 = 0x18181b, ON_DARK: i32 = 0xe4e4e7, DIMMED: i32 = 0xa1a1aa, TAB_ICON = 14;

/** A button with an icon before its label, or the icon alone with no label. The names are listed in zinc.json. */
export function IconButton(props: { icon: string; label?: string; variant?: string; onClick: () => void }): i32 {
  const variant = props.variant ?? 'ghost';
  const colour = variant === 'default' ? ON_LIGHT : ON_DARK;
  return <Button size="sm" variant={variant} onClick={props.onClick}>
    <View className="flex-row items-center gap-1">
      <Icon name={props.icon} size={TAB_ICON} color={() => colour} />
      {props.label !== undefined && <Text className={`text-xs ${variant === 'default' ? 'text-zinc-900' : 'text-zinc-200'}`}>{props.label as string}</Text>}
    </View>
  </Button>;
}

/** Tabs whose triggers have an icon. */
export function IconTabs(props: { items: string[]; icons: string[]; selected: () => i32; onSelect: (index: i32) => void }): i32 {
  return <View className="flex-row flex-wrap gap-1 p-1 rounded-md bg-zinc-800" role="tablist">
    {props.items.map((label: string, i: i32) => <View role="tab" className={`flex-row items-center gap-1 h-[28] px-2 rounded cursor-pointer ${props.selected() === i ? 'bg-zinc-950' : ''}`} onClick={() => props.onSelect(i)}>
      <Icon name={props.icons[i]} size={TAB_ICON} color={() => props.selected() === i ? ON_DARK : DIMMED} />
      <Text className={`text-xs ${props.selected() === i ? 'text-zinc-100' : 'text-zinc-400'}`}>{label}</Text>
    </View>)}
  </View>;
}
