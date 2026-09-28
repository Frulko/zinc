// Weather station report: statistics of one day of readings, printed with ANSI colours.
//   zinc run examples/zed-editor/sample --target sim
import { mean, minMax, movingAverage } from './lib/stats';
import { celsius, colorFor, bold, dim, RESET } from './lib/format';

class Reading {
  hour: i32;
  temp: number;
  humidity: number;
  constructor(hour: i32, temp: number, humidity: number) {
    this.hour = hour; this.temp = temp; this.humidity = humidity;
  }
}

/* A day of readings, one per hour (the same as data/readings.json). */
const TEMPS: number[] = [11.2, 10.8, 10.1, 9.7, 9.5, 9.9, 11.4, 13.6, 15.9, 18.2, 20.1, 21.7,
  22.9, 23.4, 23.1, 22.2, 20.8, 18.9, 17.0, 15.6, 14.3, 13.4, 12.6, 11.9];

function readings(): Reading[] {
  const out: Reading[] = [];
  for (let h = 0; h < TEMPS.length; h++) out.push(new Reading(h, TEMPS[h], 88 - TEMPS[h] * 1.6));
  return out;
}

function report(day: Reading[]): void {
  const temps = day.map((r: Reading) => r.temp);
  const range = minMax(temps);
  console.log(bold('Weather station') + dim('  24 readings'));
  console.log(`  mean     ${colorFor(mean(temps))}${celsius(mean(temps))}${RESET}`);
  console.log(`  coldest  ${colorFor(range[0])}${celsius(range[0])}${RESET}`);
  console.log(`  warmest  ${colorFor(range[1])}${celsius(range[1])}${RESET}`);
  const smooth = movingAverage(temps, 3);
  let line = '  trend    ';
  for (const t of smooth) line += colorFor(t) + (t > 18 ? '▆' : t > 12 ? '▄' : '▂') + RESET;
  console.log(line);
}

report(readings());
