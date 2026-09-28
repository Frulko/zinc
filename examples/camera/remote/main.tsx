// Camera remote: live view, main settings, capture with thumbnail, over zinc:gphoto2 (USB PTP via libgphoto2).
// No camera attached? ZINC_FAKE_CAMERA=1 zinc run examples/camera/remote   (the sim target always fakes one)
// Frames are decoded and scaled on the plugin's worker thread to the live view box: drawing one is a row copy.
import { createSignal, render, For, Show } from 'zinc:ui/solid';
import { rect, drawImage, imageWidth, imageHeight, destroyImage } from 'zinc:gfx';
import * as camera from 'zinc:gphoto2';

const CAPTURES = 'captures';
// settings shown in the panel: first widget found per group (Canon, Nikon, Sony names)
const GROUPS: string[][] = [['iso', 'ISO'], ['aperture', 'f-number', 'Aperture'], ['shutterspeed', 'shutterspeed2', 'Shutter'],
  ['whitebalance', 'WB'], ['focusmode', 'Focus'], ['exposurecompensation', 'Exp. comp'], ['imageformat', 'imagequality', 'Format']];

class Setting {
  w: camera.Widget; title: string;
  constructor(w: camera.Widget, title: string) { this.w = w; this.title = title; }
}

const [cams, setCams] = createSignal<camera.CameraInfo[]>([]);
const [model, setModel] = createSignal<string>('');
const [status, setStatus] = createSignal<string>('looking for cameras...');
const [settings, setSettings] = createSignal<Setting[]>([]);
const [menu, setMenu] = createSignal<i32>(-1);           // setting whose choice list is open
const [live, setLive] = createSignal<boolean>(false);
const [stats, setStats] = createSignal<string>('');
const [busy, setBusy] = createSignal<boolean>(false);
const [lastFile, setLastFile] = createSignal<string>('no capture yet');
let thumb: i32 = -1;
let camIdx: i32 = 0;

function fail(what: string, e: Error): void { setStatus(`${what}: ${e.message}`); }

async function scan(): Promise<void> {
  try {
    const list = await camera.detect();
    setCams(list);
    if (list.length === 0) { setStatus('no camera found - plug one in (USB, PTP mode) and press Rescan'); return; }
    await connect(camIdx % list.length);
  } catch (e) { fail('detect', e); }
}

async function connect(i: i32): Promise<void> {
  camIdx = i;
  const c = cams()[i];
  setStatus(`opening ${c.model}...`);
  try {
    setModel(await camera.open(c.model, c.port));
    const ws = await camera.config();
    const out: Setting[] = [];
    for (const g of GROUPS) {
      const w = ws.find((x: camera.Widget, _i: i32) => !x.readonly && g.indexOf(x.name) >= 0 && g.indexOf(x.name) < g.length - 1);
      if (w !== undefined) out.push(new Setting(w, g[g.length - 1]));
    }
    setSettings(out);
    camera.startLiveView();
    setLive(true);
    setStatus(`${c.model} on ${c.port}`);
  } catch (e) { fail('open', e); }
}

async function apply(s: Setting, value: string): Promise<void> {
  try {
    await camera.set(s.w.name, value);
    s.w.value = value;
    setSettings(settings().slice());
  } catch (e) { fail(s.title, e); }
}
function step(s: Setting, dir: i32): void {
  const w = s.w;
  if (w.type === 'range') { apply(s, `${Math.min(w.max, Math.max(w.min, parseFloat(w.value) + dir * w.step))}`); return; }
  if (w.type === 'toggle') { apply(s, w.value === '1' ? '0' : '1'); return; }
  const i = w.choices.indexOf(w.value) + dir;
  if (i >= 0 && i < w.choices.length) apply(s, w.choices[i]);
}

async function showThumb(path: string): Promise<void> {
  const t = await camera.thumbnail(path, 264, 176);
  if (thumb >= 0) destroyImage(thumb);
  thumb = t;
  setLastFile(path);
}
async function capture(): Promise<void> {
  if (busy() || model() === '') return;
  setBusy(true);
  try { await showThumb(await camera.capture(CAPTURES)); } catch (e) { fail('capture', e); }
  setBusy(false);
}
// shutter pressed on the camera body: fetch the file too
camera.onFileAdded((p: string) => { camera.download(p, CAPTURES).then((local: string) => { showThumb(local); }); });
camera.onError((m: string) => { setLive(false); setStatus(`live view stopped: ${m}`); });

function toggleLive(): void {
  if (model() === '') return;
  if (live()) camera.stopLiveView(); else camera.startLiveView();
  setLive(!live());
}

