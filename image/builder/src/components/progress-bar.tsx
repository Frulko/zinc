// How far a build is: step index over the total, as a filled track.
import { createNodeRef, createEffect, animate } from 'zinc:ui/solid';
import { getNumber, setNumber, prefersReducedMotion } from 'zinc:ui';
import { hex } from 'zinc:ui/nuxt';

export type ProgressBarProps = { done: () => i32; total: () => i32; color: () => string };

export function ProgressBar(p: ProgressBarProps): i32 {
  const percent = (): i32 => p.total() <= 0 ? 0 : Math.round(100 * Math.min(p.done(), p.total()) / p.total()) as i32;
  const fill = createNodeRef();
  const bar = <View className="h-2 w-full rounded-full bg-[#3b5140]" role="progressbar" aria-label="Build progress" aria-valuenow={percent()} aria-valuemin="0" aria-valuemax="100">
    <View ref={fill} className={`h-2 rounded-full bg-${hex(p.color())}`} style={{ widthPercent: 0 }} />
  </View>;
  createEffect(() => {
    const target = percent() / 100;
    if (prefersReducedMotion()) setNumber(fill.node, 'widthPercent', target);
    else if (getNumber(fill.node, 'widthPercent') !== target) animate(fill, 'widthPercent', target, { dur: 280, easing: 'out' });
  });
  return bar;
}
