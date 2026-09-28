// Compact building blocks for a 240 px wide screen, in the kit's theme tokens (zinc:ui/kit): the kit's own cards
// and lists are sized for desktop windows, these keep its look (hairline borders, 12 px radii, one accent) at a
// third of the padding. No shadows: a blurred edge costs rasterizer time on every repaint.
import { untrack } from 'zinc:ui/solid';
import { tailwindColor } from 'zinc:ui';
import { theme, Theme } from 'zinc:ui/kit';

/** The theme, read without subscribing: a class built from it is computed once and its effect is dropped (an effect
 *  costs a few hundred bytes; the whole UI has ~160 KiB on the ESP32). Switching the theme rebuilds the UI instead
 *  (app/state.ts setDark). */
export function tk(): Theme { return untrack(theme); }
/** Theme token ('indigo-500') as 0xRRGGBB for canvas drawing. */
export function rgb(token: string): u32 { const c = tailwindColor(token); return c < 0 ? 0x71717a : c; }

/** A rounded surface with a hairline border. */
export function Panel(props: { class?: string; children: () => i32 }): i32 {
  return <View class={`flex-col rounded-xl border border-${tk().border} bg-${tk().card} ${props.class ?? ''}`}>
    {props.children()}
  </View>;
}

/** Small upper-case caption above a group. */
export function Caption(props: { text: string }): i32 {
  return <Text class={`text-[10px] font-semibold tracking-wider text-${tk().mutedForeground}`}>{props.text}</Text>;
}

/** A label on the left, a live value on the right (system figures, sensor readings). */
export function InfoRow(props: { label: string; value: () => string }): i32 {
  return <View class="flex-row items-center justify-between px-3 h-7">
    <Text class={`text-xs text-${tk().mutedForeground}`}>{props.label}</Text>
    <Text class={`text-xs font-semibold text-${tk().foreground}`}>{props.value()}</Text>
  </View>;
}

/** Square check box with a label; `checked` is an accessor, `onChange` decides (like the kit Switch). */
export function Checkbox(props: { checked: () => boolean; onChange: (on: boolean) => void; label: string }): i32 {
  // tappable rows set a focus fill (the panel's own colour): it replaces zinc:ui's yellow keyboard-focus ring
  return <View class={`flex-row items-center gap-2 h-7 focus:bg-${tk().card}`} onClick={() => props.onChange(!props.checked())}>
    <View class={`w-[18] h-[18] rounded-md items-center justify-center transition-colors ${props.checked() ? `bg-${tk().accent}` : `border-2 border-${tk().input}`}`}>
      <Image src={props.checked() ? 'check.svg' : ''} class="w-3 h-3" />
    </View>
    <Text class={`text-sm text-${tk().foreground}`}>{props.label}</Text>
  </View>;
}

/** Round radio button; the group is the caller's list of Radios over one selected index. */
export function Radio(props: { selected: () => boolean; onSelect: () => void; label: string }): i32 {
  return <View class={`flex-row items-center gap-2 h-7 focus:bg-${tk().card}`} onClick={() => props.onSelect()}>
    <View class={`w-[18] h-[18] rounded-full items-center justify-center border-2 ${props.selected() ? `border-${tk().accent}` : `border-${tk().input}`}`}>
      <View class={`w-2 h-2 rounded-full ${props.selected() ? `bg-${tk().accent}` : 'bg-transparent'}`} />
    </View>
    <Text class={`text-sm text-${tk().foreground}`}>{props.label}</Text>
  </View>;
}

/** Segmented control (the kit Tabs at text-xs size, so four segments fit in 220 px). */
export function Segmented(props: { items: string[]; selected: () => i32; onSelect: (i: i32) => void; class?: string }): i32 {
  return <View class={`flex-row p-0.5 gap-0.5 rounded-lg bg-${tk().muted} ${props.class ?? ''}`}>
    {props.items.map((label: string, i: i32) =>
      <View class={`grow flex-row items-center justify-center h-6 rounded-md ${props.selected() === i ? `bg-${tk().card} focus:bg-${tk().card}` : `bg-transparent focus:bg-${tk().muted}`}`}
        onClick={() => props.onSelect(i)}>
        <Text class={`text-xs font-medium text-${props.selected() === i ? tk().foreground : tk().mutedForeground}`}>{label}</Text>
      </View>)}
  </View>;
}
