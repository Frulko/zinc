/** @jsxHelpers ./host */
// zinc:ui/kit — CallStats: the health of a call, live: a quality badge (good, fair, poor, with its MOS), the loss, the round trip, the
// jitter and the bit rates, and a sparkline each for the loss, the round trip and the outgoing bit rate. It reads plain numbers, so any
// source fills it; zinc:webrtc's CallQuality gives them (its QualitySample has these fields):
//
//   const q = new CallQuality();   // q.update(await pc.getStats()) once a second
//   <CallStats sample={() => q.last} history={() => q.history} />
import * as ui from 'zinc:ui';
import { stroke } from 'zinc:gfx';
import { theme } from './theme';
import { renderSlot } from './host';
import { Badge } from './badge';

/** One reading: quality 'good' | 'fair' | 'poor' | 'unknown', mos 1 to 4.5, rttMs -1 when not known yet. */
export interface CallStatsSample {
  quality: string; mos: number; lossPct: number; rttMs: number; jitterMs: number; sendKbps: number; recvKbps: number;
}
export interface CallStatsProps {
  sample: () => CallStatsSample;
  /** The last readings, oldest first, for the sparklines. */
  history: () => CallStatsSample[];
  className?: string;
  children?: () => i32;   // more rows under the numbers (the codecs, a low data switch)
}

function badge(q: string): string { return q === 'good' ? 'success' : q === 'fair' ? 'warning' : q === 'poor' ? 'destructive' : 'secondary'; }

/** A line of the values over the box, scaled to their largest (at least `floor`); nothing drawn for fewer than two. */
function sparkline(values: number[], floor: number, color: i32, x: i32, y: i32, w: i32, h: i32): void {
  if (values.length < 2) return;
  let top = floor;
  for (const v of values) top = Math.max(top, v);
  const pts: number[] = [];
  const step = w / (values.length - 1);
  for (let i = 0; i < values.length; i++) { pts.push(x + i * step); pts.push(y + h - 1 - Math.max(0, values[i]) / top * (h - 2)); }
  stroke(pts, 1.5, color as u32, 255, false);
}

function Row(p: { label: string; value: () => string; values: () => number[]; floor: number; color: string }): i32 {
  const t = theme();
  return <View className="flex-row items-center gap-3">
    <Text className={`w-16 text-xs text-${t.mutedForeground}`}>{p.label}</Text>
    <Text className={`w-20 text-sm font-semibold text-${t.foreground}`}>{p.value()}</Text>
    <Canvas className="flex-1 h-6" onDraw={(x: i32, y: i32, w: i32, h: i32) => sparkline(p.values(), p.floor, ui.tailwindColor(p.color), x, y, w, h)} />
  </View>;
}

export function CallStats(props: CallStatsProps): i32 {
  const t = theme();
  const s = (): CallStatsSample => props.sample();
  const label = (): string => { const q = s().quality; return q === 'unknown' ? 'Measuring…' : q.substring(0, 1).toUpperCase() + q.substring(1); };
  const v = (f: (x: CallStatsSample) => number): (() => number[]) => () => props.history().map(f);
  return <View className={`flex-col gap-2 p-4 rounded-xl border border-${t.border} bg-${t.card} ${props.className ?? ''}`} aria-label="Call quality">
    <View className="flex-row items-center justify-between gap-2">
      <Text className={`text-sm font-medium text-${t.mutedForeground}`}>Call quality</Text>
      <Badge label={s().mos > 0 ? `${label()} · ${s().mos.toFixed(1)}` : label()} variant={badge(s().quality)} />
    </View>
    <Row label="Loss" value={() => `${s().lossPct.toFixed(1)} %`} values={v((x: CallStatsSample) => x.lossPct)} floor={5} color="rose-500" />
    <Row label="Round trip" value={() => s().rttMs < 0 ? '--' : s().rttMs < 10 ? `${s().rttMs.toFixed(1)} ms` : `${Math.round(s().rttMs)} ms`} values={v((x: CallStatsSample) => x.rttMs)} floor={100} color="sky-500" />
    <Row label="Out" value={() => `${Math.round(s().sendKbps)} kbit/s`} values={v((x: CallStatsSample) => x.sendKbps)} floor={50} color="emerald-500" />
    <View className="flex-row items-center gap-3">
      <Text className={`w-16 text-xs text-${t.mutedForeground}`}>In</Text>
      <Text className={`w-20 text-sm font-semibold text-${t.foreground}`}>{`${Math.round(s().recvKbps)} kbit/s`}</Text>
      <Text className={`text-xs text-${t.mutedForeground}`}>{`jitter ${s().jitterMs.toFixed(0)} ms`}</Text>
    </View>
    {renderSlot(props.children)}
  </View>;
}
