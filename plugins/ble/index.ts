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

enum LinkState { connecting, open, closed }
enum ScanMode { idle, uart, raw }

export class ManufacturerData {
  company: u16; data: u8[];
  constructor(company: u16, data: u8[]) { this.company = company; this.data = data; }
}
export class ServiceData {
  uuid: string; data: u8[];
  constructor(uuid: string, data: u8[]) { this.uuid = uuid; this.data = data; }
}
export class AdvertisingData {
  type: u8; data: u8[];
  constructor(type: u8, data: u8[]) { this.type = type; this.data = data; }
}
export class Advertisement extends Device {
  uuids: string[] = [];
  manufacturerData: ManufacturerData[] = [];
  serviceData: ServiceData[] = [];
  advertisingData: AdvertisingData[] = [];
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
  private phase: LinkState = LinkState.connecting;
  private transition(next: LinkState): boolean {
    if (this.phase === LinkState.closed || (next === LinkState.open && this.phase !== LinkState.connecting)) return false;
    this.phase = next; return true;
  }
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
    if (this.phase !== LinkState.open) throw new Error(`ble: ${this.label()}: the link is not open`);
    const bytes = utf8Encode(text + '\n');
    const n = S.maxWrite(this.handle);
    if (n < 1 || n > 512) throw new Error('ble: invalid maximum write length');
    for (let i = 0; i < bytes.length; i += n)
      if (!S.write(this.handle, bytes.slice(i, i + n))) throw new Error(`ble: ${this.label()}: the link takes no more now (it closed, or 1 MiB waits to go out)`);
  }
  /** Ends the link; onClose runs at once. */
  close(): void {
    if (this.phase === LinkState.closed) return;
    S.close(this.handle);
    this.finish();
  }

  /** Internal: the UART characteristics are ready; the native side's id and name fill what the scan did not give. */
  opened(id: string, name: string): void {
    if (this.phase === LinkState.closed) return;
    if (this.id === '') this.id = id;
    if (this.name === '') this.name = name;
    if (!this.transition(LinkState.open)) return;
    this.onOpen(this);
  }
  /** Internal: the bytes received since the last look, cut into messages. */
  drain(): void {
    if (this.phase === LinkState.closed) return;
    for (const b of S.read(this.handle)) {
      if (b !== 10) { this.partial.push(b); if (this.partial.length < MAX_MESSAGE) continue; }
      const text = utf8Decode(this.partial);
      this.partial = [];
      this.onMessage(this, text);
      if (this.phase === LinkState.closed) return;   // the handler closed it
    }
  }
  /** Internal: the link is over (closed here, by the peer, or never opened); onClose runs once. */
  finish(): void {
    if (this.phase === LinkState.closed) return;
    if (!this.transition(LinkState.closed)) return;
    this.partial = [];
    const i = links.indexOf(this);
    if (i >= 0) links.splice(i, 1);
    idle();
    this.onClose(this);
  }
  private label(): string { return this.name !== '' ? this.name : this.id; }
}

