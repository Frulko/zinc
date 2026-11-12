// Images belong to the viewers that acquired them, across reloads and iPod changes.
import * as ipod from 'zinc:ipod';
import { destroyImage } from 'zinc:gfx';
import { coverImage, coverPng, coverSession, onArtworkChanged } from './ipod';

enum LoadState { Cold, Loading, Ready, Failed, Closed }
class Cover {
  state = LoadState.Cold;
  image: i32 = -1;
  error: string = '';
  generation: i32 = 0;
  viewers = new Map<i32, (img: i32) => void>();
  unsubscribe: () => void = () => {};
  constructor(public size: i32, public load: (size: i32) => Promise<i32>) {}
}
const covers = new Map<string, Cover>();
let nextViewer: i32 = 0;

function transition(c: Cover, next: LoadState): void {
  const from = c.state;
  if (from === LoadState.Closed || (next === LoadState.Loading && from !== LoadState.Cold)
      || ((next === LoadState.Ready || next === LoadState.Failed) && from !== LoadState.Loading)) {
    throw new Error('Invalid cover load transition');
  }
  c.state = next;
}

function showViewers(c: Cover, image: i32, generation: i32, closing: boolean = false): void {
  const ids: i32[] = [];
  for (const id of c.viewers.keys()) ids.push(id);
  for (const id of ids) {
    if (c.generation !== generation || (!closing && c.state === LoadState.Closed)) return;
    const show = c.viewers.get(id);
    if (show !== undefined) {
      try { show(image); } catch (e) { console.error(`cover viewer: ${(e as Error).message}`); }
    }
  }
}

async function read(c: Cover): Promise<void> {
  transition(c, LoadState.Loading);
  const generation = ++c.generation;
  let img: i32 = -1, failure = '';
  try { img = await c.load(c.size); } catch (e) { failure = (e as Error).message || 'Cannot read cover'; console.error(`cover read: ${failure}`); }
  if (c.state === LoadState.Closed || c.generation !== generation) {
    if (img >= 0) destroyImage(img);
    return;
  }
  c.image = img;
  c.error = failure;
  transition(c, failure === '' ? LoadState.Ready : LoadState.Failed);
  showViewers(c, img, generation);
}

function reload(c: Cover): void {
  if (c.state === LoadState.Closed) return;
  const old = c.image;
  c.image = -1;
  c.error = '';
  const generation = ++c.generation;
  transition(c, LoadState.Cold);
  showViewers(c, -1, generation);
  if (old >= 0) destroyImage(old);
  if (c.state === LoadState.Cold && c.generation === generation) read(c);
}

function close(c: Cover): void {
  if (c.state === LoadState.Closed) return;
  const old = c.image;
  c.image = -1;
  const generation = ++c.generation;
  transition(c, LoadState.Closed);
  c.unsubscribe();
  showViewers(c, -1, generation, true);
  c.viewers.clear();
  if (old >= 0) destroyImage(old);
}

/** Shows an album/track cover, including later artwork changes. Release this exact acquisition with the returned disposer. */
export function useCover(key: string, trackId: string, size: i32, show: (img: i32) => void): () => void {
  return useImage(key, size, (s: i32) => coverImage(trackId, s), show, trackId);
}

/** Shows a photo while its acquisition is alive. */
export function usePhoto(id: string, size: i32, show: (img: i32) => void): () => void {
  return useImage(`photo:${id}`, size, (s: i32) => ipod.photoImage(id, s), show, '');
}

function useImage(key: string, size: i32, load: (size: i32) => Promise<i32>, show: (img: i32) => void, trackId: string): () => void {
  const session = coverSession();
  const k = `${session}:${size}:${trackId}:${key}`;
  let c = covers.get(k);
  if (c === undefined) {
    c = new Cover(size, load);
    covers.set(k, c);
    const made = c;
    if (trackId !== '') made.unsubscribe = onArtworkChanged((ids: string[]) => { if (coverSession() === session && ids.indexOf(trackId) >= 0) reload(made); });
  }
  const have = c as Cover, viewer = ++nextViewer;
  have.viewers.set(viewer, show);
  if (have.state === LoadState.Cold) read(have);
  else if (have.state === LoadState.Ready || have.state === LoadState.Failed) {
    try { show(have.image); } catch (e) { console.error(`cover viewer: ${(e as Error).message}`); }
  }
  return (): void => {
    if (!have.viewers.delete(viewer) || have.viewers.size > 0) return;
    if (covers.get(k) === have) covers.delete(k);
    close(have);
  };
}

/** Closes every acquisition when the iPod closes; stale disposers cannot touch replacements. */
export function dropCovers(): void {
  const old: Cover[] = [];
  covers.forEach((c: Cover, k: string) => { old.push(c); });
  covers.clear();
  for (const c of old) close(c);
}

/** Prefetch belongs to the iPod captured before its first asynchronous read. */
export async function prefetchCovers(ids: string[], still: () => boolean): Promise<void> {
  const session = coverSession();
  for (const id of ids) {
    if (!still() || coverSession() !== session) return;
    try { await coverPng(id); } catch (e) { /* shown as none when its turn comes */ }
  }
}
