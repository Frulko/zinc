/** @jsxHelpers ./host */
// zinc:ui/kit — Switch: an on/off toggle with an optional label. `checked` is an accessor (a signal getter under
// Solid, `() => value` under React); the switch reports clicks through `onChange` and never flips itself.
// Its shape is the platform look's (zinc:ui/platform: iOS 51 x 31, Material 3 52 x 32 with a thumb that grows, macOS 38 x 22, neutral 36 x 20);
// with the kit's own theme the platform's colours, with a theme of the app's its primary. iOS gives a light haptic when it flips.
//
//   <Switch checked={wifi} onChange={setWifi} label="Wi-Fi" />
import { theme } from './theme';
import { look, toggleFeedback } from '../platform/index';

export interface SwitchProps {
  checked: () => boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  /** The name a screen reader says when no label is shown (React Native's accessibilityLabel); the label otherwise. */
  accessibilityLabel?: string;
}

/** The platform's colours rather than the theme's: a platform look with the kit's built-in theme. */
function platformColors(): boolean { return look().name !== 'neutral' && theme().name === 'vars'; }

/** Track colours: the focused shade follows the state, so a clicked switch keeps showing its new state. */
function trackClass(on: boolean): string {
  const t = theme(), L = look();
  const edge = L.outline > 0 ? ` border-[${L.outline}px] border-${on ? (platformColors() ? '[var(--pfSwitchOn)]' : t.primary) : '[var(--pfBorder)]'}` : '';
  if (platformColors()) return (on ? 'bg-[var(--pfSwitchOn)] focus:bg-[var(--pfSwitchOn)]' : 'bg-[var(--pfSwitchOff)] focus:bg-[var(--pfSwitchOff)]') + edge;
  return (on ? `bg-${t.primary} focus:bg-${t.primaryFocus}` : `bg-${t.input} focus:bg-${t.input}`) + edge;
}

/** Thumb colour: contrasts with the track in both themes. */
function thumbColor(on: boolean): string {
  const t = theme();
  if (platformColors()) return on ? '[var(--pfThumb)]' : '[var(--pfThumbDim)]';
  if (on) return t.primaryForeground;
  return t.name === 'dark' ? t.foreground : 'white';
}

export function Switch(props: SwitchProps): i32 {
  const L = look();
  const flip = (): void => { toggleFeedback(); props.onChange(!props.checked()); };
  if (L.name === 'neutral') return <View className="flex-row items-center gap-2">
    <View className={`flex-row w-9 h-5 p-0.5 rounded-full transition-colors ${trackClass(props.checked())}`} onClick={flip} role="switch" aria-checked={String(props.checked())} aria-label={props.accessibilityLabel ?? props.label ?? ''}>
      <View className={`w-4 h-4 rounded-full shadow-sm bg-${thumbColor(props.checked())}`} style={{ translateX: props.checked() ? 16 : 0 }} />
    </View>
    <Show when={props.label !== undefined}>
      <Text className={`text-sm font-medium text-${theme().foreground}`}>{props.label ?? ''}</Text>
    </Show>
  </View>;
  // the thumb's left edge inside the border: centred on the left of the track when off, on its right when on (Material's thumb grows from 16 to 24)
  const inner = L.switchW - 2 * L.outline, innerH = L.switchH - 2 * L.outline;
  const k = (on: boolean): number => on ? L.thumbOn : L.thumbOff;
  const x = (on: boolean): number => on ? inner - (innerH - L.thumbOn) / 2 - L.thumbOn : (innerH - L.thumbOff) / 2;
  return <View className="flex-row items-center gap-2">
    <View className={`flex-row items-center w-[${L.switchW}px] h-[${L.switchH}px] rounded-full transition-colors ${trackClass(props.checked())}`} onClick={flip} role="switch" aria-checked={String(props.checked())} aria-label={props.accessibilityLabel ?? props.label ?? ''}>
      <View className={`w-[${k(props.checked())}px] h-[${k(props.checked())}px] rounded-full ${L.outline > 0 ? '' : 'shadow-sm'} bg-${thumbColor(props.checked())}`} style={{ translateX: x(props.checked()) }} />
    </View>
    <Show when={props.label !== undefined}>
      <Text className={`${L.small} text-${theme().foreground}`}>{props.label ?? ''}</Text>
    </Show>
  </View>;
}
