// zinc:gphoto2 — camera remote control over libgphoto2 (USB PTP/MTP, 2500+ models): detection, config tree,
// capture, events and a JPEG live view decoded off the main thread into a runtime image (gfx.drawImage).
// ZINC_FAKE_CAMERA=1 (or zinc.json plugins.gphoto2.fake) replaces the camera by a generated one; sim always does.
import G from './native/gphoto2.spec';

const RS = '\u001e', FS = '\u001f';

export class CameraInfo {
  model: string; port: string;
  constructor(model: string, port: string) { this.model = model; this.port = port; }
}

/** One leaf of the camera config tree. type: text | range | toggle | radio | menu | date | button */
export class Widget {
  path: string = ''; name: string = ''; label: string = ''; type: string = '';
  readonly: boolean = false; value: string = '';
  min: number = 0; max: number = 0; step: number = 0;
  choices: string[] = [];
}

function records(s: string): string[][] {
  const out: string[][] = [];
  for (const r of s.split(RS)) if (r.length > 0) out.push(r.split(FS));
  return out;
}

export async function detect(): Promise<CameraInfo[]> {
  const out: CameraInfo[] = [];
  for (const f of records(await G.detect())) out.push(new CameraInfo(f[0], f[1]));
  return out;
}
/** Opens a camera (model and port from detect(), or '' for the first one); resolves with the model name. */
export function open(model: string, port: string): Promise<string> { return G.open(model, port); }
export async function close(): Promise<void> { await G.close(); }
export function summary(): Promise<string> { return G.summary(); }

/** Every leaf widget of the config tree (path is the full tree path, e.g. /main/imgsettings/iso). */
export async function config(): Promise<Widget[]> {
  const out: Widget[] = [];
  for (const f of records(await G.config())) {
    const w = new Widget();
    const parts = f[0].split('/');
    w.path = f[0]; w.name = parts[parts.length - 1]; w.label = f[1]; w.type = f[2];
    w.readonly = f[3] === '1'; w.value = f[4];
    w.min = parseFloat(f[5]); w.max = parseFloat(f[6]); w.step = parseFloat(f[7]);
    w.choices = f.slice(8);
    out.push(w);
  }
  return out;
}
/** Current value of a widget, by name or path. */
export function get(name: string): Promise<string> { return G.get(name); }
/** Sets a widget (radio/menu/text: the string; range: a number; toggle: '0' | '1'; date: unix seconds). */
export async function set(name: string, value: string): Promise<void> { await G.set(name, value); }

/** Captures an image. With `dir`, downloads it there and resolves with the local path; else the camera path. */
export function capture(dir: string): Promise<string> { return G.capture(dir); }
/** Fires the shutter without waiting for the file (it arrives later as an onFileAdded event). */
export async function trigger(): Promise<void> { await G.trigger(); }
export function download(cameraPath: string, dir: string): Promise<string> { return G.download(cameraPath, dir); }
/** Decodes a local JPEG into a runtime image fitting w x h (DCT-scaled); destroy it with gfx.destroyImage. */
export async function thumbnail(path: string, w: i32, h: i32): Promise<i32> { return parseInt(await G.thumbnail(path, w, h)); }

const fileCbs: ((path: string) => void)[] = [];
const errorCbs: ((message: string) => void)[] = [];
let listening = false;
function listen(): void {
  if (listening) return;
  listening = true;
  G.onEvent((kind: string, data: string) => {
    if (kind === 'file') for (const f of fileCbs) f(data);
    else for (const f of errorCbs) f(data);
  });
}
/** A file appeared on the camera (trigger(), shutter pressed on the body). */
export function onFileAdded(cb: (path: string) => void): void { listen(); fileCbs.push(cb); }
/** Live view stopped on an error (camera unplugged, busy...). */
export function onError(cb: (message: string) => void): void { listen(); errorCbs.push(cb); }

export function startLiveView(): void { G.liveView(true); }
export function stopLiveView(): void { G.liveView(false); }
/** Box the frames are scaled to fit (keeping their aspect); call it with the size you draw at. */
export function setViewSize(w: i32, h: i32): void { G.setViewSize(w, h); }
/** Runtime image with the latest frame, for gfx.drawImage (-1 before the first frame). */
export function liveImage(): i32 { return G.liveImage(); }
export function cameraFps(): number { return G.cameraFps(); }
export function shownFps(): number { return G.shownFps(); }
export function decodeMs(): number { return G.decodeMs(); }
/**
 * Moves the camera's AF point to a spot of the live view (fx, fy: 0..1 from the top left of the frame) and
 * focuses there. Nikon: the `changeafarea` widget, in live view JPEG pixels; live view must be on.
 */
export async function focusAt(fx: number, fy: number): Promise<void> {
  const w = G.liveWidth(), h = G.liveHeight();
  if (w <= 0 || h <= 0) throw new Error('live view is not running');
  await G.set('changeafarea', `${Math.round(fx * w)}x${Math.round(fy * h)}`);
  await G.set('autofocusdrive', '1');
}
