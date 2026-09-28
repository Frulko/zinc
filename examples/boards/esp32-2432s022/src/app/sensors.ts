// Simulated readings for the dashboard: a load that wanders, a slow temperature, humidity, and a throughput series
// sampled 6 times a second. A small deterministic PRNG keeps screenshots reproducible.
import { createSignal } from 'zinc:ui/solid';
import { Tween, easeInOut } from './motion';

let seed: i32 = 12345;
/** 0..1, xorshift32 (integer math: exact with the esp32 profile's f32 numbers too). */
export function rand(): number { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed & 65535) / 65536; }

export const SAMPLES: i32 = 48;
/** Throughput history, oldest first, 0..100. */
export const series: number[] = [];
let v: number = 55;
function nextSample(): number { v = Math.max(8, Math.min(96, v + (rand() - 0.5) * 22 + (55 - v) * 0.08)); return v; }
for (let i = 0; i < SAMPLES; i++) series.push(nextSample());
let phase: number = 0;
/** 0..1 between two samples: the chart scrolls smoothly instead of jumping. */
export function chartPhase(): number { return phase; }

/** Gauge value 0..1, eased toward a new target every 1.5 s. */
export const load = new Tween(0.42);
export const [temperature, setTemperature] = createSignal<number>(36.4);
export const [humidity, setHumidity] = createSignal<i32>(48);
export const [throughput, setThroughput] = createSignal<i32>(412);

let slow: number = 0;
export function stepSensors(dt: number): void {
  phase += dt * 6;
  while (phase >= 1) { phase -= 1; series.shift(); series.push(nextSample()); }
  slow += dt;
  if (slow >= 1.5) {
    slow = 0;
    load.to(Math.max(0.08, Math.min(0.96, load.get() + (rand() - 0.5) * 0.5)), 1.2, easeInOut);
    setTemperature(Math.round((temperature() + (rand() - 0.5) * 0.6) * 10) / 10);
    setHumidity(Math.max(30, Math.min(70, humidity() + Math.round((rand() - 0.5) * 4))));
    setThroughput(Math.round(series[SAMPLES - 1] * 7.3));
  }
}
