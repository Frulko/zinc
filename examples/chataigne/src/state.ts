// Show state: every value the panels show, as signals. Nothing here touches the network; link.ts sends, incoming.ts
// and the simulator write back. Values on the wire are normalised (0..1), the UI shows percentages.
import { createSignal } from 'zinc:ui/solid';

/** Seconds since launch, advanced by the frame callback (a virtual clock on the sim target). */
export const [now, setNow] = createSignal<number>(0);

/** "01:23.4" for a time in seconds since launch. */
export function stamp(t: number): string {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${`${m}`.padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

/** One strip of the console: a fader we send and a level meter Chataigne sends back. */
export class Channel {
  index: i32;
  fader: () => number; setFader: (v: number) => void;
  meter: () => number; setMeter: (v: number) => void;
  constructor(index: i32, fader: number) {
    this.index = index;
    const [f, sf] = createSignal<number>(fader); this.fader = f; this.setFader = sf;
    const [m, sm] = createSignal<number>(0); this.meter = m; this.setMeter = sm;
  }
}
export const channels: Channel[] = [new Channel(1, 0.8), new Channel(2, 0.55), new Channel(3, 0.3), new Channel(4, 0.65)];

/** An on/off switch, e.g. /zinc/toggle/1. */
export class Toggle {
  index: i32; name: string;
  on: () => boolean; setOn: (v: boolean) => void;
  constructor(index: i32, name: string) {
    this.index = index; this.name = name;
    const [o, so] = createSignal<boolean>(false); this.on = o; this.setOn = so;
  }
}
export const toggles: Toggle[] = [new Toggle(1, 'House lights'), new Toggle(2, 'Haze'), new Toggle(3, 'Strobe')];

export const [padX, setPadX] = createSignal<number>(0.5);   // XY pad, 0..1 left to right
export const [padY, setPadY] = createSignal<number>(0.5);   // 0..1 bottom to top
export const [color, setColor] = createSignal<u32>(0x6366f1);
export const [cueName, setCueName] = createSignal<string>('Waiting for Chataigne');
export const [cueRunning, setCueRunning] = createSignal<boolean>(false);

/** A chat bubble: `mine` for what we typed, otherwise it came from Chataigne. */
export class ChatLine {
  constructor(public mine: boolean, public text: string, public time: number) {}
}
export const [chat, setChat] = createSignal<ChatLine[]>([]);
export function addChat(mine: boolean, text: string): void {
  const list = chat().slice();
  list.push(new ChatLine(mine, text, now()));
  if (list.length > 50) list.shift();
  setChat(list);
}

/** One received message, pre-formatted for the monospace log. */
export class LogLine {
  constructor(public id: i32, public time: number, public address: string, public args: string) {}
}
const LOG_SIZE: i32 = 60;
let logId: i32 = 0;
export const [log, setLog] = createSignal<LogLine[]>([]);
export const [showStreams, setShowStreams] = createSignal<boolean>(false);   // log meter / fader streams too
export function addLog(address: string, args: string): void {
  const list = log().slice();
  list.unshift(new LogLine(logId++, now(), address, args));   // newest first
  if (list.length > LOG_SIZE) list.pop();
  setLog(list);
}

const HEX = '0123456789abcdef';
/** "#6366f1" for 0x6366f1. */
export function hex(c: u32): string {
  let s = '#';
  for (let shift = 20; shift >= 0; shift -= 4) s += HEX.at((c >> shift) & 15);
  return s;
}
