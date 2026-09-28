// Camera session logic: detection, connection, settings, capture and live view, over zinc:gphoto2.
// Every camera call is async; failures end up in the status line instead of stopping the app.
import * as camera from 'zinc:gphoto2';
import { destroyImage, imageWidth, imageHeight } from 'zinc:gfx';
import {
  SETTING_GROUPS, Setting, cameras, setCameras, cameraIndex, setCameraIndex, model, setModel, setStatus,
  setSettings, live, setLive, busy, setBusy, setLastFile,
} from './state';

const CAPTURES_DIR = 'captures';

/** Runtime image of the last capture's thumbnail (-1: none yet); drawn by the sidebar. */
export let thumbnail: i32 = -1;

function fail(what: string, e: Error): void {
  setStatus(`${what}: ${e.message}`);
}

/** Detects cameras and opens the current one. */
export async function scan(): Promise<void> {
  try {
    const list = await camera.detect();
    setCameras(list);
    if (list.length === 0) {
      setStatus('No camera found. Plug one in (USB, PTP mode) and press Rescan.');
      return;
    }
    await connect(cameraIndex() % list.length);
  } catch (e) {
    fail('detect', e);
  }
}

/** The first writable widget of each setting group. */
function findSettings(widgets: camera.Widget[]): Setting[] {
  const out: Setting[] = [];
  for (const group of SETTING_GROUPS) {
    const names = group.slice(0, group.length - 1);
    const widget = widgets.find((w: camera.Widget, _i: i32) => !w.readonly && names.indexOf(w.name) >= 0);
    if (widget !== undefined) out.push(new Setting(widget, group[group.length - 1]));
  }
  return out;
}

/** Opens camera `index`, reads its settings and starts the live view. */
export async function connect(index: i32): Promise<void> {
  setCameraIndex(index);
  const info = cameras()[index];
  setStatus(`Opening ${info.model}…`);
  try {
    setModel(await camera.open(info.model, info.port));
    setSettings(findSettings(await camera.config()));
    camera.startLiveView();
    setLive(true);
    setStatus(`${info.model} on ${info.port}`);
  } catch (e) {
    fail('open', e);
  }
}

/** Opens the next camera when several are plugged in. */
export function nextCamera(): void {
  if (cameras().length > 1) connect((cameraIndex() + 1) % cameras().length);
}

/** Sends a new value to the camera; the row shows it once the camera accepted it. */
export async function apply(s: Setting, value: string): Promise<void> {
  try {
    await camera.set(s.widget.name, value);
    s.widget.value = value;
    s.setValue(value);
  } catch (e) {
    fail(s.title, e);
  }
}

/** Previous / next value: ranges move by their step, toggles flip, menus walk their choice list. */
export function step(s: Setting, direction: i32): void {
  const w = s.widget;
  if (w.type === 'range') {
    const next = Math.min(w.max, Math.max(w.min, parseFloat(w.value) + direction * w.step));
    apply(s, `${next}`);
  } else if (w.type === 'toggle') {
    apply(s, w.value === '1' ? '0' : '1');
  } else {
    const i = w.choices.indexOf(w.value) + direction;
    if (i >= 0 && i < w.choices.length) apply(s, w.choices[i]);
  }
}

async function showThumbnail(path: string): Promise<void> {
  const image = await camera.thumbnail(path, 264, 176);
  if (thumbnail >= 0) destroyImage(thumbnail);
  thumbnail = image;
  setLastFile(path);
}

/** Captures a photo, downloads it to ./captures and shows its thumbnail. */
export async function capture(): Promise<void> {
  if (busy() || model() === '') return;
  setBusy(true);
  try {
    await showThumbnail(await camera.capture(CAPTURES_DIR));
  } catch (e) {
    fail('capture', e);
  }
  setBusy(false);
}

export function setLiveView(on: boolean): void {
  if (model() === '') return;
  if (on) camera.startLiveView(); else camera.stopLiveView();
  setLive(on);
}

/** Photos taken with the camera's own shutter are downloaded too; live view errors stop it. */
export function watchCamera(): void {
  camera.onFileAdded((path: string) => {
    camera.download(path, CAPTURES_DIR).then((local: string) => { showThumbnail(local); });
  });
  camera.onError((message: string) => {
    setLive(false);
    setStatus(`Live view stopped: ${message}`);
  });
}

/** One line of live view statistics (refreshed twice a second by main.tsx). */
export function liveStats(): string {
  if (!live()) return '';
  const image = camera.liveImage();
  const size = image >= 0 ? `${imageWidth(image)}x${imageHeight(image)}` : 'no frame';
  return `${camera.cameraFps().toFixed(1)} fps camera · ${camera.shownFps().toFixed(1)} fps shown · ` +
    `${camera.decodeMs().toFixed(1)} ms decode · ${size}`;
}
