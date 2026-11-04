// The app's state and its actions. Displays are named by id at run time and by name on disk: an id can change between two launches.
import { createSignal } from 'zinc:ui/solid';
import * as M from 'zinc:monitors';
import { Config, DisplayTune, VirtualSpec, loadConfig, saveConfig } from './services/config';

export const REVERT_SECONDS = 15;
const REVISION_POLL_MS = 700;

export type BrightnessSource = 'native' | 'ddc' | 'software';

/** The menu row that shows its content: one at a time, as the panel must stay short. '' : none. */
export const [openRow, setOpenRow] = createSignal<string>('');
export const [displays, setDisplays] = createSignal<M.Display[]>([]);
export const [selectedId, setSelectedId] = createSignal<number>(0);
export const [notice, setNotice] = createSignal<string>('');
export const [virtualIds, setVirtualIds] = createSignal<number[]>([]);
/** A mode just changed: seconds before it goes back unless the person keeps it. 0: nothing pending. */
export const [revertLeft, setRevertLeft] = createSignal<number>(0);

// The selected display's controls, read once when it is selected: a DDC read takes 50 ms.
export const [brightness, setBrightnessValue] = createSignal<number>(1);
export const [brightnessSource, setBrightnessSource] = createSignal<BrightnessSource>('software');
export const [hasDdc, setHasDdc] = createSignal<boolean>(false);
export const [contrast, setContrastValue] = createSignal<number>(0.5);
export const [volume, setVolumeValue] = createSignal<number>(0.5);
export const [muted, setMutedValue] = createSignal<boolean>(false);
export const [input, setInputValue] = createSignal<number>(0);
export const [warmth, setWarmthValue] = createSignal<number>(0);
export const [boost, setBoostValue] = createSignal<number>(1);
export const [boostLimit, setBoostLimit] = createSignal<number>(1);
export const [modes, setModes] = createSignal<M.Mode[]>([]);

let config: Config = { virtuals: [], tunes: [] };
let ddcMaxBrightness = 100, ddcMaxContrast = 100, ddcMaxVolume = 100;
let seenRevision = -1;
let revertTimer: i32 = -1;
let revertDisplay = 0, revertMode = 0;

function report(ok: boolean): boolean {
  setNotice(ok ? '' : M.lastError());
  return ok;
}

export function selected(): M.Display | null {
  for (const d of displays()) if (d.id === selectedId()) return d;
  return null;
}
function tuneOf(name: string): DisplayTune {
  for (const t of config.tunes) if (t.name === name) return t;
  const created: DisplayTune = { name: name, dim: 1, warmth: 0, boost: 1 };
  config.tunes.push(created);
  return created;
}
function selectedTune(): DisplayTune | null {
  const d = selected();
  return d === null ? null : tuneOf(d.name);
}

function refreshDisplays(): void {
  const list = M.displays();
  setDisplays(list);
  let stillThere = false;
  for (const d of list) if (d.id === selectedId()) stillThere = true;
  if (stillThere || list.length === 0) return;
  let first = list[0];
  for (const d of list) if (d.main) first = d;
  selectDisplay(first.id);
}

let loadedDisplay = -1;
let ddcLoad = 0;

export function selectDisplay(id: number): void {
  setSelectedId(id);
  const d = selected();
  if (d === null) return;
  setModes(M.modes(id));
  const tune = tuneOf(d.name);
  setWarmthValue(tune.warmth);
  setBoostValue(tune.boost);
  setBoostLimit(M.boostMax(id));

  const native = M.nativeBrightness(id);
  if (native >= 0) {
    setBrightnessSource('native');
    setBrightnessValue(native);
  }
  if (id !== loadedDisplay) {
    loadedDisplay = id;
    setHasDdc(false);
    if (native < 0) { setBrightnessSource('software'); setBrightnessValue(tune.dim); }
  }
  loadDdc(id, native >= 0, tune.dim);
}

