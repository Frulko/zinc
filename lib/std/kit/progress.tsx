/** @jsxHelpers ./host */
// zinc:ui/kit — Progress: a thin rounded bar, 0 to 100. `value` is an accessor so the bar follows a signal (Solid)
// or the latest render (React).
//
//   <Progress value={() => download()} />
import { theme } from './theme';

export interface ProgressProps {
  value: () => number;   // 0..100
  accent?: boolean;      // accent colour instead of the primary one
  class?: string;
}

/** Width of the indicator as a fraction class of the track ('w-42/100'). */
function widthClass(value: number): string {
  return `w-${Math.round(Math.max(0, Math.min(100, value)))}/100`;
}

export function Progress(props: ProgressProps): i32 {
  const fill = (): string => (props.accent ?? false) ? theme().accent : theme().primary;
  return <View class={`flex-row h-2 w-full rounded-full overflow-hidden bg-${theme().muted} ${props.class ?? ''}`}>
    <View class={`rounded-full bg-${fill()} ${widthClass(props.value())}`} />
  </View>;
}
