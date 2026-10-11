// zinc:midi — MIDI in and out: keyboards, pad and fader controllers, synthesizers, and the music software of the same machine through virtual
// ports (docs/plugins/midi.md). The native side (native/midi.spec.ts, RtMidi) queues what arrives; this file reads the open inputs every
// 2 ms and calls the handlers. Channels are 1 to 16, as on the instruments; notes and values 0 to 127.
import S from './native/midi.spec';

// ponytail: a timer, so a note waits up to 2 ms for its handler; wake the loop from RtMidi's callback if that ever shows in a performance
const POLL_MS = 2;
const WATCH_MS = 500;   // how often the lists of ports are compared for watchPorts

const lines = (s: string): string[] => s.split('\n').filter((n: string) => n !== '');
/** The MIDI sources present now (keyboards, controllers, the virtual outputs of other programs): what openInput takes. */
export function inputs(): string[] { return lines(S.ports(true)); }
/** The MIDI destinations present now (synthesizers, the virtual inputs of other programs): what openOutput takes. */
export function outputs(): string[] { return lines(S.ports(false)); }

const data = (v: i32): u8 => v < 0 ? 0 : v > 127 ? 127 : v;
const status = (kind: i32, channel: i32): u8 => kind | ((channel < 1 ? 1 : channel > 16 ? 16 : channel) - 1);

export class MidiInput {
  name: string;
  private handle: i32;
  private open_: boolean = true;
  private messageCbs: ((bytes: u8[]) => void)[] = [];
  private noteCbs: ((note: i32, velocity: i32, channel: i32) => void)[] = [];
  private controlCbs: ((controller: i32, value: i32, channel: i32) => void)[] = [];
  private clockCbs: (() => void)[] = [];
  constructor(name: string, handle: i32) { this.name = name; this.handle = handle; }
  get isOpen(): boolean { return this.open_; }
  /** Every message, whole: [0x90, 60, 100] is a note on. */
  onMessage(cb: (bytes: u8[]) => void): MidiInput { this.messageCbs.push(cb); return this; }
  /** A key pressed (velocity 1 to 127) or released (velocity 0, whichever way the instrument says it). */
  onNote(cb: (note: i32, velocity: i32, channel: i32) => void): MidiInput { this.noteCbs.push(cb); return this; }
  /** A knob, a fader, a pedal: controller 0 to 127, value 0 to 127. */
  onControl(cb: (controller: i32, value: i32, channel: i32) => void): MidiInput { this.controlCbs.push(cb); return this; }
  /** A tick of the MIDI clock: 24 for each quarter note of the sender's tempo. */
  onClock(cb: () => void): MidiInput { this.clockCbs.push(cb); return this; }
  close(): void {
    if (!this.open_) return;
    this.open_ = false;
    S.close(this.handle);
    const i = open_inputs.indexOf(this);
    if (i >= 0) open_inputs.splice(i, 1);
    retime();
    this.messageCbs = []; this.noteCbs = []; this.controlCbs = []; this.clockCbs = [];
  }
  /** Delivers what arrived; called by the plugin's timer. */
  poll(): void {
    while (this.open_) {
      const m = S.read(this.handle);
      if (m.length === 0) return;
      for (const cb of this.messageCbs) cb(m);
      const kind = m[0] & 0xf0, channel = (m[0] & 0x0f) + 1;
      if (m[0] === 0xf8) { for (const cb of this.clockCbs) cb(); }
      else if (kind === 0x90 && m.length >= 3) { for (const cb of this.noteCbs) cb(m[1], m[2], channel); }
      else if (kind === 0x80 && m.length >= 3) { for (const cb of this.noteCbs) cb(m[1], 0, channel); }
      else if (kind === 0xb0 && m.length >= 3) { for (const cb of this.controlCbs) cb(m[1], m[2], channel); }
    }
  }
}

