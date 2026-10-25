// zinc:location — where the device is (docs/plugins/location.md): the permission (when in use), the current position, a watch. Errors are
// values, never exceptions: every answer is a PositionResult holding a position or an error with a code and a message to show.
// The native side (native/location.spec.ts, Core Location on iOS and macOS) runs on its own callbacks; this file polls it on a timer and
// calls the program's callbacks on the program's thread.
// The fake provider: ZINC_FAKE_LOCATION="lat,lon[,accuracy];lat,lon..." walks the path one point a second (then stays); "denied",
// "restricted", "off" (services off) and "silent" (granted, never a fix: a timeout) stand for the system's answers. It starts undetermined
// and requestPermission() grants it. A deterministic run (ZINC_DETERMINISTIC) uses it at FAKE_HOME unless ZINC_FAKE_LOCATION=0.
import S from './native/location.spec';
import * as sys from 'zinc:sys';

export type PermissionStatus = 'granted' | 'denied' | 'restricted' | 'undetermined' | 'services-off' | 'unavailable';
export type LocationErrorCode = 'denied' | 'restricted' | 'services-off' | 'unavailable' | 'timeout';

export interface Position {
  latitude: number;
  longitude: number;
  /** Radius of the circle the device is in, in metres. */
  accuracy: number;
  /** Metres above sea level, null when unknown. */
  altitude: number | null;
  altitudeAccuracy: number | null;
  /** Metres per second, null when unknown. */
  speed: number | null;
  /** Degrees from true north, clockwise, null when unknown. */
  heading: number | null;
  /** When the fix was taken, ms since 1970. */
  timestamp: number;
}
export interface LocationError { code: LocationErrorCode; message: string }
/** One answer: a position, or an error (the other is null). */
export interface PositionResult { position: Position | null; error: LocationError | null }
export interface PositionOptions {
  /** The accuracy wanted, in metres (default 0: the best the device has). */
  accuracy?: number;
  /** watchPosition: metres moved between two calls (default 0: every fix). */
  distanceFilter?: number;
  /** getCurrentPosition: how long to wait, in ms (default 15000). */
  timeout?: number;
}

const FS = '\u001f';
const STATUS: PermissionStatus[] = ['undetermined', 'granted', 'denied', 'restricted', 'services-off', 'unavailable'];
const FAKE_HOME = '48.8584,2.2945,5';   // the Eiffel Tower
const FAKE_EPOCH = 1767225600000;        // 2026-01-01, the fake fixes' clock
function message(code: string): string {
  if (code === 'denied') return 'location: access was denied; allow it in Settings > Privacy & Security > Location Services';
  if (code === 'restricted') return 'location: access is restricted on this device (parental controls or a profile)';
  if (code === 'services-off') return 'location: Location Services are off; turn them on in Settings > Privacy & Security';
  if (code === 'unavailable') return 'location: no location provider on this platform (ZINC_FAKE_LOCATION="lat,lon" stands in for one)';
  if (code === 'undetermined') return 'location: the question was not answered';
  return 'location: failed';
}

