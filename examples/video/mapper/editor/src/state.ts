// The editor's state and its actions: what the mapper said, what is selected. A change bumps `revision`, the views read through it.
import { createSignal } from 'zinc:ui/solid';
import { Mask, TemplateLayer } from './model/templates';
import * as storage from 'zinc:storage';
import { Lens, Link } from './model/room';
import { Placement } from './model/geometry';
import { SETTLE_MS } from './constants';
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
export interface Cell { media: string; fit: string }
export interface Column { name: string; cells: Cell[] }

/** This editor's preferences: they stay in the browser or the client, not in a scene. */
export interface Options { selectionFrame: boolean; focusRing: boolean; fineStep: number; coarseStep: number }
const OPTIONS_KEY = 'mapper-options';

function savedOptions(): Options {
  const defaults: Options = { selectionFrame: true, focusRing: false, fineStep: 1, coarseStep: 10 };
  if (!storage.keys().includes(OPTIONS_KEY)) return defaults;
  try {
    return JSON.parse(storage.get(OPTIONS_KEY)) as Options;
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
  armedMedia: '',      // the media a click on a cell puts there
  hudShown: true,
  card: 'off',
  masterVolume: 1,
  muted: false,
  playsMedia: false,
  scenes: [] as string[],
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
  return { name: word(layer, 'name'), placement: placementOf(layer), edge: numbers(layer, 'edge'), masks };
}

/** Sets a property of the selected layer, here and on the mapper. */
export function setLayer(key: string, values: number[]): void {
  const layer = currentLayer();
  if (layer === null) return;
  layer[key] = values;
  send(`/layer/${store.selected}/${key}`, values);
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
  store.columns = show.columns as Column[];
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

export function fireColumn(index: i32): void {
  store.activeColumn = index;
  send('/column', [index]);
  touch();
}

export function showCalibrationCard(kind: string, target: i32): void {
  store.card = kind;
  send('/card', [target], [kind]);
  touch();
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

export function playOnLayer(name: string): void { setWord('media', name); }

/** Sends files to the mapper; the last one plays on the selected layer at once. */
export async function sendMedia(paths: string[]): Promise<void> {
  let last = '';
  for (const path of paths) {
    const name = mediaName(path);
    try {
      const list = await sendFile(`/media/${name}`, path, (part: number) => { setStatus(`sending ${name}: ${Math.round(part * 100)}%`); });
      store.media = list as MediaFile[];
      last = name;
      setStatus(`${name} is on the mapper`);
    } catch (e) {
      setStatus(`${name} did not arrive: ${e}`);
    }
  }
  if (last === '') return;
  setWord('media', '');   // the same name again: the layer reopens the new file
  setWord('media', last);
}

export async function removeMedia(name: string): Promise<void> {
  store.media = await deleteJson(`/media/${name}`) as MediaFile[];
  touch();
}
