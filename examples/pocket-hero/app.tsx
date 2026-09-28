// Adapted from PocketJS apps/hero/app.tsx (MIT, © 2026 Yifeng "Evan" Wang): Zinc has no mergeProps, so the
// defaults are applied explicitly. Hero.tsx and Hero.ts are unchanged copies of the PocketJS sources.
import { idiv } from "@pocketjs/framework/solid/std";
import type { HeroProps } from "./app";
import HeroView from "./Hero.tsx";

export default function Hero(props: HeroProps) {
  const hz = props.presentationHz ?? 60;
  const step = props.spinnerFrameStep ?? 0;
  const headline = props.headline ?? "";
  return (
    <HeroView
      actionLabel={props.actionLabel ?? "Press Circle"}
      compact={props.compact ?? false}
      deviceLabel={props.deviceLabel ?? "running natively, no JS engine."}
      headline={headline !== "" ? headline : `JSX at ${hz} FPS.`}
      largeLayout={props.largeLayout ?? false}
      onAction={(count) => props.onAction?.(count)}
      presentationHz={hz}
      runtimeLabel={props.runtimeLabel ?? "ZINC + C++"}
      spinnerDelay={step > 0 && hz > 0 ? idiv(step * 1000, hz) : 100}
    />
  );
}
