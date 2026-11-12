// Production public module imports only this deterministic backend/timer boundary.
let tick: () => void = (): void => {};
let pending = '', advertisements = '', gattPending = '';
let requestId: i32 = 0;
let cancelled: i32[] = [];
export function gattStep(events: string): void { gattPending = events; tick(); }
export function wasCancelled(id: i32): boolean { return cancelled.includes(id); }
let n: i32 = 0;
let timers: i32 = 0;
let intervals: i32 = 0, cycle: i32 = 0;
export function timerCount(): i32 { return intervals; }
export function adCycle(): i32 { return cycle; }
export function setInterval(cb: () => void, delay: i32): i32 { tick = cb; intervals++; timers++; return timers; }
export function clearInterval(id: i32): void { tick = (): void => {}; intervals--; }
export function setTimeout(cb: () => void, delay: i32): i32 { return ++timers; }
export function clearTimeout(id: i32): void {}
export function step(events: string, rows: string = ''): void { pending = events; advertisements = rows; tick(); }
export default {
  gattOpen: (id: string): i32 => ++n,
  gattTree: (h: i32): string => 's\t1\t0\t0000180f-0000-1000-8000-00805f9b34fb\t\nc\t2\t1\t00002a19-0000-1000-8000-00805f9b34fb\t72656164,7772697465,6e6f74696679,\n',
  gattRequest: (h: i32, c: i32, kind: i32, data: u8[]): i32 => ++requestId,
  gattCancel: (h: i32, id: i32): void => { cancelled.push(id); },
  gattEvents: (): string => { const out = gattPending; gattPending = ''; return out; },
  state: (): string => '', has: (): boolean => true, powered: (on: boolean): boolean => false,
  discover: (uuids: string): boolean => true,
  advertisements: (): string => { const out = advertisements; advertisements = ''; return out; },
  error: (): string => '', scan: (): void => {}, stopScan: (): void => {},
  connect: (id: string): i32 => ++n,
  advertise: (name: string, token: i32): boolean => { cycle = token; return true; },
  maxWrite: (h: i32): i32 => 20, write: (h: i32, b: u8[]): boolean => true,
  read: (h: i32): u8[] => [], close: (h: i32): void => {}, stop: (): void => {},
  events: (): string => { const out = pending; pending = ''; return out; },
};
