// Production public module imports only this deterministic backend/timer boundary.
let tick: () => void = (): void => {};
let pending = '', advertisements = '';
let n: i32 = 0;
let timers: i32 = 0;
export function setInterval(cb: () => void, delay: i32): i32 { tick = cb; timers++; return timers; }
export function clearInterval(id: i32): void { tick = (): void => {}; }
export function setTimeout(cb: () => void, delay: i32): i32 { return ++timers; }
export function clearTimeout(id: i32): void {}
export function step(events: string, rows: string = ''): void { pending = events; advertisements = rows; tick(); }
export default {
  state: (): string => '', has: (): boolean => true, powered: (on: boolean): boolean => false,
  discover: (uuids: string): boolean => true,
  advertisements: (): string => { const out = advertisements; advertisements = ''; return out; },
  error: (): string => '', scan: (): void => {}, stopScan: (): void => {},
  connect: (id: string): i32 => ++n,
  advertise: (name: string): boolean => true,
  maxWrite: (h: i32): i32 => 20, write: (h: i32, b: u8[]): boolean => true,
  read: (h: i32): u8[] => [], close: (h: i32): void => {}, stop: (): void => {},
  events: (): string => { const out = pending; pending = ''; return out; },
};
