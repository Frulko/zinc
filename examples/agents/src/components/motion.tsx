// The app's few animations. All are engine tweens (zinc:ui `animate`): no reactive work per frame, and nothing runs
// once they end, so a still window paints nothing. With reduced motion (`ui.prefersReducedMotion()`) nothing moves:
// entrances are instant, the spinner stands still.
import { NodeRef, animate, onMount } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';

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

export { Spinner } from 'zinc:ui/kit';
