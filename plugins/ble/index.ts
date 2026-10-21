// zinc:ble — Bluetooth Low Energy text links between Zinc programs over the Nordic UART Service (docs/plugins/ble.md): a Mac scans and
// connects (central), an ESP32 advertises (peripheral), and both send UTF-8 messages. The ESP32 engine implements this same module, so the
// API is callbacks only (it has no promises). The native side (native/ble.spec.ts) never waits; this file looks at it every few
// milliseconds while a scan, an advertisement or a link is going on, frames the messages and calls the handlers.
// Framing, the same on both sides: a message is UTF-8 text without '\n'; it is sent followed by '\n', in chunks of the link's largest write,
// and the receiver keeps the bytes until '\n'. So a text that holds '\n' arrives as several messages.
import { utf8Encode, utf8Decode } from 'zinc:sys';
import S from './native/ble.spec';

/** The Nordic UART Service. RX 6e400002-b5a3-f393-e0a9-e50e24dcca9e is written by the central, TX 6e400003-... is notified by the peripheral. */
export const UART_SERVICE: string = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';

const RS = '\u001e', FS = '\u001f';
/** How often the native side is read while something is going on: a BLE connection event comes every 15 to 30 ms. */
const POLL_MS = 10;
/** A message longer than this (bytes) is given in pieces: a peer that never sends '\n' must not fill the memory. */
const MAX_MESSAGE = 65536;
/** A nameless device is reported once seen this many times in a scan: its name may come in a scan response a moment later. */
const NAMELESS_SIGHTINGS = 3;

export class Device {
  /** What connect() takes: on macOS the system's id for the device (a UUID, not its Bluetooth address, which macOS never shows). */
  id: string;
  /** The name it advertises ('' when it gives none). */
  name: string;
  /** Signal strength in dBm (-30 is next to it, -90 is far); 127 when not measured. */
  rssi: i32;
  constructor(id: string, name: string, rssi: i32) { this.id = id; this.name = name; this.rssi = rssi; }
}

type OpenCb = (l: Link) => void;
type MessageCb = (l: Link, text: string) => void;
type CloseCb = (l: Link) => void;

export class Link {
  /** The peer's id (a Device id for a link made by connect()). */
  id: string;
  /** The peer's name. */
  name: string;
  /** The native handle (internal). */
  handle: i32;
  private live: boolean = false;
  private ended: boolean = false;
  private partial: u8[] = [];
  private onOpen: OpenCb;
  private onMessage: MessageCb;
  private onClose: CloseCb;
  constructor(handle: i32, id: string, name: string, onOpen: OpenCb, onMessage: MessageCb, onClose: CloseCb) {
    this.handle = handle; this.id = id; this.name = name;
    this.onOpen = onOpen; this.onMessage = onMessage; this.onClose = onClose;
  }
  /** Sends one message (see the framing above). Throws when the link is not open, or when 1 MiB already waits to go out. */
  send(text: string): void {
    if (!this.live) throw new Error(`ble: ${this.label()}: the link is not open`);
    const bytes = utf8Encode(text + '\n');
    const n = S.maxWrite(this.handle);
    for (let i = 0; i < bytes.length; i += n)
      if (!S.write(this.handle, bytes.slice(i, i + n))) throw new Error(`ble: ${this.label()}: the link takes no more now (it closed, or 1 MiB waits to go out)`);
  }
  /** Ends the link; onClose runs at once. */
  close(): void {
    if (this.ended) return;
    S.close(this.handle);
    this.finish();
  }

  /** Internal: the UART characteristics are ready; the native side's id and name fill what the scan did not give. */
  opened(id: string, name: string): void {
    if (this.ended) return;
    if (this.id === '') this.id = id;
    if (this.name === '') this.name = name;
    this.live = true;
    this.onOpen(this);
  }
  /** Internal: the bytes received since the last look, cut into messages. */
  drain(): void {
    if (this.ended) return;
    for (const b of S.read(this.handle)) {
      if (b !== 10) { this.partial.push(b); if (this.partial.length < MAX_MESSAGE) continue; }
      const text = utf8Decode(this.partial);
      this.partial = [];
      this.onMessage(this, text);
      if (this.ended) return;   // the handler closed it
    }
  }
  /** Internal: the link is over (closed here, by the peer, or never opened); onClose runs once. */
  finish(): void {
    if (this.ended) return;
    this.ended = true; this.live = false;
    const i = links.indexOf(this);
    if (i >= 0) links.splice(i, 1);
    idle();
    this.onClose(this);
  }
  private label(): string { return this.name !== '' ? this.name : this.id; }
}

let links: Link[] = [];          // connecting and open
let timer: i32 = -1;
let scanning = false;
let scanTimer: i32 = -1;
let onFound: (d: Device) => void = (d: Device): void => {};
let found: Device[] = [];        // reported in this scan
let nameless: string[] = [];     // one id per sighting without a name
let advertising = false;
let advOpen: OpenCb = (l: Link): void => {};
let advMessage: MessageCb = (l: Link, text: string): void => {};
let advClose: CloseCb = (l: Link): void => {};

