// How far a build is: step index over the total, as a filled track.
import { Show } from 'zinc:ui/solid';
import { theme, hex } from 'zinc:ui/nuxt';

export type ProgressBarProps = { done: () => i32; total: () => i32; color: () => string };

export function ProgressBar(p: ProgressBarProps): i32 {
  const percent = (): i32 => p.total() <= 0 ? 0 : Math.round(100 * Math.min(p.done(), p.total()) / p.total()) as i32;
  return <View className={`h-2 w-full rounded-full bg-${hex(theme().bgAccented)}`}>
    <Show when={percent() > 0}><View className={`h-2 rounded-full w-[${percent()}%] bg-${hex(p.color())}`} /></Show>
  </View>;
}