/** A monitor can take seconds to answer, or never does: the panel opens first and its DDC controls join it. */
async function loadDdc(id: number, hasNative: boolean, softwareDim: number): Promise<void> {
  const load = ++ddcLoad;
  const current = (): boolean => load === ddcLoad && id === selectedId();
  if (hasNative) { setHasDdc(false); return; }
  const ddcBrightness = await M.ddcRead(id, M.DDC_BRIGHTNESS);
  if (!current()) return;
  setHasDdc(ddcBrightness !== null);
  if (ddcBrightness === null || ddcBrightness.maximum <= 0) {
    setBrightnessSource('software');
    setBrightnessValue(softwareDim);
    return;
  }
  ddcMaxBrightness = ddcBrightness.maximum;
  setBrightnessSource('ddc');
  setBrightnessValue(ddcBrightness.current / ddcBrightness.maximum);
  const contrastValue = await M.ddcRead(id, M.DDC_CONTRAST);
  if (!current()) return;
  if (contrastValue !== null && contrastValue.maximum > 0) { ddcMaxContrast = contrastValue.maximum; setContrastValue(contrastValue.current / contrastValue.maximum); }
  const volumeValue = await M.ddcRead(id, M.DDC_VOLUME);
  if (!current()) return;
  if (volumeValue !== null && volumeValue.maximum > 0) { ddcMaxVolume = volumeValue.maximum; setVolumeValue(volumeValue.current / volumeValue.maximum); }
  const mute = await M.ddcRead(id, M.DDC_MUTE);
  if (!current()) return;
  setMutedValue(mute !== null && mute.current === 1);
  const inputValue = await M.ddcRead(id, M.DDC_INPUT);
  if (!current()) return;
  setInputValue(inputValue === null ? 0 : inputValue.current & 0xFF);
}

function applyGamma(id: number, tune: DisplayTune): void { report(M.setGamma(id, tune.dim, tune.warmth)); }

export function setBrightness(value: number): void {
  setBrightnessValue(value);
  const id = selectedId(), source = brightnessSource();
  if (source === 'native') { report(M.setNativeBrightness(id, value)); return; }
  if (source === 'ddc') { report(M.ddcWrite(id, M.DDC_BRIGHTNESS, value * ddcMaxBrightness)); return; }
  const tune = selectedTune();
  if (tune === null) return;
  tune.dim = Math.max(0.1, value);   // never fully black: the slider must stay visible
  applyGamma(id, tune);
  saveConfig(config);
}
/** The keyboard shortcuts' step, on the selected display. */
export function nudgeBrightness(delta: number): void { setBrightness(Math.max(0, Math.min(1, brightness() + delta))); }

export function setWarmth(value: number): void {
  setWarmthValue(value);
  const tune = selectedTune();
  if (tune === null) return;
  tune.warmth = value;
  applyGamma(selectedId(), tune);
  saveConfig(config);
}
export function setBoost(level: number): void {
  setBoostValue(level);
  const tune = selectedTune();
  if (tune === null) return;
  tune.boost = level;
  report(M.setBoost(selectedId(), level));
  saveConfig(config);
}
export function setContrast(value: number): void { setContrastValue(value); report(M.ddcWrite(selectedId(), M.DDC_CONTRAST, value * ddcMaxContrast)); }
export function setVolume(value: number): void { setVolumeValue(value); report(M.ddcWrite(selectedId(), M.DDC_VOLUME, value * ddcMaxVolume)); }
export function setMuted(on: boolean): void { setMutedValue(on); report(M.ddcWrite(selectedId(), M.DDC_MUTE, on ? 1 : 2)); }
export function setInput(code: number): void { setInputValue(code); report(M.ddcWrite(selectedId(), M.DDC_INPUT, code)); }

