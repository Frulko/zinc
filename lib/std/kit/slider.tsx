/** @jsxHelpers ./host */
// zinc:ui/kit — Slider: a rail, a filled range and a round thumb. Press anywhere on the rail and drag to set the
// value (snapped to `step`); when focused, the arrow keys step it. `value` is an accessor, like Progress.
//
//   <Slider value={volume} onChange={setVolume} min={0} max={100} step={5} />
import { NodeRef, createNodeRef } from 'zinc:ui/solid';
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

/** Value at local x on the rail: the thumb centre travels from THUMB/2 to width - THUMB/2. */
function valueAt(rail: NodeRef, x: number, min: number, max: number, step: number): number {
  const n = ui.inspectNode(rail.node);
  if (n === null || n.lw <= THUMB) return min;
  const t = Math.max(0, Math.min(1, (x - THUMB / 2) / (n.lw - THUMB)));
  const raw = min + t * (max - min);
  return step > 0 ? Math.round(raw / step) * step : raw;
}

export function Slider(props: SliderProps): i32 {
  const min = props.min ?? 0, max = props.max ?? 100, step = props.step ?? 1;
  const rail = createNodeRef();
  let dragging = false;
  const nudge = (dir: number): void => {
    const v = props.value() + dir * (step > 0 ? step : (max - min) / 20);
    props.onChange(Math.max(min, Math.min(max, v)));
  };
  // the rail captures the pointer on press, so the drag keeps going outside it
  return <View ref={rail} focusable class={`flex-row items-center h-5 pr-4 rounded-full cursor-pointer focus:bg-${theme().card} ${props.class ?? ''}`}
    onPointerDown={(e: ui.PointerEvent) => { dragging = true; props.onChange(valueAt(rail, e.x, min, max, step)); }}
    onPointerMove={(e: ui.PointerEvent) => { if (dragging) props.onChange(valueAt(rail, e.x, min, max, step)); }}
    onPointerUp={(e: ui.PointerEvent) => { dragging = false; }}
    onKeyDown={(e: ui.KeyEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { nudge(-1); e.preventDefault(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { nudge(1); e.preventDefault(); }
    }}>
    <View class={`absolute left-0 right-0 top-[7px] h-1.5 rounded-full bg-${theme().muted}`} />
    <View class={`h-1.5 rounded-full bg-${theme().primary} w-${Math.round(percent(props.value(), min, max))}/100`} />
    <View class={`w-4 h-4 rounded-full border-2 border-${theme().primary} bg-${theme().card} shadow-sm`} />
  </View>;
}