class FakeProvider {
  points: number[][] = [];
  status: i32 = 0;
  silent: boolean = false;
  on: boolean = false;
  next: i32 = 0;
  seq: i32 = 0;
  constructor(spec: string) {
    if (spec === 'denied') this.status = 2;
    else if (spec === 'restricted') this.status = 3;
    else if (spec === 'off') this.status = 4;
    else if (spec === 'silent') this.silent = true;
    else for (const p of spec.split(';')) {
      const f = p.split(',');
      if (f.length >= 2) this.points.push([parseFloat(f[0]), parseFloat(f[1]), f.length > 2 ? parseFloat(f[2]) : 5]);
    }
  }
  permission(ask: boolean): i32 { if (ask && this.status === 0) this.status = 1; return this.status; }
  /** One point per call while on, then the last one stays. */
  fix(): number[] {
    if (this.on && !this.silent && this.next < this.points.length) { this.seq++; this.next++; }
    if (this.seq === 0) return [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const p = this.points[this.next - 1];
    return [this.seq, p[0], p[1], p[2], NaN, NaN, NaN, NaN, FAKE_EPOCH + this.seq * 1000];
  }
}

function fakeSpec(): string {
  const v = sys.env('ZINC_FAKE_LOCATION');
  if (v === '0') return '';
  if (v !== '') return v;
  return sys.env('ZINC_DETERMINISTIC') !== '' && sys.env('ZINC_REALTIME') === '' ? FAKE_HOME : '';
}
const spec = fakeSpec();
const fake: FakeProvider | null = spec !== '' ? new FakeProvider(spec) : null;
const POLL_MS = fake !== null ? 1000 : 250;

function rawStatus(ask: boolean): i32 { return fake !== null ? fake.permission(ask) : S.permission(ask); }
function failure(code: LocationErrorCode, why: string = ''): PositionResult {
  return { position: null, error: { code: code, message: why !== '' ? why : message(code) } };
}
const unknown = (v: number): number | null => isNaN(v) ? null : v;

/** Where access stands now, without asking. */
export function permissionStatus(): PermissionStatus {
  return S.allowed() !== '' ? 'denied' : STATUS[rawStatus(false)];
}

/** Asks for the location while the app is in use: the system shows its question once per app and this resolves when the person answers (or
 *  after a minute, 'undetermined'). A background run (ZINC_BACKGROUND=1) never asks. */
export function requestPermission(): Promise<PermissionStatus> {
  if (S.allowed() !== '') return Promise.resolve<PermissionStatus>('denied');
  const first = rawStatus(true);
  if (first !== 0) return Promise.resolve(STATUS[first]);
  const bg = sys.env('ZINC_BACKGROUND');
  if (fake === null && bg !== '' && bg !== '0') return Promise.resolve(STATUS[first]);   // never asked in a background run: no answer to wait for
  return new Promise<PermissionStatus>((resolve: (s: PermissionStatus) => void) => {
    let tries = 0, t: i32 = -1;
    t = setInterval(() => {
      const s = rawStatus(false);
      if (s === 0 && ++tries < 600) return;
      clearInterval(t);
      resolve(STATUS[s]);
    }, 100);
  });
}

/** Ready to locate: '' when access is granted (asked first when undetermined), else the error. */
async function ready(): Promise<PositionResult | null> {
  const refused = S.allowed();
  if (refused !== '') return failure('denied', refused);
  let s = STATUS[rawStatus(false)];
  if (s === 'undetermined') s = await requestPermission();
  if (s === 'granted') return null;
  return failure(s === 'restricted' || s === 'services-off' || s === 'unavailable' ? s : 'denied', s === 'undetermined' ? message('undetermined') : '');
}

// ---------------------------------------------------------------- the poller: one timer while anything listens
class Request {
  cb: (r: PositionResult) => void;
  once: boolean;
  timeout: number;
  left: number;
  accuracy: number;
  distance: number;
  constructor(cb: (r: PositionResult) => void, once: boolean, o: PositionOptions) {
    this.cb = cb; this.once = once;
    this.timeout = o.timeout ?? 15000; this.left = this.timeout; this.accuracy = o.accuracy ?? 0; this.distance = o.distanceFilter ?? 0;
  }
}
let requests: Request[] = [];
let timer: i32 = -1;
let seen = 0, lastAt = 0;
let last: Position | null = null;

function retune(): void {
  let acc = -1, dist = -1;
  for (const r of requests) {
    if (acc < 0 || r.accuracy < acc) acc = r.accuracy;
    if (!r.once && (dist < 0 || r.distance < dist)) dist = r.distance;
  }
  if (fake !== null) fake.on = true;
  else S.start(acc < 0 ? 0 : acc, dist < 0 ? 0 : dist);
}
function idle(): void {
  if (requests.length > 0 || timer < 0) return;
  clearInterval(timer);
  timer = -1;
  if (fake !== null) fake.on = false;
  else S.stop();
}
function deliver(r: PositionResult, all: boolean): void {
  const now = requests;
  requests = [];
  for (const q of now) {
    if (all || !q.once || r.position !== null) q.cb(r);
    if (!q.once && !(all && r.error !== null)) requests.push(q);   // a watch that failed is over
  }
}
function tick(): void {
  const e = fake !== null ? '' : S.error();
  if (e !== '') {
    const i = e.indexOf(FS);
    const code = e.substring(0, i) === 'denied' ? 'denied' : 'unavailable';
    deliver(failure(code, `location: ${e.substring(i + 1)}`), true);
  } else {
    const f = fake !== null ? fake.fix() : S.fix();
    if (f[0] > 0 && f[0] !== seen) {
      seen = f[0];
      last = { latitude: f[1], longitude: f[2], accuracy: f[3], altitude: unknown(f[4]), altitudeAccuracy: unknown(f[5]), speed: unknown(f[6]), heading: unknown(f[7]), timestamp: f[8] };
      lastAt = Date.now();
      deliver({ position: last, error: null }, false);
    }
    const waiting = requests;
    requests = [];
    for (const q of waiting) {
      if (q.once) q.left -= POLL_MS;
      if (q.once && q.left <= 0) q.cb(failure('timeout', `location: no position within ${q.timeout} ms`));
      else requests.push(q);
    }
  }
  idle();
}
function listen(q: Request): void {
  const fresh = last;
  if (fresh !== null && Date.now() - lastAt < 10000) {   // a fix of the last 10 s answers at once (a watch's first call)
    q.cb({ position: fresh, error: null });
    if (q.once) return;
  }
  requests.push(q);
  retune();
  if (timer < 0) timer = setInterval(tick, POLL_MS);
}

/** The position now. Asks for access first when it was never asked. Resolves with an error value (denied, restricted, services-off,
 *  unavailable, timeout), never rejects. */
export function getCurrentPosition(o: PositionOptions = {}): Promise<PositionResult> {
  return new Promise<PositionResult>((resolve: (r: PositionResult) => void) => {
    ready().then((no: PositionResult | null) => { if (no !== null) resolve(no); else listen(new Request(resolve, true, o)); });
  });
}

/** A watch on the position: `cb` gets each new fix, or the error that ended the watch. */
export class Watch {
  private q: Request | null = null;
  private stopped: boolean = false;
  /** Called by watchPosition. */
  start(cb: (r: PositionResult) => void, o: PositionOptions): void {
    ready().then((no: PositionResult | null) => {
      if (this.stopped) return;
      if (no !== null) { cb(no); return; }
      this.q = new Request(cb, false, o);
      listen(this.q);
    });
  }
  /** No more calls; the provider stops when nothing else listens. */
  stop(): void {
    this.stopped = true;
    const q = this.q;
    if (q === null) return;
    requests = requests.filter((r: Request) => r !== q);
    this.q = null;
    idle();
  }
}

/** Calls `cb` with each new position (and asks for access first when it was never asked) until stop(). */
export function watchPosition(cb: (r: PositionResult) => void, o: PositionOptions = {}): Watch {
  const w = new Watch();
  w.start(cb, o);
  return w;
}

/** The distance between two positions along the Earth's surface, in metres (haversine). */
export function distance(a: Position, b: Position): number {
  const R = 6371008.8, rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad, dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
