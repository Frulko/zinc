/** @jsxHelpers zinc:ui/kit/host */
// Sliders share one rail and gesture lifecycle. Touches commit only on release or an intentional drag.
import { createNodeRef, NodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme } from './theme';
import { look } from '../platform/index';
import { nativeControl, renderSlot, componentRef } from './host';

export interface SliderOptions {
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  vertical?: boolean;
  logarithmic?: boolean;
  markers?: number[];
  accessibilityLabel?: string;
  format?: (value: number) => string;
  showValue?: boolean;
  reset?: number;
  className?: string;
}
export interface SliderProps extends SliderOptions { value: () => number; onChange: (value: number) => void }
export interface RangeSliderProps extends SliderOptions { low: () => number; high: () => number; onChange: (low: number, high: number) => void }

/** Clamp after snapping relative to min (including a final step that does not divide the range). */
function sliderValue(value: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(value)) return min;
  const snapped = step > 0 ? min + Math.round((value - min) / step) * step : value;
  return Math.max(min, Math.min(max, snapped));
}
function fraction(value: number, min: number, max: number, logarithmic: boolean): number {
  if (max <= min) return 0;
  const ratio = logarithmic && min > 0 ? Math.log(Math.max(min, value) / min) / Math.log(max / min) : (value - min) / (max - min);
  return Math.max(0, Math.min(1, ratio));
}
enum SliderGesture { Idle, Pressed, Dragging }
class SliderSession { state = SliderGesture.Idle; active: i32 = 0; down: number = 0; }