/** Draws `img` as large as fits in the box, centered (1:1 when the plugin already scaled it to the box). */
function fit(img: i32, x: i32, y: i32, w: i32, h: i32): void {
  const iw = imageWidth(img), ih = imageHeight(img);
  if (iw <= 0 || ih <= 0) return;
  const s = Math.min(w / iw, h / ih);
  const dw = Math.round(iw * s), dh = Math.round(ih * s);
  drawImage(img, x + Math.floor((w - dw) / 2), y + Math.floor((h - dh) / 2), dw, dh, 255, 0);
}
function LiveView(x: i32, y: i32, w: i32, h: i32): void {
  rect(x, y, w, h, 0x000000);
  camera.setViewSize(w, h);
  const img = camera.liveImage();
  if (live() && img >= 0) fit(img, x, y, w, h);
}
function Thumb(x: i32, y: i32, w: i32, h: i32): void {
  rect(x, y, w, h, 0x0b1220);
  if (thumb >= 0) fit(thumb, x, y, w, h);
}

function SettingRow(s: Setting, i: i32): i32 {
  return <view class="flex-row items-center gap-1 h-8">
    <text class="w-16 text-xs text-slate-400">{s.title}</text>
    <button class="w-7 h-7 rounded bg-slate-700 active:bg-slate-500" onClick={() => { step(s, -1); }}><text>{'<'}</text></button>
    <button class="grow h-7 rounded bg-slate-800 active:bg-slate-600" onClick={() => { setMenu(menu() === i ? -1 : i); }}>
      <text class="text-sm text-white">{s.w.value}</text>
    </button>
    <button class="w-7 h-7 rounded bg-slate-700 active:bg-slate-500" onClick={() => { step(s, 1); }}><text>{'>'}</text></button>
  </view>;
}
/** Choice list of the open setting (a For over 0 or 1 item re-renders when the menu or a value changes). */
function openMenu(): Setting[] { return menu() >= 0 && menu() < settings().length ? [settings()[menu()]] : []; }
function Choices(s: Setting, _i: i32): i32 {
  return <view class="flex-col absolute top-12 right-72 w-96 mr-2 p-3 gap-2 rounded-lg bg-slate-800 border border-slate-600 shadow-lg">
    <text class="text-sm text-amber-400">{s.w.label}</text>
    <view class="flex-row flex-wrap gap-1">
      <For each={s.w.choices}>{(c: string, _i: i32) =>
        <button class={c === s.w.value ? 'px-2 h-7 rounded bg-amber-500' : 'px-2 h-7 rounded bg-slate-700 active:bg-slate-500'}
          onClick={() => { setMenu(-1); apply(s, c); }}><text class="text-sm">{c}</text></button>}
      </For>
    </view>
  </view>;
}

function App(): i32 {
  return <view class="flex-row h-full bg-slate-950">
    <view class="flex-col grow">
      <view class="flex-row items-center gap-2 px-3 h-10 bg-slate-900">
        <button class="px-3 h-7 rounded bg-slate-700 active:bg-slate-500"
          onClick={() => { if (cams().length > 1) connect((camIdx + 1) % cams().length); }}>
          <text class="text-sm">{model() === '' ? 'No camera' : model()}{cams().length > 1 ? ` (${camIdx + 1}/${cams().length})` : ''}</text>
        </button>
        <button class="px-3 h-7 rounded bg-slate-800 active:bg-slate-600" onClick={() => { scan(); }}><text class="text-sm">Rescan</text></button>
        <view class="grow"></view>
        <text class="text-sm text-emerald-400">{stats()}</text>
      </view>
      <canvas class="grow items-center justify-center" onDraw={LiveView}>
        <Show when={!live()}><text class="text-slate-500">{model() === '' ? 'no camera' : 'live view off'}</text></Show>
      </canvas>
      <view class="flex-row items-center px-3 h-7 bg-slate-900">
        <text class="text-xs text-slate-400">{status()}</text>
      </view>
    </view>
    <view class="flex-col w-72 p-3 gap-2 bg-slate-900 border-slate-800">
      <text class="text-xs text-slate-500 tracking-wider">SETTINGS</text>
      <For each={settings()}>{(s: Setting, i: i32) => SettingRow(s, i)}</For>
      <view class="grow"></view>
      <view class="flex-row gap-2">
        <button class="w-24 h-11 rounded-lg bg-slate-700 active:bg-slate-500" onClick={toggleLive}>
          <text class="text-sm">{live() ? 'Live: on' : 'Live: off'}</text>
        </button>
        <button class="grow h-11 rounded-lg bg-red-600 active:bg-red-400" onClick={() => { capture(); }}>
          <text class="font-bold">{busy() ? 'Capturing...' : 'Capture'}</text>
        </button>
      </view>
      <canvas class="h-44 rounded" onDraw={Thumb}></canvas>
      <text class="text-xs text-slate-400">{lastFile()}</text>
    </view>
    <For each={openMenu()}>{(s: Setting, i: i32) => Choices(s, i)}</For>
  </view>;
}

let acc = 0;
render(App, 0x020617, (dt: number) => {
  acc += dt;
  if (acc < 0.5) return;
  acc = 0;
  const img = camera.liveImage();
  setStats(live() ? `camera ${camera.cameraFps().toFixed(1)} fps  ·  shown ${camera.shownFps().toFixed(1)} fps  ·  decode ${camera.decodeMs().toFixed(1)} ms  ·  ${img >= 0 ? imageWidth(img) : 0}x${img >= 0 ? imageHeight(img) : 0}` : '');
});
scan();
