// zinc:ble without native code. When asked for (ZINC_BLE_SIM=1, ZINC_NATIVE=sim, a deterministic run): a radio with one peripheral, "Zinc sim", that
// advertises the UART service and sends back every byte written to it; advertise() gets one central, "Zinc sim central", that echoes too.
// Links carry 20-byte chunks, as a real one does before the MTU exchange. Anywhere else (a target with no native code) Bluetooth is
// 'unsupported'. ZINC_BLE_SIM_STATE=off (or unauthorized...) makes the simulated radio report that state, for the error paths.
import * as sys from 'zinc:sys';

const SIM_ID = 'zinc-sim', SIM_NAME = 'Zinc sim';
const CENTRAL_ID = 'zinc-sim-central', CENTRAL_NAME = 'Zinc sim central';
const CHUNK = 20;
const RS = '\u001e', FS = '\u001f';

class SimLink {
  h: i32;
  rx: u8[] = [];
  constructor(h: i32) { this.h = h; }
}
let links: SimLink[] = [];
let next: i32 = 0;
enum Scan { idle, uart, raw, empty }
let scan: Scan = Scan.idle;
function scanTo(next: Scan): void { scan = next; }
let pending = '';

function asked(): boolean {   // the rule of ble.macos.mm's simulated radio
  const on = (k: string): boolean => sys.env(k) !== '' && sys.env(k) !== '0';
  return on('ZINC_BLE_SIM') || sys.env('ZINC_NATIVE') === 'sim' || on('ZINC_DETERMINISTIC');
}
function at(h: i32): SimLink | null {
  for (const l of links) if (l.h === h) return l;
  return null;
}
function opened(id: string, name: string): i32 {
  const h = next++;
  links.push(new SimLink(h));
  pending += `open${FS}${h}${FS}${id}${FS}${name}${RS}`;
  return h;
}

enum GattNotify { off, starting, on, stopping }
class GattSimLink {
  handle: i32; service: i32; characteristic: i32; value: u8[] = [100]; notify: GattNotify = GattNotify.off;
  constructor(handle: i32, service: i32, characteristic: i32) { this.handle = handle; this.service = service; this.characteristic = characteristic; }
  notifyTo(next: GattNotify): boolean {
    const ok = (this.notify === GattNotify.off && next === GattNotify.starting) || (this.notify === GattNotify.starting && (next === GattNotify.on || next === GattNotify.off)) ||
      (this.notify === GattNotify.on && next === GattNotify.stopping) || (this.notify === GattNotify.stopping && (next === GattNotify.off || next === GattNotify.on));
    if (ok) this.notify = next; return ok;
  }
}
class GattSimRequest {
  handle: i32; id: i32; kind: i32; value: u8[];
  constructor(handle: i32, id: i32, kind: i32, value: u8[]) { this.handle = handle; this.id = id; this.kind = kind; this.value = value; }
}
let gattLinks: GattSimLink[] = [], gattRequests: GattSimRequest[] = [];
let gattNext: i32 = 1073741824, gattAttribute: i32 = 1, gattRequestId: i32 = 1;
let gattPending = '';
function gattHex(bytes: u8[]): string { const digits = '0123456789abcdef'; let out = ''; for (const b of bytes) out += digits[b >> 4] + digits[b & 15]; return out; }
function gattClose(handle: i32): void {
  gattLinks = gattLinks.filter((l: GattSimLink) => l.handle !== handle);
  gattRequests = gattRequests.filter((r: GattSimRequest) => r.handle !== handle);
  let keep = ''; for (const row of gattPending.split('\n')) if (row !== '' && !row.startsWith(`${handle}\t`)) keep += row + '\n';
  gattPending = keep;
}
function gattTree(handle: i32): string {
  const l = gattLinks.find((l: GattSimLink) => l.handle === handle); if (l === undefined) return '';
  return `s\t${l.service}\t0\t0000180f-0000-1000-8000-00805f9b34fb\t\nc\t${l.characteristic}\t${l.service}\t00002a19-0000-1000-8000-00805f9b34fb\t72656164,7772697465,77726974652d776974686f75742d726573706f6e7365,6e6f74696679,\n`;
}
function gattEvents(): string {
  const work = gattRequests; gattRequests = [];
  for (const r of work) {
    const l = gattLinks.find((l: GattSimLink) => l.handle === r.handle); if (l === undefined) continue;
    let value: u8[] = [];
    if (r.kind === 0) value = l.value;
    else if (r.kind === 1 || r.kind === 2) {
      l.value = r.value;
      if (l.notify === GattNotify.on) gattPending += `${r.handle}\tvalue\t${l.characteristic}\t${gattHex(l.value)}\n`;
    } else l.notifyTo(r.kind === 3 ? GattNotify.on : GattNotify.off);
    gattPending += `${r.handle}\tresult\t${r.id}\t\t${gattHex(value)}\n`;
  }
  const out = gattPending; gattPending = ''; return out;
}

