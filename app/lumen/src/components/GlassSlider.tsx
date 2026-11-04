// A macOS slider: a thin track, the accent colour up to a small round knob.
import * as ui from 'zinc:ui';
import { createNodeRef, createSignal } from 'zinc:ui/solid';
import { Symbol } from './Symbol';
import { TEXT_SMALL, accent, palette } from '../theme';

const KNOB = 16, TRACK = 4, RAIL = 20;
const CENTRE_TOP = (RAIL - TRACK) / 2;

export function GlassSlider(props: { label: string; icon?: string; value: () => number; min?: number; max?: number; format?: (v: number) => string; onChange: (v: number) => void; onRelease?: () => void }): i32 {
  const min = props.min ?? 0, max = props.max ?? 1;
  const rail = createNodeRef();
  const [held, setHeld] = createSignal<boolean>(false);
  const fraction = (): number => Math.max(0, Math.min(1, (props.value() - min) / (max - min)));
  const shown = (): string => props.format !== undefined ? props.format(props.value()) : `${Math.round(fraction() * 100)} %`;
  // The knob's centre travels between half a knob from each end.
  const moveTo = (x: number): void => {
    const n = ui.inspectNode(rail.node);
    if (n === null || n.lw <= KNOB) return;
    const t = Math.max(0, Math.min(1, (x - KNOB / 2) / (n.lw - KNOB)));
    props.onChange(min + t * (max - min));
  };
  return <View className="gap-[1px]">
    <View className="flex-row justify-between">
      <Text className={`${TEXT_SMALL} font-medium ${palette().secondary}`}>{props.label}</Text>
      <Text className={`${TEXT_SMALL} ${palette().secondary}`}>{shown()}</Text>
    </View>
    <View className="flex-row items-center gap-2">
      {props.icon !== undefined ? <Symbol name={props.icon} side={16} pointSize={12} /> : null}
      <View ref={rail} className={`relative grow h-[${RAIL}px] cursor-pointer`} grab="keep-x" role="slider" focusable aria-label={props.label}
        onPointerDown={(e: ui.PointerEvent) => { setHeld(true); moveTo(e.x); }}
        onPointerMove={(e: ui.PointerEvent) => { if (held()) moveTo(e.x); }}
        onPointerUp={(e: ui.PointerEvent) => { setHeld(false); if (props.onRelease !== undefined) props.onRelease(); }}
        onPointerCancel={(e: ui.PointerEvent) => { setHeld(false); }}
        onKeyDown={(e: ui.KeyEvent) => {
          const direction = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
          if (direction === 0) return;
          props.onChange(Math.max(min, Math.min(max, props.value() + direction * (max - min) / 50)));
          e.preventDefault();
        }}>
        <View className={`absolute left-0 right-0 top-[${CENTRE_TOP}px] h-[${TRACK}px] rounded-full ${palette().track}`} />
        <View className={`absolute left-0 top-[${CENTRE_TOP}px] h-[${TRACK}px] w-[${KNOB}px] rounded-l-full ${accent()}`} />
        {/* The padding keeps the knob in the rail: the fill's percentage is of the width less one knob, and the knob overlaps its end. */}
        <View className={`flex-row items-center h-full px-[${KNOB / 2}px]`}>
          <View className={`h-[${TRACK}px] ${accent()} w-[${Math.round(fraction() * 1000) / 10}%]`} />
          <View className={`w-[${KNOB}px] h-[${KNOB}px] -mx-[${KNOB / 2}px] shrink-0 rounded-full ${palette().knob}`} />
        </View>
      </View>
    </View>
  </View>;
}
