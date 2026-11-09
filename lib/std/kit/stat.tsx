/** @jsxHelpers zinc:ui/kit/host */
// zinc:ui/kit — Stat: a metric tile (a label, a large live value with an optional unit, a hint line), like the
// cards at the top of a shadcn dashboard.
//
//   <Stat label="Temperature" value={() => temp().toFixed(1)} unit="°C" hint="sensor 1, every 100 ms" />
import { theme } from './theme';
import { renderSlot, componentRef, componentEffect } from './host';
import * as ui from 'zinc:ui';
import { themeColor } from './theme';
import { stroke } from 'zinc:gfx';

export interface StatProps {
  label: string;
  value: () => string;
  unit?: string;
  hint?: string;
  className?: string;
  children?: () => i32;   // shown on the label row, on the right (a Badge, a status dot)
  delta?: () => number;
  deltaLabel?: string;
  lowerIsBetter?: boolean;
  history?: () => number[];
}

export function Stat(props: StatProps): i32 {
  return <View className={`flex-col gap-1 p-4 rounded-[18px] border border-${theme().border} bg-${theme().card} ${props.className ?? ''}`}>
    <View className="flex-row items-center justify-between gap-2">
      <Text className={`text-sm font-medium text-${theme().mutedForeground}`}>{props.label}</Text>
      {renderSlot(props.children)}
    </View>
    <View className="flex-row items-end gap-1">
      <Text className={`text-[28px] font-medium tabular-nums text-${theme().foreground}`}>{props.value()}</Text>
      <Show when={props.unit !== undefined}>
        <Text className={`text-sm pb-1 text-${theme().mutedForeground}`}>{props.unit ?? ''}</Text>
      </Show>
    </View>
    <Show when={props.delta !== undefined}><Text className={`text-[12px] tabular-nums text-${deltaColor(props)}`}>{deltaText(props)}</Text></Show>
    <Show when={props.history !== undefined}><MetricHistory values={() => props.history !== undefined ? props.history() : []} /></Show>
    <Show when={props.hint !== undefined}>
      <Text className={`text-xs text-${theme().mutedForeground}`}>{props.hint ?? ''}</Text>
    </Show>
  </View>;
}

function MetricHistory(p: { values: () => number[] }): i32 {
  const history = componentRef<number[]>([]);
  componentEffect(() => { history.current = p.values().filter((v: number) => Number.isFinite(v)); ui.repaint(); });
  return <Canvas className="h-8 w-full" style={{ lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
    const values = history.current;
    if (values.length < 2) return;
    let low = values[0], high = values[0];
    for (const v of values) { low = Math.min(low, v); high = Math.max(high, v); }
    const points: number[] = [];
    for (let i = 0; i < values.length; i++) { points.push(x + i * w / (values.length - 1)); points.push(y + h - 2 - (high === low ? 0.5 : (values[i] - low) / (high - low)) * (h - 4)); }
    stroke(points, 1.5, themeColor('accent') as u32, 255, false);
  }} />;
}

function deltaColor(p: StatProps): string {
  const d = p.delta !== undefined ? p.delta() : 0;
  return d === 0 ? theme().mutedForeground : (p.lowerIsBetter === true ? d < 0 : d > 0) ? theme().success : theme().destructive;
}
function deltaText(p: StatProps): string {
  const d = p.delta !== undefined ? p.delta() : 0;
  return (d > 0 ? '+' : '') + String(d) + (p.deltaLabel !== undefined ? ' ' + p.deltaLabel : '');
}
export function Metric(p: StatProps): i32 { return Stat(p); }
