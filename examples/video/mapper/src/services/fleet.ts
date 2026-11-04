// Several mappers as one screen: this one's clock and the part of the canvas it shows. Step one of docs/reports/mapper-multi-device.md: the clock and the
// viewport; nothing is replicated yet.
import { FleetClock, joinClock, ownClock, serveClock } from 'zinc:fleet';
import * as mapping from 'zinc:mapping';

let clock: FleetClock = ownClock();
let viewport: number[] = [0, 0, 1, 1];   // x y w h in the canvas, each from 0 to 1
let joined = '';

export function fleetNow(): number { return clock.now(); }
export function fleetViewport(): number[] { return viewport; }

export function setViewport(x: number, y: number, w: number, h: number): boolean {
  if (w <= 0 || h <= 0 || !mapping.command('/output/viewport', [x, y, w, h], [])) return false;
  viewport = [x, y, w, h];
  return true;
}

/** What the device says of its place: where its time comes from and how well it knows it. */
export interface FleetState { master: string; offsetMs: number; rttMs: number; synced: boolean; viewport: number[] }

export function fleetState(): FleetState {
  return { master: joined, offsetMs: clock.offset, rttMs: clock.rtt, synced: clock.synced, viewport };
}

/** `join`: 'host:port' of the mapper that gives the time, '' when this one does. `place`: 'x,y,w,h', '' for the whole canvas. */
export async function startFleet(join: string, port: i32, place: string): Promise<void> {
  if (place !== '') {
    const parts = place.split(',').map((part: string): number => parseFloat(part));
    if (parts.length !== 4 || !setViewport(parts[0], parts[1], parts[2], parts[3])) console.log(`mapper: --viewport wants x,y,w,h, not ${place}`);
  }
  if (join === '') {
    if (port > 0) {
      try { await serveClock(port); } catch (e) { console.log(`mapper: no fleet clock on udp ${port}: ${e}`); }
    }
    return;
  }
  const colon = join.lastIndexOf(':');
  const host = colon >= 0 ? join.slice(0, colon) : join;
  joined = join;
  clock = await joinClock(host, colon >= 0 ? parseInt(join.slice(colon + 1)) : port);
}
