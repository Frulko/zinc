// The editor's state and its actions: what the mapper said, what is selected. A change bumps `revision`, the views read through it.
import { createSignal } from 'zinc:ui/solid';
import { Mask, TemplateLayer } from './model/templates';
import * as storage from 'zinc:storage';
import { Clip, Column, EMPTY_CLIP, clipFrom, ensureColumns, firstFreeColumn, isEmptyClip } from './model/clips';
import { Lens, Link } from './model/room';
import { Placement } from './model/geometry';
import { EDGE_OUTSIDE, SETTLE_MS } from './constants';
import { deleteJson, getJson, getText, postJson, putJson, send, sendFile } from './services/link';
import { mediaName, saveText } from './services/files';

// `revision`: what the panels list changed, they are built again. `pointRevision`: a point moved, only its readout follows (the canvases redraw at each frame).
export const [revision, setRevision] = createSignal(0);
export function touch(): void { setRevision(revision() + 1); }
export const [pointRevision, setPointRevision] = createSignal(0);
export function touchPoint(): void { setPointRevision(pointRevision() + 1); }

// The room's sizes changed: only the 3D view follows, the fields being typed in stay.
export const [roomRevision, setRoomRevision] = createSignal(0);
export function touchRoom(): void { setRoomRevision(roomRevision() + 1); }

export const [status, setStatus] = createSignal('connecting');
export const [connected, setConnected] = createSignal(false);

export interface MediaFile { name: string; bytes: number }

/** The actions the mapper remembers, oldest first; `at`: the one the setup is at. */
export interface HistoryList { entries: string[]; at: i32 }

/** This editor's preferences: they stay in the browser or the client, not in a scene. */
export interface Options { selectionFrame: boolean; focusRing: boolean; fineStep: number; coarseStep: number; panels: number[] }
export const PANEL_LIBRARY: i32 = 0, PANEL_PROPERTIES: i32 = 1, PANEL_GRID: i32 = 2;   // panels: their sizes in pixels
const OPTIONS_KEY = 'mapper-options';

function savedOptions(): Options {
  const defaults: Options = { selectionFrame: true, focusRing: false, fineStep: 1, coarseStep: 10, panels: [248, 300, 190] };
  if (!storage.keys().includes(OPTIONS_KEY)) return defaults;
  try {
    const saved = JSON.parse(storage.get(OPTIONS_KEY));
    if (saved.panels === undefined) saved.panels = defaults.panels;   // saved before panels could be resized
    return saved as Options;
  } catch (e) {
    return defaults;
  }
}

export const store = {
  aspect: 16 / 9,
  pixels: [1280, 720],
  layers: [] as any[],
  selected: -1 as i32,
  media: [] as MediaFile[],
  columns: [] as Column[],
  activeColumn: -1 as i32,
  surfaces: {} as any,
  lens: { throwRatio: 1.4, shiftY: 0 } as Lens,
  links: [] as Link[],
  playing: [] as i32[],      // per layer, the column of what plays; -1: nothing
  armed: EMPTY_CLIP as Clip,  // what a click on a cell puts there
  clipColumn: -1 as i32,      // the clip the inspector shows, with `clipLayer`
  clipLayer: -1 as i32,
  hudShown: true,
  card: 'off',
  masterVolume: 1,
  muted: false,
  playsMedia: false,
  scenes: [] as string[],
  history: { entries: [], at: 0 } as HistoryList,
  sceneName: '',
  options: savedOptions(),
};

export function currentLayer(): any { return store.selected >= 0 && store.selected < store.layers.length ? store.layers[store.selected] : null; }

export function numbers(layer: any, key: string): number[] { return layer[key] as number[]; }
export function word(layer: any, key: string): string { return (layer[key] as string[])[0]; }

export function placementOf(layer: any): Placement {
  return { corners: numbers(layer, 'corners'), position: numbers(layer, 'position'), scale: numbers(layer, 'scale')[0], rotation: numbers(layer, 'rotation')[0], mesh: numbers(layer, 'mesh') };
}

