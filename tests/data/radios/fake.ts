// Public-loop fixture: no native module, timers, system bus or radio.
let raw = 'off\t\t\t0';
let rows = '';
let tick: () => void = (): void => {};
let nextTimer: i32 = 0;
let currentTimer: i32 = -1;
export function setInterval(cb: () => void, delay: i32): i32 { tick = cb; currentTimer = ++nextTimer; return currentTimer; }
export function clearInterval(id: i32): void { if (id === currentTimer) { tick = (): void => {}; currentTimer = -1; } }
export function step(status: string, result: string): void { raw = status + '\t\t\t0'; rows = result; tick(); }
export default {
  start: (): void => {}, poll: (): void => {}, has: (): boolean => true,
  info: (): string => raw, scan: (): boolean => true,
  // Accepted scans may already be complete when the caller next asks busy().
  busy: (): boolean => false, networks: (): string => rows,
  connect: (ssid: u8[], password: string, accessPoint: boolean): boolean => true,
  disconnect: (): void => {}, stop: (): void => {}, error: (): string => '',
};
