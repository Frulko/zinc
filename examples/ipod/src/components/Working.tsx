// What shows while a list is worked out a slice at a time (services/slice.ts): a turning ring and a line ("Working out your shelves…"),
// and placeholder cards that breathe. Both are paint-only animations of the engine (rotate, opacity): no layout per frame, and they stop
// when they leave the screen or the motion is reduced.
import * as ui from 'zinc:ui';
import { animate, onMount, onCleanup, NodeRef } from 'zinc:ui/solid';
import { Spinner } from 'zinc:ui/kit';
import { fg, color, MUTED } from '../constants';

export function Working(props: { text: string }): i32 {
  return <View className="flex-row items-center gap-2">
    <Spinner size={14} color={() => color(MUTED)} active={() => true} />
    <Text className={`text-[13px] ${fg(MUTED)}`} numberOfLines={1}>{props.text}</Text>
  </View>;
}

/** Called in a component: the node of `ref` fades between full and 55% opacity, a breath every 1.6 s, while the component is shown. */
export function breathe(ref: NodeRef): void {
  let gone = false;
  onCleanup(() => { gone = true; });
  const loop = async (): Promise<void> => {
    while (!gone && !ui.prefersReducedMotion()) {
      await animate(ref, 'opacity', 0.55, { dur: 800, easing: 'in-out' });
      if (gone) return;
      await animate(ref, 'opacity', 1, { dur: 800, easing: 'in-out' });
    }
  };
  onMount(() => { loop(); });
}
