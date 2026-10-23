// Shared activity indicator; the engine drives rotation without reactive work per frame.
import { animate, onMount, onCleanup, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';

/** A ring that turns while `active()` holds (a running tool); still with reduced motion. */
export function Spinner(props: { size: number; color: () => i32; active: () => boolean }): i32 {
  const ref = createNodeRef();
  let gone = false;
  onCleanup(() => { gone = true; });
  const spin = async (): Promise<void> => {
    while (props.active() && !gone && !ui.prefersReducedMotion()) {
      await animate(ref, 'rotate', 360, { dur: 900, easing: 'linear' });
      if (gone) return;
      ui.setNumber(ref.node, 'rotate', 0);
    }
  };
  if (!ui.prefersReducedMotion()) onMount(() => { spin(); });
  return <View ref={ref} aria-label="Loading" style={{ width: props.size, height: props.size }}>
    <Icon name="loader-circle" size={props.size} color={props.color} />
  </View>;
}
