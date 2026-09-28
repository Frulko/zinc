// NOTES_DEMO=1: replays a scripted pressure stroke (a spiral, then two waves) through the live ink path, a few
// samples per frame like a real pen, so the rendering and the refresh logic can be watched without a tablet.
import * as sys from 'zinc:sys';
import { ink } from './notebook';

const SAMPLES_PER_PART: i32 = 300;
const PARTS: i32 = 3;
const SAMPLES_PER_FRAME: i32 = 6;

let sample: i32 = sys.env('NOTES_DEMO') === '1' ? 0 : -1;

/** One pen sample of the spiral (part 0) or of a wave (parts 1 and 2). */
function feedSample(n: i32): void {
  const i = n % SAMPLES_PER_PART, part = Math.floor(n / SAMPLES_PER_PART);
  const lift = i === SAMPLES_PER_PART - 1 ? 0 : 1;   // the last sample of a part lifts the pen
  if (part === 0) {
    const angle = i / SAMPLES_PER_PART * Math.PI * 8, radius = 20 + i * 1.3;
    ink.color = 0x000000; ink.width = 14;
    ink.feed(800 + Math.cos(angle) * radius, 700 + Math.sin(angle) * radius, 0.5 + 0.5 * Math.sin(i / 20), lift);
  } else {
    ink.color = part === 1 ? 0x1d4ed8 : 0xdc2626; ink.width = 10;
    ink.feed(150 + i * 4.4, 1300 + part * 180 + Math.sin(i / 18) * 60, i / SAMPLES_PER_PART, lift);
  }
}

/** Called every frame; does nothing unless NOTES_DEMO=1. */
export function stepDemo(dt: number): void {
  if (sample < 0) return;
  for (let k = 0; k < SAMPLES_PER_FRAME && sample < SAMPLES_PER_PART * PARTS; k++, sample++) feedSample(sample);
}