/** A wrong mode can leave a screen black with nothing to click: like the old System Settings, it goes back by itself unless it is kept. */
export function chooseMode(modeId: number): void {
  const d = selected();
  if (d === null || d.modeId === modeId) return;
  const previous = revertTimer >= 0 ? revertMode : d.modeId;
  if (!report(M.setMode(d.id, modeId))) return;
  refreshDisplays();
  revertDisplay = d.id;
  revertMode = previous;
  setRevertLeft(REVERT_SECONDS);
  if (revertTimer >= 0) clearInterval(revertTimer);
  revertTimer = setInterval(() => {
    setRevertLeft(revertLeft() - 1);
    if (revertLeft() <= 0) revertMode_();
  }, 1000);
}
function stopRevertTimer(): void {
  clearInterval(revertTimer);
  revertTimer = -1;
  setRevertLeft(0);
}
export function keepMode(): void { stopRevertTimer(); }
function revertMode_(): void {
  stopRevertTimer();
  report(M.setMode(revertDisplay, revertMode));
  refreshDisplays();
}
export function revertModeNow(): void { revertMode_(); }

function afterChange(ok: boolean): void { if (report(ok)) refreshDisplays(); }
export function makeMain(id: number): void { afterChange(M.setMain(id)); }
export function moveDisplay(id: number, x: number, y: number): void { afterChange(M.setOrigin(id, Math.round(x), Math.round(y))); }
export function mirrorDisplay(id: number, masterId: number): void { afterChange(M.setMirror(id, masterId)); }
export function rotateDisplay(id: number, degrees: number): void { afterChange(M.setRotation(id, degrees)); }
export function connectDisplay(id: number, on: boolean): void { afterChange(M.setConnected(id, on)); }

function startVirtual(spec: VirtualSpec): number {
  const id = M.createVirtual(spec.name, spec.width, spec.height, spec.refresh, spec.hidpi);
  if (id === 0) { setNotice(M.lastError()); return 0; }
  setVirtualIds(virtualIds().concat([id]));
  return id;
}
export function addVirtual(spec: VirtualSpec): void {
  if (startVirtual(spec) === 0) return;
  config.virtuals.push(spec);
  saveConfig(config);
  refreshDisplays();
}
export function removeVirtual(id: number): void {
  const d = displays().filter((o: M.Display) => o.id === id);
  if (!report(M.destroyVirtual(id))) return;
  setVirtualIds(virtualIds().filter((o: number) => o !== id));
  if (d.length > 0) config.virtuals = config.virtuals.filter((v: VirtualSpec) => v.name !== d[0].name);
  saveConfig(config);
  refreshDisplays();
}
/** Crisp text on a monitor macOS gives no HiDPI modes to: the monitor mirrors a virtual display drawn at twice its pixels. */
export function sharpenDisplay(d: M.Display): void {
  const spec: VirtualSpec = { name: d.name + ' HiDPI', width: d.width, height: d.height, refresh: d.refresh > 0 ? d.refresh : 60, hidpi: true };
  const id = startVirtual(spec);
  if (id === 0) return;
  config.virtuals.push(spec);
  saveConfig(config);
  afterChange(M.setMirror(d.id, id));
}

/** Whether this monitor currently shows a virtual display made sharp for it (sharpenDisplay). */
export function sharpSourceOf(d: M.Display): number {
  for (const other of displays()) if (other.id === d.mirrorOf && other.virtual) return other.id;
  return 0;
}
export function stopSharpening(d: M.Display): void {
  const source = sharpSourceOf(d);
  if (source === 0) return;
  report(M.setMirror(d.id, 0));
  removeVirtual(source);
}

/** Puts back what lasts only as long as a process, then starts watching the system's changes. */
export function startMonitoring(): void {
  config = loadConfig();
  for (const spec of config.virtuals) startVirtual(spec);
  refreshDisplays();
  for (const d of displays()) {
    const tune = tuneOf(d.name);
    if (tune.dim < 1 || tune.warmth > 0) applyGamma(d.id, tune);
    if (tune.boost > 1) report(M.setBoost(d.id, tune.boost));
  }
  seenRevision = M.revision();
  setInterval(() => {
    const now = M.revision();
    if (now === seenRevision) return;
    seenRevision = now;
    refreshDisplays();
  }, REVISION_POLL_MS);
}
