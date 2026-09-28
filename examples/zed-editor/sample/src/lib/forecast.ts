// Work in progress: a naive forecast from the last readings.
// It does not type-check yet (the editor shows the diagnostics when the file opens and after ⌘S).
import { mean } from './stats';

export interface Forecast {
  hour: i32;
  temp: number;
  confidence: number;
}

export function forecast(temps: number[], hours: i32): Forecast[] {
  const out: Forecast[] = [];
  const base = mean(temps.slice(temps.length - 6));
  const slope = (temps[temps.length - 1] - temps[temps.length - 6]) / 5;
  for (let h = 1; h <= hours; h++) {
    const temp = base + slope * h;
    out.push({ hour: h, temp: temp, confidence: 1 / (1 + h * 0.2) });
  }
  return out;
}

export function describe(f: Forecast): string {
  return `+${f.hour}h: ${celcius(f.temp)} (${Math.round(f.confidence * 100)}%)`;
}
