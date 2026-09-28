/** @jsxHelpers ./host */
// zinc:ui/kit — Slider: a rail, a filled range and a round thumb. Click or tap anywhere on the rail to set the
// value (snapped to `step`). `value` is an accessor, like Progress.
//
//   <Slider value={volume} onChange={setVolume} min={0} max={100} step={5} />
import { NodeRef, createNodeRef } from 'zinc:ui/solid';
import { pointerX } from 'zinc:gfx';
import * as ui from 'zinc:ui';
import { theme } from './theme';

export interface SliderProps {
  value: () => number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  class?: string;
}

const THUMB: number = 16;   // thumb diameter in px (w-4)

/** Position of `value` in [min, max] as 0..100. */
function percent(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.max(0, Math.min(100, (value - min) * 100 / (max - min)));
}

/** Value under the pointer: the thumb centre travels from THUMB/2 to width - THUMB/2. */
function valueAtPointer(rail: NodeRef, min: number, max: number, step: number): number {
  const n = ui.inspectNode(rail.node);
  if (n === null || n.lw <= THUMB) return min;
  const t = Math.max(0, Math.min(1, (pointerX() - n.x - THUMB / 2) / (n.lw - THUMB)));
  const raw = min + t * (max - min);
  return step > 0 ? Math.round(raw / step) * step : raw;
}

export function Slider(props: SliderProps): i32 {
  const min = props.min ?? 0, max = props.max ?? 100, step = props.step ?? 1;
  const rail = createNodeRef();
  // ponytail: click-to-set only; dragging needs pointer-move events from zinc:ui
  return <View ref={rail} class={`flex-row items-center h-5 pr-4 rounded-full focus:bg-${theme().card} ${props.class ?? ''}`}
    onClick={() => props.onChange(valueAtPointer(rail, min, max, step))}>
    <View class={`absolute left-0 right-0 top-[7px] h-1.5 rounded-full bg-${theme().muted}`} />
    <View class={`h-1.5 rounded-full bg-${theme().primary} w-${Math.round(percent(props.value(), min, max))}/100`} />
    <View class={`w-4 h-4 rounded-full border-2 border-${theme().primary} bg-${theme().card} shadow-sm`} />
  </View>;
}