function SliderRail(p: SliderOptions, low: () => number, high: (() => number) | null, change: (index: i32, value: number) => void): i32 {
  const min = p.min ?? 0, max = Math.max(min, p.max ?? 100), step = p.step ?? 1;
  const vertical = p.vertical === true, logarithmic = p.logarithmic === true;
  const rail = createNodeRef(), first = createNodeRef(), second = createNodeRef();
  const k = look().sliderThumb, track = look().sliderTrack;
  const gesture = componentRef(new SliderSession()).current;
  const transition = (next: SliderGesture): void => {
    if (next === SliderGesture.Pressed && gesture.state !== SliderGesture.Idle) return;
    if (next === SliderGesture.Dragging && gesture.state !== SliderGesture.Pressed) return;
    gesture.state = next;
  };
  const ratio = (value: number): number => fraction(value, min, max, logarithmic);
  const text = (value: number): string => p.format !== undefined ? (p.format as (value: number) => string)(value) : String(value);
  const commit = (index: i32, value: number): void => {
    if (p.disabled === true) return;
    let next = sliderValue(value, min, max, step);
    if (high !== null) next = index === 0 ? Math.min(next, high()) : Math.max(next, low());
    change(index, next);
  };
  const at = (position: number): number => {
    const node = ui.inspectNode(rail.node);
    const length = node === null ? 0 : vertical ? node.lh : node.lw;
    const r = Math.max(0, Math.min(1, (position - k / 2) / Math.max(1, length - k)));
    const t = vertical ? 1 - r : r;
    return logarithmic && min > 0 ? min * Math.pow(max / min, t) : min + t * (max - min);
  };
  const key = (index: i32, current: number, e: ui.KeyEvent): void => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && p.reset !== undefined) { commit(index, p.reset); e.preventDefault(); return; }
    const direction = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (direction === 0 && e.key !== 'Home' && e.key !== 'End' && e.key !== 'PageUp' && e.key !== 'PageDown') return;
    const increment = (step > 0 ? step : (max - min) / 100) * (e.shift || e.key === 'PageUp' || e.key === 'PageDown' ? 10 : 1);
    const value = e.key === 'Home' ? min : e.key === 'End' ? max : current + increment * (e.key === 'PageUp' ? 1 : e.key === 'PageDown' ? -1 : direction);
    commit(index, value); e.preventDefault();
  };
  const thumb = (index: i32, value: () => number, ref: NodeRef): i32 => <View className={`absolute left-0 top-0 right-0 bottom-0 ${vertical ? 'flex-col' : 'flex-row'} items-center`}>
    <View className={vertical ? `h-${Math.round((1 - ratio(value())) * 10000)}/10000 shrink-0` : `w-${Math.round(ratio(value()) * 10000)}/10000 shrink-0`} />
    <Button ref={ref} role="slider" aria-label={(p.accessibilityLabel ?? 'Value') + (high === null ? '' : index === 0 ? ' minimum' : ' maximum')}
      aria-valuenow={String(value())} aria-valuetext={text(value())} aria-valuemin={String(index === 1 ? low() : min)} aria-valuemax={String(index === 0 && high !== null ? high() : max)} aria-orientation={vertical ? 'vertical' : 'horizontal'}
      disabled={p.disabled ?? false} onKeyDown={(e: ui.KeyEvent) => key(index, value(), e)}
      className={`w-[${k}px] h-[${k}px] shrink-0 rounded-full border border-${theme().input} bg-${theme().card}`}
      style={{ translateX: vertical ? 0 : -k / 2, translateY: vertical ? -k / 2 : 0 }} />
  </View>;
  const node = <View ref={rail} disabled={p.disabled ?? false} grab={vertical ? 'keep' : 'keep-x'} className={`${vertical ? 'w-[30px] h-[160px]' : 'h-[30px] w-full'} ${p.disabled === true ? 'opacity-45' : ''} ${p.className ?? ''}`}
      onPointerDown={(e: ui.PointerEvent) => {
        if (e.button !== 0) return;
        gesture.down = vertical ? e.y : e.x;
        const value = at(gesture.down);
        gesture.active = high !== null && Math.abs(value - high()) < Math.abs(value - low()) ? 1 : 0;
        ui.focusNode(gesture.active === 0 ? first.node : second.node);
        transition(SliderGesture.Pressed);
      }}
      onPointerMove={(e: ui.PointerEvent) => {
        if (gesture.state === SliderGesture.Idle) return;
        const position = vertical ? e.y : e.x;
        if (gesture.state === SliderGesture.Pressed && Math.abs(position - gesture.down) > 4) transition(SliderGesture.Dragging);
        if (gesture.state === SliderGesture.Dragging) commit(gesture.active, at(position));
      }}
      onPointerUp={(e: ui.PointerEvent) => {
        const tapped = gesture.state === SliderGesture.Pressed;
        transition(SliderGesture.Idle);
        if (tapped) commit(gesture.active, at(vertical ? e.y : e.x));
      }} onPointerCancel={(e: ui.PointerEvent) => transition(SliderGesture.Idle)}>
      <View className={`absolute ${vertical ? 'top-[' + k / 2 + 'px] bottom-[' + k / 2 + 'px] left-[' + (30 - track) / 2 + 'px] w-[' + track + 'px]' : 'left-[' + k / 2 + 'px] right-[' + k / 2 + 'px] top-[' + (30 - track) / 2 + 'px] h-[' + track + 'px]'} rounded-full bg-${theme().muted}`}>
        <View className={`${vertical ? 'flex-col' : 'flex-row'} w-full h-full`}>
          <View className={vertical ? `h-${Math.round((high === null ? 1 - ratio(low()) : 1 - ratio(high())) * 10000)}/10000` : `w-${Math.round((high === null ? 0 : ratio(low())) * 10000)}/10000`} />
          <View className={`rounded-full bg-${theme().accent} ${vertical ? 'w-full h-' : 'h-full w-'}${Math.round((high === null ? ratio(low()) : ratio(high()) - ratio(low())) * 10000)}/10000`} />
        </View>
        {(p.markers ?? []).map((mark: number) => <View className={`absolute left-0 right-0 top-0 bottom-0 items-center ${vertical ? 'flex-col' : 'flex-row'}`}>
          <View className={vertical ? `h-${Math.round((1 - ratio(mark)) * 10000)}/10000 shrink-0` : `w-${Math.round(ratio(mark) * 10000)}/10000 shrink-0`} />
          <View className={`w-1 h-1 shrink-0 rounded-full bg-${theme().input}`} style={{ translateX: vertical ? 0 : -2, translateY: vertical ? -2 : 0 }} />
        </View>)}
      </View>
      <View className={`absolute ${vertical ? 'top-[' + k / 2 + 'px] bottom-[' + k / 2 + 'px] left-[15px] w-0' : 'left-[' + k / 2 + 'px] right-[' + k / 2 + 'px] top-[15px] h-0'}`}>
        {renderSlot(() => thumb(0, low, first))}
        <Show when={high !== null}>{renderSlot(() => thumb(1, high === null ? low : high, second))}</Show>
      </View>
    </View>;
  if (p.reset !== undefined) ui.onPointer(rail.node, ui.PDBL, (e: ui.PointerEvent) => { if (p.reset !== undefined) commit(gesture.active, p.reset); });
  if (high === null && !vertical && !logarithmic) nativeControl(rail.node, 'slider', () => ['axlabel', p.accessibilityLabel ?? 'Value', 'min', String(min), 'max', String(max), 'step', String(step), 'value', String(low()), 'enabled', p.disabled === true ? '0' : '1'], (value: string) => commit(0, parseFloat(value)));
  if (p.showValue === true) return <View className="flex-col gap-2">
    <Text className={`text-[12px] tabular-nums text-${theme().mutedForeground}`}>{text(low()) + (high === null ? '' : ' – ' + text(high()))}</Text>
    {renderSlot(() => node)}
  </View>;
  return node;
}
export function Slider(p: SliderProps): i32 { return SliderRail(p, p.value, null, (index: i32, value: number) => p.onChange(value)); }
export function RangeSlider(p: RangeSliderProps): i32 { return SliderRail(p, p.low, p.high, (index: i32, value: number) => p.onChange(index === 0 ? value : p.low(), index === 1 ? value : p.high())); }
