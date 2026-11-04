// A label beside a control; a number field that commits on each change; a slider over a value of the show.
import { Slider } from 'zinc:ui/kit';
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
