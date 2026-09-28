// Incoming OSC: every message from Chataigne (or from the simulator) goes through route(), which logs it and
// writes the matching signal. Unknown addresses are only logged.
import { createSignal } from 'zinc:ui/solid';
import { now, channels, Channel, toggles, Toggle, setPadX, setPadY, setColor, setCueName, setCueRunning, addChat, addLog, showStreams } from './state';

export const [lastRx, setLastRx] = createSignal<number>(-1);   // now() of the last message, -1: none yet
export const [received, setReceived] = createSignal<i32>(0);

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

/** "0.420 12 \"Sunrise\"": numbers (integers stay integers) then strings, as zinc:osc splits them. */
export function argsText(numbers: number[], strings: string[]): string {
  const parts: string[] = numbers.map((v: number) => Number.isInteger(v) ? `${v}` : v.toFixed(3));
  for (const s of strings) parts.push(`"${s}"`);
  return parts.join(' ');
}

/** Continuous streams (meters, faders, the pad, the module's heartbeat) flood the log: hidden unless asked. */
function isStream(address: string): boolean {
  return address.startsWith('/zinc/meter/') || address.startsWith('/zinc/fader/') || address === '/zinc/xy' || address === '/zinc/ping';
}

/** The number after the last slash: /zinc/fader/3 → 3. */
function indexOf(address: string): i32 {
  return Math.floor(parseInt(address.slice(address.lastIndexOf('/') + 1)));
}
function channelAt(address: string): Channel | undefined {
  const i = indexOf(address);
  return channels.find((c: Channel) => c.index === i);
}
function toggleAt(address: string): Toggle | undefined {
  const i = indexOf(address);
  return toggles.find((t: Toggle) => t.index === i);
}

/** Colour from 3 (or 4, RGBA) components: 0..1 floats, or 0..255 (an OSC 'r' colour arrives as four 0..255 numbers). */
function rgb(n: number[]): u32 {
  const scale = n[0] > 1 || n[1] > 1 || n[2] > 1 ? 1 : 255;
  const c = (v: number): u32 => Math.round(Math.max(0, Math.min(255, v * scale)));
  return (c(n[0]) << 16) | (c(n[1]) << 8) | c(n[2]);
}

export function route(address: string, numbers: number[], strings: string[]): void {
  setLastRx(now());
  setReceived(received() + 1);
  if (showStreams() || !isStream(address)) addLog(address, argsText(numbers, strings));
  const first = numbers.length > 0 ? numbers[0] : 0;
  const channel = channelAt(address), toggle = toggleAt(address);
  if (address.startsWith('/zinc/fader/') && channel !== undefined && numbers.length > 0) channel.setFader(clamp01(first));
  else if (address.startsWith('/zinc/meter/') && channel !== undefined && numbers.length > 0) channel.setMeter(clamp01(first));
  else if (address.startsWith('/zinc/toggle/') && toggle !== undefined) toggle.setOn(numbers.length > 0 ? first !== 0 : strings.length > 0 && strings[0] === 'true');
  else if (address === '/zinc/xy' && numbers.length >= 2) { setPadX(clamp01(numbers[0])); setPadY(clamp01(numbers[1])); }
  else if (address === '/zinc/color' && numbers.length >= 3) setColor(rgb(numbers));
  else if (address === '/zinc/cue/name' && strings.length > 0) setCueName(strings[0]);
  else if (address === '/zinc/cue/running' && numbers.length > 0) setCueRunning(first !== 0);
  else if (address === '/zinc/chat') {
    const text = strings.length > 0 ? strings[0] : argsText(numbers, strings);
    if (text.length > 0) addChat(false, text);   // a mapping can send its empty initial value
  }
}