function wake(): void { if (timer < 0) timer = setInterval(() => poll(), POLL_MS); }
/** Nothing going on: the timer stops, so a program with nothing else to do ends. */
function idle(): void {
  if (scanning || advertising || links.length > 0 || timer < 0) return;
  clearInterval(timer);
  timer = -1;
}
function linkOf(h: i32): Link | null {
  for (const l of links) if (l.handle === h) return l;
  return null;
}
function sighted(id: string, name: string, rssi: i32): void {
  if (!scanning || found.find((d: Device) => d.id === id) !== undefined) return;
  if (name === '') {
    nameless.push(id);
    if (nameless.filter((n: string) => n === id).length < NAMELESS_SIGHTINGS) return;
  }
  const d = new Device(id, name, rssi);
  found.push(d);
  onFound(d);
}
function poll(): void {
  for (const r of S.events().split(RS)) {
    if (r === '') continue;
    const f = r.split(FS);
    const h = parseInt(f[1]);
    if (f[0] === 'device') sighted(f[2], f[3], parseInt(f[4]));
    else if (f[0] === 'open') {
      const l = linkOf(h);
      if (l !== null) l.opened(f[2], f[3]);
      else if (advertising) {   // a central connected to our advertisement
        const n = new Link(h, f[2], f[3], advOpen, advMessage, advClose);
        links.push(n);
        n.opened('', '');
      }
    } else if (f[0] === 'close') {
      const l = linkOf(h);
      if (l !== null) { l.drain(); l.finish(); }
    }
  }
  for (const l of links.slice()) l.drain();
}

function why(s: string): string {
  if (s === 'off') return 'Bluetooth is off: turn it on (Control Center, or System Settings > Bluetooth)';
  if (s === 'unauthorized') return 'this program may not use Bluetooth: allow it in System Settings > Privacy & Security > Bluetooth; under zinc run the ' +
    'terminal app is the one that asks and is allowed (iTerm2 and Ghostty can ask, Terminal.app cannot: ZINC_BLE_ASK=1 tries anyway; docs/plugins/ble.md)';
  if (s === 'unsupported') return 'this machine or target has no Bluetooth Low Energy (on the Mac, without the radio: ZINC_NATIVE=sim)';
  return `Bluetooth is ${s}`;
}
/** Throws the reason when Bluetooth cannot be used now; 'resetting' passes (the native side waits for the radio). */
function usable(what: string): void {
  const s = S.state();
  if (s !== '' && s !== 'resetting') throw new Error(`ble: ${what}: ${why(s)}`);
}

/** '' when Bluetooth can be used, else why: 'off', 'unauthorized', 'unsupported', 'resetting'. */
export function state(): string { return S.state(); }

/** Central: the devices advertising the UART service, each reported once per scan; seconds 0 = until stopScan(). Throws when Bluetooth
 *  cannot be used (the message says what to do). A new scan replaces the one going on. */
export function scan(onDevice: (d: Device) => void, seconds: i32): void {
  usable('scan');
  if (scanTimer >= 0) { clearTimeout(scanTimer); scanTimer = -1; }
  onFound = onDevice; found = []; nameless = [];
  scanning = true;
  S.scan();
  if (seconds > 0) scanTimer = setTimeout(() => stopScan(), seconds * 1000);
  wake();
}
export function stopScan(): void {
  if (scanTimer >= 0) { clearTimeout(scanTimer); scanTimer = -1; }
  if (!scanning) return;
  scanning = false;
  S.stopScan();
  idle();
}

/** Central: connect to a scanned device; onOpen when the UART characteristics are ready, onMessage per received message, onClose once
 *  (also when the connection fails or times out, without onOpen). */
export function connect(id: string, onOpen: (l: Link) => void, onMessage: (l: Link, text: string) => void, onClose: (l: Link) => void): void {
  usable('connect');
  const d = found.find((x: Device) => x.id === id);
  links.push(new Link(S.connect(id), id, d === undefined ? '' : d.name, onOpen, onMessage, onClose));
  wake();
}

/** Peripheral (the ESP32): advertise `name` with the UART service; each central that connects is a Link. On macOS it throws: the Mac is
 *  the central (scan and connect). */
export function advertise(name: string, onOpen: (l: Link) => void, onMessage: (l: Link, text: string) => void, onClose: (l: Link) => void): void {
  usable('advertise');
  if (!S.advertise(name)) throw new Error('ble: advertise: not on this target (here the program is the central: scan() and connect())');
  advOpen = onOpen; advMessage = onMessage; advClose = onClose;
  advertising = true;
  wake();
}

/** Ends scanning, advertising and every link (their onClose run). */
export function stop(): void {
  S.stop();
  if (scanTimer >= 0) { clearTimeout(scanTimer); scanTimer = -1; }
  scanning = false; advertising = false;
  for (const l of links.slice()) l.finish();
  idle();
}