/** The real size entered for a layer's surface, [0, 0] when none. */
export function surfaceOf(layer: any): number[] {
  const known = store.surfaces[word(layer, 'name')];
  return known === undefined || known === null ? [0, 0] : known as number[];
}

export const MASK_SLOTS: i32[] = [0, 1, 2, 3];

export function maskValues(layer: any, slot: i32): number[] {
  const values = layer[`mask/${slot}`];
  return values === undefined || values === null ? [] : values as number[];
}

export function templateOf(layer: any): TemplateLayer {
  const masks: Mask[] = [];
  for (const slot of MASK_SLOTS) {
    const values = maskValues(layer, slot);
    if (values.length >= 8) masks.push({ feather: values[0], hideInside: values[1] > 0, points: values.slice(2) });
  }
  const direction = numbers(layer, 'edgedir');
  const edge = numbers(layer, 'edge').map((width: number, side: i32): number => side < 4 && direction[side] === EDGE_OUTSIDE ? 0 : width);   // a fade outside is not in the media's square
  return { name: word(layer, 'name'), placement: placementOf(layer), edge, masks };
}

/** Sets a property of the selected layer, here and on the mapper. */
export function setLayer(key: string, values: number[]): void {
  const layer = currentLayer();
  if (layer === null) return;
  layer[key] = values;
  send(`/layer/${store.selected}/${key}`, values);
}

/** The same without building the panels again: for a field being typed in. */
export function setWordQuietly(key: string, value: string): void {
  const layer = currentLayer();
  if (layer === null) return;
  layer[key] = [value];
  send(`/layer/${store.selected}/${key}`, [], [value]);
}

export function setWord(key: string, value: string): void {
  const layer = currentLayer();
  if (layer === null) return;
  layer[key] = [value];
  send(`/layer/${store.selected}/${key}`, [], [value]);
  touch();
}

export function selectLayer(index: i32): void {
  store.selected = index;
  showSelection();
  touch();
}

/** The frame the projector draws around the selected layer; off leaves the picture clean while the points move. */
export function showSelection(): void {
  send('/select', [store.options.selectionFrame ? store.selected : -1]);
}

const [panelSizes, setPanelSizes] = createSignal<number[]>(store.options.panels);
export function panelSize(panel: i32): number { return panelSizes()[panel]; }
export function resizePanel(panel: i32, pixels: number): void {
  const sizes = panelSizes().slice();
  sizes[panel] = pixels;
  setPanelSizes(sizes);
  setOptions((options: Options) => { options.panels = sizes; });
}

export function setOptions(change: (options: Options) => void): void {
  change(store.options);
  storage.set(OPTIONS_KEY, JSON.stringify(store.options));
}

export async function loadState(): Promise<void> {
  await new Promise<void>((resolve: () => void) => { setTimeout(resolve, SETTLE_MS); });
  try {
    const state = await getJson('/state');
    store.aspect = state.aspect as number;
    if ((state.pixels as number[])[0] > 0) store.pixels = state.pixels as number[];
    store.layers = state.layers as any[];
    store.hudShown = state.hud as boolean;
    store.card = state.card as string;
    store.masterVolume = state.volume as number;
    store.muted = state.muted as boolean;
    store.playsMedia = state.playsMedia as boolean;
    store.selected = Math.min(store.selected, store.layers.length - 1) as i32;
    if (store.selected < 0 && store.layers.length > 0) store.selected = 0;
    setStatus(`${store.layers.length} layers, ${store.pixels[0]} x ${store.pixels[1]} pixels`);
    setConnected(true);
    touch();
  } catch (e) {
    setStatus(`${e}`);
    setConnected(false);
  }
}

export async function loadMedia(): Promise<void> {
  store.media = await getJson('/media') as MediaFile[];
  touch();
}

export async function loadShow(): Promise<void> {
  const show = await getJson('/show');
  const columns: Column[] = (show.columns as any[]).map((column: any): Column => ({ name: column.name as string, cells: (column.cells as any[]).map(clipFrom) }));
  store.columns = ensureColumns(columns);
  store.playing = Array.isArray(show.playing) ? show.playing as i32[] : [];
  store.activeColumn = show.active as i32;
  if (show.surfaces !== undefined) store.surfaces = show.surfaces;
  if (show.lens !== undefined) store.lens = show.lens as Lens;
  store.links = show.links !== undefined ? show.links as Link[] : [];
  store.sceneName = typeof show.scene === 'string' ? show.scene as string : '';
  touch();
}