/** A characteristic identity belongs to one live GATT connection. */
export class GattCharacteristic {
  id: i32; service: i32; uuid: string; flags: string[]; owner: i32;
  constructor(owner: i32, id: i32, service: i32, uuid: string, flags: string[]) {
    this.owner = owner; this.id = id; this.service = service; this.uuid = uuid; this.flags = flags;
  }
}
export class GattService {
  id: i32; uuid: string; characteristics: GattCharacteristic[] = [];
  constructor(id: i32, uuid: string) { this.id = id; this.uuid = uuid; }
}
class GattRequest {
  id: i32; characteristic: i32; kind: i32; done: (value: u8[], error: string) => void;
  constructor(id: i32, characteristic: i32, kind: i32, done: (value: u8[], error: string) => void) {
    this.id = id; this.characteristic = characteristic; this.kind = kind; this.done = done;
  }
}
class GattListener {
  characteristic: i32; receive: (value: u8[]) => void;
  constructor(characteristic: i32, receive: (value: u8[]) => void) { this.characteristic = characteristic; this.receive = receive; }
}
/** Linux generic GATT central. Close explicitly; service/characteristic ids expire on close. */
export class GattConnection {
  handle: i32;
  private phase: LinkState = LinkState.connecting;
  private tree: GattService[] = [];
  private pending: GattRequest[] = [];
  private listeners: GattListener[] = [];
  private onOpen: (connection: GattConnection) => void;
  private onClose: (connection: GattConnection, error: string) => void;
  constructor(handle: i32, onOpen: (connection: GattConnection) => void, onClose: (connection: GattConnection, error: string) => void) {
    this.handle = handle; this.onOpen = onOpen; this.onClose = onClose;
  }
  private transition(next: LinkState): boolean {
    if (this.phase === LinkState.closed || (next === LinkState.open && this.phase !== LinkState.connecting)) return false;
    this.phase = next; return true;
  }
  /** Discovered snapshot; UUIDs can repeat, so operations take the characteristic object. */
  services(): GattService[] { return this.tree.slice(); }
  private request(c: GattCharacteristic, kind: i32, data: u8[], done: (value: u8[], error: string) => void): i32 {
    if (this.phase !== LinkState.open || c.owner !== this.handle) throw new Error('ble: GATT characteristic is not on this open connection');
    const id = S.gattRequest(this.handle, c.id, kind, data);
    if (id < 0) throw new Error('ble: GATT request refused (flags, length, subscription state or queue limit)');
    this.pending.push(new GattRequest(id, c.id, kind, done));
    return id;
  }
  /** Reads at most 512 bytes. An error returns an empty value plus its reason. */
  read(c: GattCharacteristic, done: (value: u8[], error: string) => void): i32 { return this.request(c, 0, [], done); }
  /** One daemon write: requests accept <=512 bytes, commands <=20 until negotiated MTU support. No retry or local chunking. */
  write(c: GattCharacteristic, value: u8[], done: (error: string) => void, withoutResponse: boolean = false): i32 {
    return this.request(c, withoutResponse ? 2 : 1, value, (bytes: u8[], error: string): void => done(error));
  }
  /** Receives binary values after a successful subscription, including values that arrived before its acknowledgement. */
  notify(c: GattCharacteristic, receive: (value: u8[]) => void, done: (error: string) => void): i32 {
    const id = this.request(c, 3, [], (value: u8[], error: string): void => done(error));
    this.listeners = this.listeners.filter((l: GattListener) => l.characteristic !== c.id);
    this.listeners.push(new GattListener(c.id, receive));
    return id;
  }
  stopNotify(c: GattCharacteristic, done: (error: string) => void): i32 {
    return this.request(c, 4, [], (value: u8[], error: string): void => done(error));
  }
  /** Drops the callback/local queued request. A write already sent to the peer cannot be undone. */
  cancel(request: i32): void {
    const i = this.pending.findIndex((r: GattRequest) => r.id === request);
    if (i < 0) return;
    const r = this.pending[i]; this.pending.splice(i, 1);
    if (r.kind === 3) this.listeners = this.listeners.filter((l: GattListener) => l.characteristic !== r.characteristic);
    S.gattCancel(this.handle, request);
  }
  close(): void { if (this.phase !== LinkState.closed) { S.close(this.handle); this.finish(''); } }
  /** Internal: only the native-discovered identities may reach callers. */
  opened(): void {
    if (this.phase !== LinkState.connecting) return;
    for (const row of S.gattTree(this.handle).split('\n')) {
      const f = row.split('\t'); if (f.length !== 5) continue;
      const id = parseInt(f[1]);
      if (f[0] === 's') this.tree.push(new GattService(id, f[3]));
      else if (f[0] === 'c') {
        const parent = parseInt(f[2]); const service = this.tree.find((s: GattService) => s.id === parent);
        if (service !== undefined) {
          const flags: string[] = []; for (const flag of f[4].split(',')) if (flag !== '') flags.push(utf8Decode(unhex(flag)));
          service.characteristics.push(new GattCharacteristic(this.handle, id, parent, f[3], flags));
        }
      }
    }
    if (this.transition(LinkState.open)) this.onOpen(this);
  }
  /** Internal: remove state before invoking user code, which may close or restart BLE. */
  result(request: i32, error: string, value: u8[]): void {
    if (this.phase !== LinkState.open) return;
    const i = this.pending.findIndex((r: GattRequest) => r.id === request); if (i < 0) return;
    const r = this.pending[i]; this.pending.splice(i, 1);
    if ((r.kind === 3 && error !== '') || (r.kind === 4 && error === '')) this.listeners = this.listeners.filter((l: GattListener) => l.characteristic !== r.characteristic);
    r.done(value, error);
  }
  value(characteristic: i32, bytes: u8[]): void {
    if (this.phase !== LinkState.open) return;
    const listener = this.listeners.find((l: GattListener) => l.characteristic === characteristic);
    if (listener !== undefined) listener.receive(bytes);
  }
  finish(error: string): void {
    if (!this.transition(LinkState.closed)) return;
    this.tree = []; this.pending = []; this.listeners = [];
    const i = gattConnections.indexOf(this); if (i >= 0) gattConnections.splice(i, 1);
    idle(); this.onClose(this, error);
  }
}
let gattConnections: GattConnection[] = [];
/** Connects a scanned device without requiring UART. macOS real generic GATT is explicitly unsupported. */
export function connectGatt(id: string, onOpen: (connection: GattConnection) => void, onClose: (connection: GattConnection, error: string) => void): GattConnection {
  usable('connectGatt'); const h = S.gattOpen(id);
  if (h < 0) throw new Error('ble: connectGatt: ' + S.error());
  const connection = new GattConnection(h, onOpen, onClose); gattConnections.push(connection); wake(); return connection;
}

