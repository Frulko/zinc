// zinc:monitors: what a person changes about the machine's displays (docs/plugins/monitors.md). Every setter returns false when the change
// failed, and lastError() says why. A deterministic run, or ZINC_FAKE_DISPLAYS=1, sees two fake displays kept in memory, so a test never
// touches the screens of the person at the machine.
import N from './native/monitors.spec';

export interface Display {
  id: number; name: string; builtin: boolean; main: boolean; connected: boolean; virtual: boolean;
  x: number; y: number; width: number; height: number; pixelWidth: number; pixelHeight: number;
  refresh: number; rotation: number; mirrorOf: number; modeId: number;
}
export interface Mode { id: number; width: number; height: number; pixelWidth: number; pixelHeight: number; refresh: number }

/** The VCP codes of DDC/CI every monitor app uses. */
export const DDC_BRIGHTNESS = 0x10, DDC_CONTRAST = 0x12, DDC_INPUT = 0x60, DDC_VOLUME = 0x62, DDC_MUTE = 0x8D;

const isFake = N.fake();
const FAKE_BUILTIN = 1, FAKE_EXTERNAL = 2;
let fakeRevision = 0;
let fakeNextVirtual = 100;
let fakeError = '';
const fakeBrightness: Map<number, number> = new Map<number, number>();
const fakeDdc: Map<number, number> = new Map<number, number>();
const fakeModes: Mode[] = [
  { id: 1, width: 1728, height: 1117, pixelWidth: 3456, pixelHeight: 2234, refresh: 120 },
  { id: 2, width: 1512, height: 982, pixelWidth: 3024, pixelHeight: 1964, refresh: 120 },
  { id: 3, width: 1280, height: 832, pixelWidth: 2560, pixelHeight: 1664, refresh: 60 },
  { id: 4, width: 2560, height: 1440, pixelWidth: 2560, pixelHeight: 1440, refresh: 60 },
];
function fakeDisplay(id: number, name: string, builtin: boolean, x: number, width: number, height: number, pixelScale: number, refresh: number): Display {
  return { id: id, name: name, builtin: builtin, main: x === 0, connected: true, virtual: false, x: x, y: 0, width: width, height: height,
    pixelWidth: width * pixelScale, pixelHeight: height * pixelScale, refresh: refresh, rotation: 0, mirrorOf: 0, modeId: builtin ? 1 : 4 };
}
const fakeDisplays: Display[] = [
  fakeDisplay(FAKE_BUILTIN, 'Built-in Liquid Retina XDR', true, 0, 1728, 1117, 2, 120),
  fakeDisplay(FAKE_EXTERNAL, 'Studio 27', false, 1728, 2560, 1440, 1, 60),
];
function fakeFind(id: number): Display | null {
  for (const d of fakeDisplays) if (d.id === id) return d;
  return null;
}
function fakeChanged(): boolean { fakeRevision++; return true; }

export function lastError(): string { return isFake ? fakeError : N.error(); }
export function revision(): number { return isFake ? fakeRevision : N.revision(); }

export function displays(): Display[] {
  if (isFake) return fakeDisplays;
  return JSON.parse(N.displays()) as Display[];
}
export function modes(id: number): Mode[] {
  if (isFake) return fakeModes;
  return JSON.parse(N.modes(id)) as Mode[];
}
export function setMode(id: number, modeId: number): boolean {
  if (!isFake) return N.setMode(id, modeId);
  const d = fakeFind(id);
  if (d === null) return false;
  for (const m of fakeModes) {
    if (m.id !== modeId) continue;
    d.modeId = m.id; d.width = m.width; d.height = m.height; d.pixelWidth = m.pixelWidth; d.pixelHeight = m.pixelHeight; d.refresh = m.refresh;
  }
  return fakeChanged();
}

