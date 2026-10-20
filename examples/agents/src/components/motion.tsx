// The app's few animations. All are engine tweens (zinc:ui `animate`): no reactive work per frame, and nothing runs
// once they end, so a still window paints nothing. With reduced motion (`ui.prefersReducedMotion()`) nothing moves:
// entrances are instant, the dots and the spinner stand still.
import { NodeRef, animate, after, onMount, onCleanup, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';

/** Entrance length, ms: short enough to never make anyone wait. */
const ENTER_MS = 180;

/** True when the user asked the system for less motion. */
export function still(): boolean { return ui.prefersReducedMotion(); }

/** Fades `ref` in from `dy` pixels below its place once it is mounted; the node starts at `enterY(dy)` and `enterOpacity()`. */
export function enter(ref: NodeRef, dy: number): void {
  if (still()) return;
  onMount(() => {
    animate(ref, 'opacity', 1, { dur: ENTER_MS, easing: 'out' });
    animate(ref, 'translateY', 0, { dur: ENTER_MS, easing: 'out' });
  });
}
export function enterOpacity(): number { return still() ? 1 : 0; }
export function enterY(dy: number): number { return still() ? 0 : dy; }

/** Three dots that pulse one after the other while `active()` holds, for an agent that is thinking. */
export function ThinkingDots(props: { color: i32; active: () => boolean }): i32 {
  const dots = [createNodeRef(), createNodeRef(), createNodeRef()];
  let gone = false;
  onCleanup(() => { gone = true; });
  const pulse = async (dot: NodeRef, delay: i32): Promise<void> => {
    await after(delay);
    while (props.active() && !gone) {
      await animate(dot, 'opacity', 1, { dur: 360, easing: 'in-out' });
      if (gone) return;
      await animate(dot, 'opacity', 0.2, { dur: 360, easing: 'in-out' });
    }
  };
  if (!still()) onMount(() => { for (let i = 0; i < dots.length; i++) pulse(dots[i], i * 120); });
  return <View className="flex-row items-center gap-1 h-[14]">
    {dots.map((d: NodeRef) => <View ref={d} className="w-[6] h-[6] rounded-full" style={{ backgroundColor: props.color, opacity: still() ? 0.6 : 0.2 }} />)}
  </View>;
}

/** A ring that turns while `active()` holds (a running tool); still with reduced motion. */
export function Spinner(props: { size: number; color: () => i32; active: () => boolean }): i32 {
  const ref = createNodeRef();
  let gone = false;
  onCleanup(() => { gone = true; });
  const spin = async (): Promise<void> => {
    while (props.active() && !gone) {
      await animate(ref, 'rotate', 360, { dur: 900, easing: 'linear' });
      if (gone) return;
      ui.setNumber(ref.node, 'rotate', 0);
    }
  };
  if (!still()) onMount(() => { spin(); });
  return <View ref={ref} style={{ width: props.size, height: props.size }}>
    <Icon name="loader-circle" size={props.size} color={props.color} />
  </View>;
}