let links: Link[] = [];          // connecting and open
let timer: i32 = -1;
let scanMode: ScanMode = ScanMode.idle;
let activityGeneration: i32 = 0;
let onAdvertisement: (d: Advertisement) => void = (d: Advertisement): void => {};
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
  if (scanMode !== ScanMode.idle || advertising || links.length > 0 || gattConnections.length > 0 || timer < 0) return;
  clearInterval(timer);
  timer = -1;
}
function linkOf(h: i32): Link | null {
  for (const l of links) if (l.handle === h) return l;
  return null;
}
function sighted(id: string, name: string, rssi: i32): void {
  if (scanMode !== ScanMode.uart || found.find((d: Device) => d.id === id) !== undefined) return;
  if (name === '') {
    nameless.push(id);
    if (nameless.filter((n: string) => n === id).length < NAMELESS_SIGHTINGS) return;
  }
  const d = new Device(id, name, rssi);
  found.push(d);
  onFound(d);
}
function poll(): void {
  const generation = activityGeneration;
  for (const r of S.events().split(RS)) {
    if (generation !== activityGeneration) return;
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
  if (generation !== activityGeneration) return;
  if (scanMode === ScanMode.raw) {
    for (const row of S.advertisements().split('\n')) {
      if (generation !== activityGeneration) return;
      if (row === '') continue;
      const f = row.split('\t');
      if (f.length !== 7) continue;
      const d = new Advertisement(f[0], utf8Decode(unhex(f[1])), parseInt(f[2]));
      for (const u of f[3].split(',')) if (u !== '') d.uuids.push(utf8Decode(unhex(u)));
      for (const item of f[4].split(',')) {
        const pair = item.split('=');
        if (pair.length === 2) d.manufacturerData.push(new ManufacturerData(parseInt(pair[0]), unhex(pair[1])));
      }
      for (const item of f[5].split(',')) {
        const pair = item.split('=');
        if (pair.length === 2) d.serviceData.push(new ServiceData(utf8Decode(unhex(pair[0])), unhex(pair[1])));
      }
      for (const item of f[6].split(',')) {
        const pair = item.split('=');
        if (pair.length === 2) d.advertisingData.push(new AdvertisingData(parseInt(pair[0]), unhex(pair[1])));
      }
      onAdvertisement(d);
    }
  }
  if (generation !== activityGeneration) return;
  for (const l of links.slice()) { l.drain(); if (generation !== activityGeneration) return; }
  if (gattConnections.length > 0) for (const row of S.gattEvents().split('\n')) {
    if (generation !== activityGeneration) return;
    const f = row.split('\t'); if (f.length < 2) continue;
    const h = parseInt(f[0]); const connection = gattConnections.find((c: GattConnection) => c.handle === h); if (connection === undefined) continue;
    if (f[1] === 'open') connection.opened();
    else if (f[1] === 'close') connection.finish(f.length > 2 ? utf8Decode(unhex(f[2])) : '');
    else if (f[1] === 'result' && f.length === 5) connection.result(parseInt(f[2]), utf8Decode(unhex(f[3])), unhex(f[4]));
    else if (f[1] === 'value' && f.length === 4) connection.value(parseInt(f[2]), unhex(f[3]));
  }
}

function unhex(s: string): u8[] {
  const bytes: u8[] = [];
  if (s.length % 2 !== 0) return bytes;
  for (let i = 0; i < s.length; i += 2) bytes.push(parseInt(s.slice(i, i + 2), 16));
  return bytes;
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
/** Observed adapter presence; false also while asynchronous enumeration is pending. */
export function has(): boolean { return S.has(); }
/** Explicit Linux BlueZ power request. Observe state() and error(); acceptance is not completion. */
export function powered(on: boolean): boolean { return S.powered(on); }
export function error(): string { return S.error(); }

/** Linux LE discovery, including binary manufacturer/service data. Reports updates; locally filtered by canonical UUIDs. */
export function scanAll(onDevice: (d: Advertisement) => void, seconds: i32, uuids: string[] = []): void {
  usable('scanAll');
  stopScan();
  if (!S.discover(uuids.join(','))) throw new Error('ble: scanAll: ' + S.error());
  activityGeneration++; scanMode = ScanMode.raw; onAdvertisement = onDevice;
  const generation = activityGeneration;
  if (seconds > 0) scanTimer = setTimeout(() => { if (generation === activityGeneration) stopScan(); }, seconds * 1000);
  wake();
}

/** Central: the devices advertising the UART service, each reported once per scan; seconds 0 = until stopScan(). Throws when Bluetooth
 *  cannot be used (the message says what to do). A new scan replaces the one going on. */
export function scan(onDevice: (d: Device) => void, seconds: i32): void {
  usable('scan');
  if (scanTimer >= 0) { clearTimeout(scanTimer); scanTimer = -1; }
  onFound = onDevice; found = []; nameless = [];
  activityGeneration++; scanMode = ScanMode.uart;
  S.scan();
  const generation = activityGeneration;
  if (seconds > 0) scanTimer = setTimeout(() => { if (generation === activityGeneration) stopScan(); }, seconds * 1000);
  wake();
}
export function stopScan(): void {
  if (scanTimer >= 0) { clearTimeout(scanTimer); scanTimer = -1; }
  if (scanMode === ScanMode.idle) return;
  activityGeneration++; scanMode = ScanMode.idle;
  S.stopScan();
  idle();
}

/** Central: connect to a scanned device; onOpen when the UART characteristics are ready, onMessage per received message, onClose once
 *  (also when the connection fails or times out, without onOpen). */
export function connect(id: string, onOpen: (l: Link) => void, onMessage: (l: Link, text: string) => void, onClose: (l: Link) => void): void {
  usable('connect');
  const d = found.find((x: Device) => x.id === id);
  const h = S.connect(id);
  if (h < 0) throw new Error('ble: connect: backend could not allocate a link');
  links.push(new Link(h, id, d === undefined ? '' : d.name, onOpen, onMessage, onClose));
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
  activityGeneration++;
  const closingLinks = links.slice(); const closingGatt = gattConnections.slice();
  S.stop();
  if (scanTimer >= 0) { clearTimeout(scanTimer); scanTimer = -1; }
  scanMode = ScanMode.idle; advertising = false;
  for (const l of closingLinks) l.finish();
  for (const c of closingGatt) c.finish('');
  idle();
}