/** 0..1, -1 when the display has no brightness of its own (a monitor: use DDC). */
export function nativeBrightness(id: number): number {
  if (!isFake) return N.nativeBrightness(id);
  return id === FAKE_BUILTIN ? (fakeBrightness.get(id) ?? 0.7) : -1;
}
export function setNativeBrightness(id: number, value: number): boolean {
  if (!isFake) return N.setNativeBrightness(id, value);
  fakeBrightness.set(id, value);
  return true;
}

export interface DdcValue { current: number; maximum: number }
/** null when the monitor does not answer. */
export function ddcRead(id: number, code: number): Promise<DdcValue | null> {
  return new Promise<DdcValue | null>((resolve: (value: DdcValue | null) => void) => {
    if (isFake) { resolve(id === FAKE_BUILTIN ? null : { current: fakeDdc.get(id * 256 + code) ?? 50, maximum: 100 }); return; }
    N.ddcRead(id, code, (current: number, maximum: number) => { resolve(current < 0 ? null : { current: current, maximum: maximum }); });
  });
}
export function ddcWrite(id: number, code: number, value: number): boolean {
  if (!isFake) return N.ddcWrite(id, code, Math.round(value));
  fakeDdc.set(id * 256 + code, value);
  return true;
}

/** Software dimming and warmth, both 0..1. Lasts as long as this process. */
export function setGamma(id: number, dim: number, warmth: number): boolean { return isFake ? true : N.setGamma(id, dim, warmth); }
/** How far above SDR white the display can go; 1: it cannot. */
export function boostMax(id: number): number { return isFake ? (id === FAKE_BUILTIN ? 4 : 1) : N.boostMax(id); }
/** Lasts as long as this process; 1 removes it. */
export function setBoost(id: number, level: number): boolean { return isFake ? true : N.setBoost(id, level); }

export function setOrigin(id: number, x: number, y: number): boolean {
  if (!isFake) return N.setOrigin(id, x, y);
  const d = fakeFind(id);
  if (d === null) return false;
  d.x = x; d.y = y;
  return fakeChanged();
}
export function setMain(id: number): boolean {
  if (!isFake) return N.setMain(id);
  const target = fakeFind(id);
  if (target === null) return false;
  const dx = target.x, dy = target.y;
  for (const d of fakeDisplays) { d.x -= dx; d.y -= dy; d.main = d.id === id; }
  return fakeChanged();
}
/** Makes `id` show `masterId`; 0 stops mirroring. */
export function setMirror(id: number, masterId: number): boolean {
  if (!isFake) return N.setMirror(id, masterId);
  const d = fakeFind(id);
  if (d === null) return false;
  d.mirrorOf = masterId;
  return fakeChanged();
}
export function setRotation(id: number, degrees: number): boolean {
  if (!isFake) return N.setRotation(id, degrees);
  const d = fakeFind(id);
  if (d === null) return false;
  d.rotation = degrees;
  return fakeChanged();
}
export function setConnected(id: number, on: boolean): boolean {
  if (!isFake) return N.setConnected(id, on);
  const d = fakeFind(id);
  if (d === null) return false;
  if (!on && fakeDisplays.filter((o: Display) => o.connected).length <= 1) {
    fakeError = 'this is the last display: disconnecting it would leave no screen';
    return false;
  }
  d.connected = on;
  return fakeChanged();
}

/** A virtual display, alive until destroyVirtual or until this process ends; its id, or 0 (see lastError()). */
export function createVirtual(name: string, width: number, height: number, refresh: number, hidpi: boolean): number {
  if (!isFake) return N.createVirtual(name, width, height, refresh, hidpi);
  const d = fakeDisplay(fakeNextVirtual++, name, false, 4288, width, height, hidpi ? 2 : 1, refresh);
  d.virtual = true;
  fakeDisplays.push(d);
  fakeChanged();
  return d.id;
}
export function destroyVirtual(id: number): boolean {
  if (!isFake) return N.destroyVirtual(id);
  const d = fakeFind(id);
  if (d === null || !d.virtual) return false;
  fakeDisplays.splice(fakeDisplays.indexOf(d), 1);
  return fakeChanged();
}
