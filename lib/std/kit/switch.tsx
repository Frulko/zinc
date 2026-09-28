/** @jsxHelpers ./host */
// zinc:ui/kit — Switch: an on/off toggle with an optional label. `checked` is an accessor (a signal getter under
// Solid, `() => value` under React); the switch reports clicks through `onChange` and never flips itself.
//
//   <Switch checked={wifi} onChange={setWifi} label="Wi-Fi" />
import { theme } from './theme';

export interface SwitchProps {
  checked: () => boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

/** Track colours: the focused shade follows the state, so a clicked switch keeps showing its new state. */
function trackClass(on: boolean): string {
  const t = theme();
  return on ? `bg-${t.primary} focus:bg-${t.primaryFocus}` : `bg-${t.input} focus:bg-${t.input}`;
}

/** Thumb colour: contrasts with the track in both themes. */
function thumbColor(on: boolean): string {
  const t = theme();
  if (on) return t.primaryForeground;
  return t.name === 'dark' ? t.foreground : 'white';
}

export function Switch(props: SwitchProps): i32 {
  return <View class="flex-row items-center gap-2">
    <View class={`flex-row w-9 h-5 p-0.5 rounded-full transition-colors ${trackClass(props.checked())}`}
      onClick={() => props.onChange(!props.checked())}>
      <View class={`w-4 h-4 rounded-full shadow-sm bg-${thumbColor(props.checked())}`} style={{ translateX: props.checked() ? 16 : 0 }} />
    </View>
    <Show when={props.label !== undefined}>
      <Text class={`text-sm font-medium text-${theme().foreground}`}>{props.label ?? ''}</Text>
    </Show>
  </View>;
}
