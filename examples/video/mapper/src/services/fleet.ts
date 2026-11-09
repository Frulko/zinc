// Several mappers as one screen, what each machine has whichever it is: its clock, the part of the canvas it shows, and the commands waiting for
// their moment. fleetMaster.ts leads the others, fleetPlayer.ts follows one (docs/reports/mapper-multi-device.md).
import { FleetClock, joinClock, ownClock, serveClock } from 'zinc:fleet';
import * as mapping from 'zinc:mapping';

interface Due { at: number; run: () => void }

let clock: FleetClock = ownClock();
let viewport: number[] = [0, 0, 1, 1];   // x y w h in the canvas, each from 0 to 1
let joined = '';
let servedPort: i32 = 0;
let masterName = '';
const waiting: Due[] = [];

export function fleetNow(): number { return clock.now(); }
export function fleetViewport(): number[] { return viewport; }
/** The UDP port this machine gives the time on, 0 when none. */
export function clockPort(): i32 { return servedPort; }
export function setMasterName(name: string): void { masterName = name; }

export function setViewport(x: number, y: number, w: number, h: number): boolean {
  if (w <= 0 || h <= 0 || !mapping.command('/output/viewport', [x, y, w, h], [])) return false;
  viewport = [x, y, w, h];
  return true;
}

/** Runs `run` in the first frame at or after the shared time `at`, in the order asked. */
export function runAt(at: number, run: () => void): void { waiting.push({ at, run }); }

/** Each frame, before it draws. */
export function runDue(): void {
  if (waiting.length === 0) return;
  const now = clock.now();
  for (let i: i32 = 0; i < waiting.length;) {
    const due = waiting[i];
    if (due.at > now) {
      i++;
      continue;
    }
    waiting.splice(i, 1);
    due.run();
  }
}

/** What the device says of its place: where its time comes from and how well it knows it. */
export interface FleetState { master: string; masterName: string; offsetMs: number; rttMs: number; synced: boolean; viewport: number[] }

export function fleetState(): FleetState {
  return { master: joined, masterName, offsetMs: clock.offset, rttMs: clock.rtt, synced: clock.synced, viewport };
}

/** Takes the time of the machine at host:port, unless that is already the one. */
export async function followClock(host: string, port: i32, isCurrent: () => boolean): Promise<void> {
  const address = `${host}:${port}`;
  if (joined === address) return;
  try {
    const next = await joinClock(host, port);
    if (!isCurrent()) { next.close(); return; }
    clock.close();
    clock = next;
    joined = address;
  } catch (e) {
    if (isCurrent()) console.error(`mapper: could not follow clock ${address}: ${e}`);
  }
}

/** `place`: 'x,y,w,h', '' for the whole canvas. Every mapper gives the time on `port`, in case it leads others. */
export async function startFleet(port: i32, place: string): Promise<void> {
  if (place !== '') {
    const parts = place.split(',').map((part: string): number => parseFloat(part));
    if (parts.length !== 4 || !setViewport(parts[0], parts[1], parts[2], parts[3])) console.log(`mapper: --viewport wants x,y,w,h, not ${place}`);
  }
  if (port > 0) {
    try {
      await serveClock(port);
      servedPort = port;
    } catch (e) {
      console.log(`mapper: no fleet clock on udp ${port}: ${e}`);
    }
  }
}
