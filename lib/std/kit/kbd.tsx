/** @jsxHelpers ./host */
// zinc:ui/kit — Kbd: a keyboard key or shortcut hint.
//
//   <Kbd label="Space" />   <Kbd label="⌘K" />
import { theme } from './theme';

export interface KbdProps { label: string }

export function Kbd(props: KbdProps): i32 {
  return <View class={`flex-row items-center justify-center h-5 px-1.5 rounded border border-${theme().border} bg-${theme().muted}`}>
    <Text class={`text-xs font-medium text-${theme().mutedForeground}`}>{props.label}</Text>
  </View>;
}