async function putShow(json: string): Promise<void> {
  try {
    await putJson('/show', json);
  } catch (e) {
    setStatus('the mapper does not answer: the columns are not saved');
  }
}

export function saveShow(): void {
  putShow(JSON.stringify({ columns: store.columns, active: store.activeColumn, surfaces: store.surfaces, lens: store.lens, links: store.links, scene: store.sceneName }));
}

export function clipAt(column: i32, layer: i32): Clip {
  const cells = store.columns[column].cells;
  while (cells.length <= layer) cells.push({ ...EMPTY_CLIP });
  return cells[layer];
}

/** The clip the inspector shows; empty when none. */
export function selectedClip(): Clip {
  return store.clipColumn < 0 || store.clipColumn >= store.columns.length ? EMPTY_CLIP : clipAt(store.clipColumn, store.clipLayer);
}

export function isPlaying(column: i32, layer: i32): boolean { return layer < store.playing.length && store.playing[layer] === column; }

function markPlaying(layer: i32, column: i32): void {
  while (store.playing.length <= layer) store.playing.push(-1);
  store.playing[layer] = column;
}

export function fireColumn(index: i32): void {
  store.activeColumn = index;
  for (let layer: i32 = 0; layer < store.layers.length; layer++) markPlaying(layer, isEmptyClip(clipAt(index, layer)) ? -1 : index);
  send('/column', [index]);
  touch();
}

export function fireCell(column: i32, layer: i32): void {
  markPlaying(layer, column);
  store.clipColumn = column;
  store.clipLayer = layer;
  store.selected = layer;
  showSelection();
  send('/cell', [column, layer]);
  touch();
}

export function stopLayer(layer: i32): void {
  markPlaying(layer, -1);
  if (!store.playing.includes(store.activeColumn)) store.activeColumn = -1;   // the last clip of the column on
  send(`/stop`, [layer]);
  touch();
}

export function stopAll(): void {
  store.playing = [];
  store.activeColumn = -1;
  store.clipColumn = -1;
  send('/stop', []);
  touch();
}

/** Puts a clip in a cell, in place of what was there; the grid keeps a free column at its end. */
export function placeClip(column: i32, layer: i32, clip: Clip): void {
  clipAt(column, layer);
  store.columns[column].cells[layer] = { ...clip };
  store.columns = ensureColumns(store.columns);
  store.clipColumn = column;
  store.clipLayer = layer;
  saveShow();
  touch();
}

export function removeClip(column: i32, layer: i32): void {
  if (isPlaying(column, layer)) stopLayer(layer);
  placeClip(column, layer, EMPTY_CLIP);
  store.clipColumn = -1;
  touch();
}

export function removeChosenClip(): void {
  if (!isEmptyClip(selectedClip())) removeClip(store.clipColumn, store.clipLayer);
}

/** A dragged clip changes cell; what was there goes to where it came from. */
export function swapClips(fromColumn: i32, fromLayer: i32, toColumn: i32, toLayer: i32): void {
  const moved = clipAt(fromColumn, fromLayer), there = clipAt(toColumn, toLayer);
  store.columns[fromColumn].cells[fromLayer] = there;
  store.columns[toColumn].cells[toLayer] = moved;
  store.clipColumn = toColumn;
  store.clipLayer = toLayer;
  saveShow();
  touch();
}

/** A change to the selected clip; if it plays, its layer follows at once. */
export function changeClip(change: (clip: Clip) => void): void {
  const clip = selectedClip();
  if (isEmptyClip(clip)) return;
  change(clip);
  if (isPlaying(store.clipColumn, store.clipLayer)) {
    send(`/layer/${store.clipLayer}/fit`, [], [clip.fit]);
    send(`/layer/${store.clipLayer}/frame`, clip.frame);
    send(`/layer/${store.clipLayer}/loop`, [clip.loop ? 1 : 0]);
  }
  saveShow();
  touch();
}

