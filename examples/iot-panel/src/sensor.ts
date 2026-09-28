// A simulated temperature sensor: two sine waves around 21 °C, sampled every frame, with a rolling history
// for the chart. The reading is also exposed to zinc:telemetry.
import { createSignal } from 'zinc:ui/solid';
import * as telemetry from 'zinc:telemetry';

export const HISTORY_LENGTH: i32 = 120;   // samples kept for the chart (2 s at 60 FPS)
export const MIN_C: number = 15, MAX_C: number = 30;   // chart range

export const [temperature, setTemperature] = createSignal<number>(21);
export const history: number[] = [];
let elapsed = 0;

telemetry.expose('temperature', () => temperature());

/** Advances the simulation by dt seconds and records one sample. */
export function sample(dt: number): void {
  elapsed += dt;
  const value = 21 + Math.sin(elapsed * 1.3) * 3 + Math.sin(elapsed * 5.1) * 0.6;
  history.push(value);
  if (history.length > HISTORY_LENGTH) history.shift();
  setTemperature(value);   // last: whatever it re-runs sees the new history
}

/** Lowest and highest value in the history, as "19.2 – 23.8 °C". */
export function range(): string {
  temperature();   // the history is a plain array: reading the signal makes a caller re-run on each sample
  if (history.length === 0) return '';
  let low = history[0], high = history[0];
  for (const v of history) { low = Math.min(low, v); high = Math.max(high, v); }
  return `${low.toFixed(1)} – ${high.toFixed(1)} °C over 2 s`;
}
