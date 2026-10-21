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
let scanning = false;
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

export default {
  state: (): string => !asked() ? 'unsupported' : sys.env('ZINC_BLE_SIM_STATE'),
  scan: (): void => { scanning = true; },
  stopScan: (): void => { scanning = false; },
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
  close: (h: i32): void => { links = links.filter((l: SimLink) => l.h !== h); },
  stop: (): void => { links = []; scanning = false; pending = ''; },
  events: (): string => {
    const r = pending + (scanning ? `device${FS}-1${FS}${SIM_ID}${FS}${SIM_NAME}${FS}-42${RS}` : '');   // it advertises at every look
    pending = '';
    return r;
  },
};
