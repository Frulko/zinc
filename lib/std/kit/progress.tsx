/** @jsxHelpers ./host */
// zinc:ui/kit — Progress: a thin rounded bar, 0 to 100. `value` is an accessor so the bar follows a signal (Solid)
// or the latest render (React). ProgressRing is the same value as a ring.
//
//   <Progress value={() => download()} />
import { createEffect } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Svg } from 'zinc:svg';
import { theme } from './theme';

export interface ProgressProps {
  value: () => number;   // 0..100
  accent?: boolean;      // accent colour instead of the primary one
  className?: string;
}

/** Width of the indicator as a fraction class of the track ('w-42/100'). */
function widthClass(value: number): string {
  return `w-${Math.round(Math.max(0, Math.min(100, value)))}/100`;
}

export function Progress(props: ProgressProps): i32 {
  const fill = (): string => (props.accent ?? false) ? theme().accent : theme().primary;
  return <View className={`flex-row h-2 w-full rounded-full overflow-hidden bg-${theme().muted} ${props.className ?? ''}`} role="progressbar" aria-valuenow={String(Math.round(props.value()))} aria-valuemin="0" aria-valuemax="100">
    <View className={`rounded-full bg-${fill()} ${widthClass(props.value())}`} />
  </View>;
}

/** A ring that fills clockwise from the top, 0 to 100: a job's progress where a bar has no room (a sidebar row, a table cell). Drawn with
 *  zinc:svg on a lazy canvas, so an idle ring paints nothing; a new value repaints it.
 *
 *    <ProgressRing value={() => job.percent()} size={14} color={() => 0xfa2d48} track={() => 0xececf0} />
 */
export function ProgressRing(props: { value: () => number; size: number; color: () => i32; track: () => i32; strokeWidth?: number }): i32 {
  createEffect(() => { props.value(); ui.repaint(); });
  return <Canvas style={{ width: props.size, height: props.size, lazy: 1 }} role="progressbar" aria-valuenow={String(Math.round(props.value()))}
    onDraw={(x: i32, y: i32, w: i32, h: i32) => {
      const s = ring(props.value(), props.color(), props.track(), props.strokeWidth ?? 2.5);
      if (s !== null) (s as Svg).draw(x, y, w, h, 255);
    }} />;
}

function hex6(c: i32): string { let s = (c & 0xffffff).toString(16); while (s.length < 6) s = '0' + s; return s; }
// ponytail: one parsed ring per whole percent and colours (at most 101 per pair), never freed; a ring of many colours would want an LRU
const rings = new Map<string, Svg>();
function ring(value: number, color: i32, track: i32, stroke: number): Svg | null {
  const pct = Math.round(Math.max(0, Math.min(100, value)));
  const key = `${pct}/${color}/${track}/${stroke}`;
  const hit = rings.get(key);
  if (hit !== undefined) return hit;
  const r = 12 - stroke / 2, a = pct / 100 * 2 * Math.PI;
  const x = 12 + r * Math.sin(a), y = 12 - r * Math.cos(a);
  const arc = pct >= 100 ? `<circle cx="12" cy="12" r="${r}" fill="none" stroke="#${hex6(color)}" stroke-width="${stroke}"/>`
    : pct <= 0 ? '' : `<path d="M12 ${12 - r} A${r} ${r} 0 ${pct > 50 ? 1 : 0} 1 ${x.toFixed(3)} ${y.toFixed(3)}" fill="none" stroke="#${hex6(color)}" stroke-width="${stroke}"/>`;
  const s = new Svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="${r}" fill="none" stroke="#${hex6(track)}" stroke-width="${stroke}"/>${arc}</svg>`);
  if (!s.ok) return null;
  rings.set(key, s);
  return s;
}
