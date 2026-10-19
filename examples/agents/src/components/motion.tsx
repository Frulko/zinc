// The app's few animations. All are engine tweens (zinc:ui `animate`): no reactive work per frame, and nothing runs
// once they end, so a still window paints nothing.
import { NodeRef, animate, after, onMount } from 'zinc:ui/solid';
import { createNodeRef } from 'zinc:ui/solid';

/** Entrance length, ms: short enough to never make anyone wait. */
const ENTER_MS = 180;

/**
 * Fades `ref` in from `dy` pixels below its place once it is mounted. The node starts with
 * `style={{ opacity: 0, translateY: dy }}` (enterStyle) so its first frame is already the start of the move.
 */
export function enter(ref: NodeRef, dy: number): void {
  onMount(() => {
    animate(ref, 'opacity', 1, { dur: ENTER_MS, easing: 'out' });
    animate(ref, 'translateY', 0, { dur: ENTER_MS, easing: 'out' });
  });
}

/** Three dots that pulse one after the other while `active()` holds, for an agent that is thinking. */
export function ThinkingDots(props: { color: i32; active: () => boolean }): i32 {
  const dots = [createNodeRef(), createNodeRef(), createNodeRef()];
  const pulse = async (dot: NodeRef, delay: i32): Promise<void> => {
    await after(delay);
    while (props.active()) {
      await animate(dot, 'opacity', 1, { dur: 360, easing: 'in-out' });
      await animate(dot, 'opacity', 0.2, { dur: 360, easing: 'in-out' });
    }
  };
  onMount(() => { for (let i = 0; i < dots.length; i++) pulse(dots[i], i * 120); });
  return <View className="flex-row items-center gap-1 h-[14]">
    {dots.map((d: NodeRef) => <View ref={d} className="w-[6] h-[6] rounded-full" style={{ backgroundColor: props.color, opacity: 0.2 }} />)}
  </View>;
}
