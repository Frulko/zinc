// What the screen shows: the sketch's values, read once a second.
import { boots, chip, freeHeap, loops, millis } from 'zinc:sketch';

export class State {
  boots: i32 = boots();
  chip: string = chip();
  millis: i32 = 0;
  loopsPerSecond: i32 = 0;
  freeHeap: i32 = 0;
  lastLoops: i32 = 0;
  lastRead: number = 0;
  dirty: boolean = true;
}
export const state = new State();

/** Reads the sketch again; `now` is performance.now(). */
export function refresh(now: number): void {
  const count = loops();
  const seconds = state.lastRead > 0 ? (now - state.lastRead) / 1000 : 0;
  state.loopsPerSecond = seconds > 0 ? Math.round((count - state.lastLoops) / seconds) : 0;
  state.lastLoops = count;
  state.lastRead = now;
  state.millis = millis();
  state.freeHeap = freeHeap();
  state.dirty = true;
}