/** A layer changed place or left: the mapper moves its clips with it. */
export async function afterLayerChange(): Promise<void> {
  await loadState();
  await loadShow();
}

export function showCalibrationCard(kind: string, target: i32): void {
  store.card = kind;
  send('/card', [target], [kind]);
  touch();
}

export async function loadHistory(): Promise<void> {
  const list = await getJson('/history') as HistoryList;
  if (JSON.stringify(list) === JSON.stringify(store.history)) return;
  store.history = list;
  touch();
}

/** step: "undo", "redo" or the place of an entry. */
export async function stepHistory(step: string): Promise<void> {
  await new Promise<void>((resolve: () => void) => { setTimeout(resolve, SETTLE_MS); });   // the commands on their way are part of what goes back
  try {
    store.history = await postJson(`/history/${step}`) as HistoryList;
    await afterLayerChange();
  } catch (e) {
    setStatus(step === 'undo' ? 'nothing to undo' : step === 'redo' ? 'nothing to redo' : `${e}`);
  }
}

export async function loadScenes(): Promise<void> {
  store.scenes = await getJson('/scenes') as string[];
  touch();
}

async function afterSceneChange(list: any, name: string, done: string): Promise<void> {
  store.scenes = list as string[];
  store.selected = -1;
  await loadState();
  await loadShow();
  store.sceneName = name;
  saveShow();
  setStatus(done);
}

export async function saveSceneAs(name: string): Promise<void> {
  store.sceneName = name;
  saveShow();
  await new Promise<void>((resolve: () => void) => { setTimeout(resolve, SETTLE_MS); });
  store.scenes = await postJson(`/scenes/${name}`) as string[];
  setStatus(`scene ${name} saved`);
  touch();
}

export async function loadSceneNamed(name: string): Promise<void> {
  await afterSceneChange(await postJson(`/scenes/${name}/load`), name, `scene ${name} is on`);
}

export async function startNewScene(): Promise<void> {
  await afterSceneChange(await postJson('/new-scene'), '', 'a new empty scene');
}

export async function removeScene(name: string): Promise<void> {
  store.scenes = await deleteJson(`/scenes/${name}`) as string[];
  touch();
}

export async function exportScene(name: string): Promise<void> {
  await saveText(`${name}.mapper.json`, await getText(`/scenes/${name}`));
}

export async function importScene(path: string): Promise<void> {
  const name = mediaName(path).replace(/\.mapper\.json$|\.json$/, '').replace(/[^A-Za-z0-9_-]/g, '-');
  try {
    store.scenes = await sendFile(`/scenes/${name}`, path, (part: number) => {}) as string[];
    setStatus(`scene ${name} arrived`);
  } catch (e) {
    setStatus(`${name} is not a scene: ${e}`);
  }
  touch();
}

/** A media that just arrived: a clip of the selected layer, playing at once. */
export async function placeClipAndPlay(clip: Clip): Promise<void> {
  const layer = store.selected;
  const column = firstFreeColumn(store.columns, layer);
  if (isPlaying(column, layer)) stopLayer(layer);
  if (column >= store.columns.length) store.columns = ensureColumns(store.columns);
  placeClip(column, layer, clip);
  await new Promise<void>((resolve: () => void) => { setTimeout(resolve, SETTLE_MS); });   // the show has the clip before it fires
  fireCell(column, layer);
}

export async function removeMedia(name: string): Promise<void> {
  store.media = await deleteJson(`/media/${name}`) as MediaFile[];
  for (let c: i32 = 0; c < store.columns.length; c++) {
    const cells = store.columns[c].cells;
    for (let l: i32 = 0; l < cells.length; l++) {
      if (cells[l].media !== name) continue;
      if (isPlaying(c, l)) stopLayer(l);
      cells[l] = { ...EMPTY_CLIP };
    }
  }
  if (store.armed.media === name) store.armed = EMPTY_CLIP;
  saveShow();
  touch();
}