export class MidiOutput {
  name: string;
  private handle: i32;
  private open_: boolean = true;
  constructor(name: string, handle: i32) { this.name = name; this.handle = handle; }
  get isOpen(): boolean { return this.open_; }
  /** One whole message, any kind (program change [0xC0, 5], pitch bend, system exclusive from 0xF0 to 0xF7). False when it could not be sent. */
  send(bytes: u8[]): boolean { return this.open_ && S.send(this.handle, bytes); }
  noteOn(note: i32, velocity: i32 = 100, channel: i32 = 1): boolean { return this.send([status(0x90, channel), data(note), data(velocity)]); }
  noteOff(note: i32, channel: i32 = 1): boolean { return this.send([status(0x80, channel), data(note), 0]); }
  control(controller: i32, value: i32, channel: i32 = 1): boolean { return this.send([status(0xb0, channel), data(controller), data(value)]); }
  /** One tick of the MIDI clock; send 24 for each quarter note. start() and stop() are the transport messages that go with it. */
  clock(): boolean { return this.send([0xf8]); }
  start(): boolean { return this.send([0xfa]); }
  stop(): boolean { return this.send([0xfc]); }
  /** Releases every note of every channel (controller 123): for the end of a program, or a stuck note. */
  allNotesOff(): void { for (let c = 1; c <= 16; c++) this.control(123, 0, c); }
  close(): void {
    if (!this.open_) return;
    this.open_ = false;
    S.close(this.handle);
  }
}

const open_inputs: MidiInput[] = [];
let timer: i32 = -1, watcher: i32 = -1;
let watchCb: ((inputs: string[], outputs: string[]) => void) | null = null;
let seen = '';
function retime(): void {
  if (open_inputs.length > 0 && timer < 0) timer = setInterval(() => { for (const p of open_inputs.slice()) p.poll(); }, POLL_MS);
  if (open_inputs.length === 0 && timer >= 0) { clearInterval(timer); timer = -1; }
}
function input(name: string, virtualPort: boolean): MidiInput {
  const h = S.open(true, name, virtualPort);
  if (h < 0) throw new Error('midi: ' + S.error());
  const p = new MidiInput(name, h);
  open_inputs.push(p);
  retime();
  return p;
}
function output(name: string, virtualPort: boolean): MidiOutput {
  const h = S.open(false, name, virtualPort);
  if (h < 0) throw new Error('midi: ' + S.error());
  return new MidiOutput(name, h);
}

/** Listens to the source of that name (one of inputs(); '' = the first one). Throws an Error when there is none. */
export function openInput(name: string = ''): MidiInput { return input(name, false); }
/** Sends to the destination of that name (one of outputs(); '' = the first one). Throws an Error when there is none. */
export function openOutput(name: string = ''): MidiOutput { return output(name, false); }
/** Creates a port other programs can send to: it appears in their list of outputs under `name`. Not on Windows. */
export function createInput(name: string): MidiInput { return input(name, true); }
/** Creates a port other programs can listen to: it appears in their list of inputs under `name`. Not on Windows. */
export function createOutput(name: string): MidiOutput { return output(name, true); }

/** Calls `cb` with the new lists each time a port appears or goes (an instrument plugged in or out, a program that opens a virtual port),
 *  within half a second. One watcher at a time; unwatchPorts() ends it (a program that watches does not end by itself). */
export function watchPorts(cb: (inputs: string[], outputs: string[]) => void): void {
  watchCb = cb;
  seen = S.ports(true) + '\n' + S.ports(false);
  if (watcher < 0) watcher = setInterval(() => {
    const now = S.ports(true) + '\n' + S.ports(false), f = watchCb;
    if (now === seen || f === null) return;
    seen = now;
    f(inputs(), outputs());
  }, WATCH_MS);
}
export function unwatchPorts(): void {
  watchCb = null;
  if (watcher >= 0) { clearInterval(watcher); watcher = -1; }
}