export default {
  gattOpen: (id: string): i32 => {
    if (!asked() || id !== SIM_ID || gattNext === 2147483647 || gattAttribute > 2147483645 || gattLinks.length >= 16 || gattPending.length > 32768) return -1;
    const h = gattNext++; gattLinks.push(new GattSimLink(h, gattAttribute++, gattAttribute++)); gattPending += `${h}\topen\n`; return h;
  },
  gattTree: (h: i32): string => gattTree(h),
  gattRequest: (h: i32, c: i32, kind: i32, bytes: u8[]): i32 => {
    const l = gattLinks.find((l: GattSimLink) => l.handle === h);
    if (l === undefined || c !== l.characteristic || kind < 0 || kind > 4 || bytes.length > (kind === 1 ? 512 : kind === 2 ? 20 : 0) || gattRequests.length >= 32 || gattRequestId === 2147483647) return -1;
    if (kind === 3) { if (l.notify !== GattNotify.off) return -1; l.notifyTo(GattNotify.starting); }
    if (kind === 4) { if (l.notify !== GattNotify.on) return -1; l.notifyTo(GattNotify.stopping); }
    const id = gattRequestId++; gattRequests.push(new GattSimRequest(h, id, kind, bytes.slice())); return id;
  },
  gattCancel: (h: i32, id: i32): void => {
    const i = gattRequests.findIndex((r: GattSimRequest) => r.handle === h && r.id === id); if (i < 0) return;
    const r = gattRequests[i]; const l = gattLinks.find((l: GattSimLink) => l.handle === h);
    if (l !== undefined && r.kind >= 3) l.notifyTo(r.kind === 3 ? GattNotify.off : GattNotify.on);
    gattRequests.splice(i, 1);
  },
  gattEvents: (): string => gattEvents(),
  state: (): string => !asked() ? 'unsupported' : sys.env('ZINC_BLE_SIM_STATE'),
  has: (): boolean => asked(),
  powered: (on: boolean): boolean => false,
  discover: (uuids: string): boolean => { if (!asked()) return false; scanTo(uuids === '' || uuids.split(',').includes('6e400001-b5a3-f393-e0a9-e50e24dcca9e') ? Scan.raw : Scan.empty); return true; },
  advertisements: (): string => scan === Scan.raw ? 'zinc-sim\t5a696e632073696d\t-42\t36653430303030312d623561332d663339332d653061392d653530653234646363613965,\t\t\t\n' : '',
  error: (): string => 'simulator power control is unavailable',
  scan: (): void => { scanTo(Scan.uart); },
  stopScan: (): void => { scanTo(Scan.idle); },
  connect: (id: string): i32 => {
    if (id === SIM_ID) return opened(SIM_ID, SIM_NAME);
    const h = next++;
    pending += `close${FS}${h}${RS}`;
    return h;
  },
  advertise: (name: string): boolean => { opened(CENTRAL_ID, CENTRAL_NAME); return true; },
  maxWrite: (h: i32): i32 => CHUNK,
  write: (h: i32, chunk: u8[]): boolean => {
    const l = at(h);
    if (l === null || chunk.length > CHUNK) return false;
    for (const b of chunk) l.rx.push(b);
    return true;
  },
  read: (h: i32): u8[] => {
    const l = at(h);
    if (l === null) return [];
    const r = l.rx;
    l.rx = [];
    return r;
  },
  close: (h: i32): void => { gattClose(h); links = links.filter((l: SimLink) => l.h !== h); },
  stop: (): void => { gattLinks = []; gattRequests = []; gattPending = ''; links = []; scanTo(Scan.idle); pending = ''; },
  events: (): string => {
    const r = pending + (scan === Scan.uart ? `device${FS}-1${FS}${SIM_ID}${FS}${SIM_NAME}${FS}-42${RS}` : '');   // it advertises at every look
    pending = '';
    return r;
  },
};
