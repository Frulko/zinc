// Shared activity indicator; the compositor turns it (D182): no script work per frame, and it keeps turning while the script is busy.
import { animate, onMount, createEffect, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';

/** A ring that turns while `active()` holds (a running tool); still with reduced motion. */
export function Spinner(props: { size: number; color: () => i32; active: () => boolean }): i32 {
  const ref = createNodeRef();
  if (!ui.prefersReducedMotion()) onMount(() => {
    createEffect(() => {
      if (props.active()) animate(ref, 'rotate', 360, { dur: 900, easing: 'linear', iterations: Infinity });
      else animate(ref, 'rotate', 0, { dur: 0 });
    });
  });
  return <View ref={ref} aria-label="Loading" style={{ width: props.size, height: props.size }}>
    <Icon name="loader-circle" size={props.size} color={props.color} />
  </View>;
}
