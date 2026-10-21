// What the app shows and the actions its page calls. No drawing; nothing runs at import.
import { createSignal } from 'zinc:ui/solid';
import { Device } from 'zinc:ble';
import { MAX_LINES, FROM_APP } from './constants';

export class Line {
  from: string; text: string;
  constructor(from: string, text: string) { this.from = from; this.text = text; }
}

/** 'idle', 'scanning', 'connecting', 'connected', or 'error' (the reason is in `problem`). */
export const [phase, setPhase] = createSignal<string>('idle');
export const [problem, setProblem] = createSignal<string>('');
export const [devices, setDevices] = createSignal<Device[]>([]);
export const [peer, setPeer] = createSignal<string>('');
export const [lines, setLines] = createSignal<Line[]>([]);
export const [draft, setDraft] = createSignal<string>('');

export function addLine(from: string, text: string): void {
  const all = lines().concat([new Line(from, text)]);
  setLines(all.length > MAX_LINES ? all.slice(all.length - MAX_LINES) : all);
}
export function note(text: string): void { addLine(FROM_APP, text); }
export function addDevice(d: Device): void { setDevices(devices().concat([d])); }
