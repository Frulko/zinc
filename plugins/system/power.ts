// zinc:system/power: battery, idle time, sleep/wake/lock events, the dark/light appearance and a sleep blocker (docs/reports/system-integration.md 4.7).
import { call, on, supports } from 'zinc:system';

export class Battery {
  present: boolean; percent: number; charging: boolean;
  constructor(present: boolean, percent: number, charging: boolean) { this.present = present; this.percent = percent; this.charging = charging; }
}
export class SleepLock {
  token: number;
  released: boolean = false;
  constructor(token: number) { this.token = token; }
  release(): void { if (!this.released) { this.released = true; call('power.release', { token: this.token }); } }
}

export function isSupported(): boolean { return supports('power'); }
/** present false on a machine without a battery. */
export function battery(): Battery { const r = call('power.battery', {}) as { present: boolean; percent: number; charging: boolean }; return new Battery(r.present, r.percent, r.charging); }
/** Seconds since the last keyboard or pointer input. */
export function idleSeconds(): number { const r = call('power.idleSeconds', {}) as { seconds: number }; return r.seconds; }
/** true when the system is in dark mode. */
export function isDark(): boolean { const r = call('power.appearance', {}) as { dark: boolean }; return r.dark; }
/** event: 'suspend' | 'resume' | 'lock' | 'unlock' | 'idle' | 'active' | 'ac' | 'battery'. */
export function onPower(cb: (event: string) => void): void { on('power', (a: string[]) => cb(a[0])); }
/** The appearance changed: 'dark' | 'light'. */
export function onAppearance(cb: (mode: string) => void): void { on('appearance', (a: string[]) => cb(a[0])); }
/** Keeps the machine (or only the display) awake until `release()`. kind: 'display' | 'system'. */
export function preventSleep(kind: string, reason: string): SleepLock {
  const r = call('power.preventSleep', { kind: kind, reason: reason }) as { token: number };
  return new SleepLock(r.token);
}
