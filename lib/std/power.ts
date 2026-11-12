import { device } from 'zinc:sys';
export interface Temperature { zone: string; type: string; celsius: number | null; }
export interface PowerSnapshot {
  temperatures: Temperature[];
  /** Requested CPU0 frequency, hardware maximum and policy maximum, in MHz. */
  cpuRequestedMHz: number | null;
  cpuMaxMHz: number | null;
  cpuPolicyMaxMHz: number | null;
  throttledFlags: number | null;
  underVoltage: boolean | null;
  frequencyCapped: boolean | null;
  throttled: boolean | null;
  softTemperatureLimit: boolean | null;
  /** Latched firmware flags; another client may clear them. */
  underVoltageOccurred: boolean | null;
  frequencyCappedOccurred: boolean | null;
  throttledOccurred: boolean | null;
  softTemperatureLimitOccurred: boolean | null;
  /** Recent sampled hwmon alarm, independent of the firmware's current flag. */
  underVoltageAlarm: boolean | null;
  fanRPM: number | null;
  /** Commanded duty (0..255), not measured rotation. */
  fanDuty: number | null;
  mailboxStatus: string;
  /** Observed KEY_POWER capability; false does not rule out inaccessible hardware. */
  powerButtonAvailable: boolean;
  /** Read-only sampled key state; null when absent, unsupported or denied. */
  powerButtonPressed: boolean | null;
}
/** Read-only observations; null means unavailable or invalid, never a healthy default. */
export function snapshot(): PowerSnapshot { return JSON.parse(device('power')); }
enum SamplerState { Idle, Running }
let state: SamplerState = SamplerState.Idle;
let timer: number = 0;
let baseline: string = '';
let nextId: number = 1;
let generation: number = 0;
const ids: number[] = [];
const callbacks: ((value: PowerSnapshot) => void)[] = [];
function transition(next: SamplerState): void {
  if (state === next) throw new Error('Invalid power sampler transition');
  if (next === SamplerState.Running) {
    baseline = device('power');
    const epoch = ++generation;
    timer = setInterval(() => {
      if (state !== SamplerState.Running || generation !== epoch) return;
      const raw = device('power');
      if (raw === baseline) return;
      baseline = raw;
      const value: PowerSnapshot = JSON.parse(raw);
      const pending = ids.slice();
      for (const id of pending) {
        if (state !== SamplerState.Running || generation !== epoch) return;
        const i = ids.indexOf(id);
        if (i >= 0) {
          try { callbacks[i](value); }
          catch (error) { console.error(error); }
        }
      }
    }, 1000);
  } else {
    clearInterval(timer);
    generation++;
    baseline = '';
  }
  state = next;
}
/** Sample once a second on the VM thread, only while subscribed. No initial event.
 * Listener errors are logged so other subscribers continue.
 * Short changes between samples may be missed. The returned unsubscribe is idempotent. */
export function onChange(callback: (value: PowerSnapshot) => void): () => void {
  if (state === SamplerState.Idle) transition(SamplerState.Running);
  const id = nextId++;
  ids.push(id); callbacks.push(callback);
  return () => {
    const i = ids.indexOf(id);
    if (i < 0) return;
    ids.splice(i, 1); callbacks.splice(i, 1);
    if (ids.length === 0) transition(SamplerState.Idle);
  };
}
