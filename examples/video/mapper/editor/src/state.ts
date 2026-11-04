// The editor's state and its actions: what the mapper said, what is selected. A change bumps `revision`, the views read through it.
import { createSignal } from 'zinc:ui/solid';
import { Mask, TemplateLayer } from './model/templates';
import { Lens } from './model/room';
import { Placement } from './model/geometry';
import { SETTLE_MS } from './constants';
import { deleteJson, getJson, putJson, send, sendFile } from './services/link';
import { mediaName } from './services/files';

// `revision`: what the panels list changed, they are built again. `pointRevision`: a point moved, only its readout follows (the canvases redraw at each frame).
export const [revision, setRevision] = createSignal(0);
export function touch(): void { setRevision(revision() + 1); }
export const [pointRevision, setPointRevision] = createSignal(0);
export function touchPoint(): void { setPointRevision(pointRevision() + 1); }

export const [status, setStatus] = createSignal('connecting');
export const [connected, setConnected] = createSignal(false);

export interface MediaFile { name: string; bytes: number }
export interface Cell { media: string; fit: string; volume: number }
export interface Column { name: string; cells: Cell[] }

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
  armedMedia: '',      // the media a click on a cell puts there
  hudShown: true,
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
  send('/select', [index]);
  touch();
}

export async function loadState(): Promise<void> {
  await new Promise<void>((resolve: () => void) => { setTimeout(resolve, SETTLE_MS); });
  try {
    const state = await getJson('/state');
    store.aspect = state.aspect as number;
    if ((state.pixels as number[])[0] > 0) store.pixels = state.pixels as number[];
    store.layers = state.layers as any[];
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
  putShow(JSON.stringify({ columns: store.columns, active: store.activeColumn, surfaces: store.surfaces, lens: store.lens }));
}

export function fireColumn(index: i32): void {
  store.activeColumn = index;
  send('/column', [index]);
  touch();
}

export function playOnLayer(name: string): void { setWord('media', name); }

/** Sends files to the mapper; the last one plays on the selected layer at once. */
export async function sendMedia(paths: string[]): Promise<void> {
  let last = '';
  for (const path of paths) {
    const name = mediaName(path);
    try {
      const list = await sendFile(name, path, (part: number) => { setStatus(`sending ${name}: ${Math.round(part * 100)}%`); });
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
