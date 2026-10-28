// Album covers read from the iPod (ipod.cover: a runtime image), cached by album and size while something shows them. A cover
// is read when its first viewer asks for it and freed (destroyImage) when its last viewer is dropped, so a grid of 2,000 albums
// holds only the covers of the rows on screen.
import * as ipod from 'zinc:ipod';
import { destroyImage } from 'zinc:gfx';

class Cover {
  image: i32 = -1;
  users: i32 = 0;
  waiting: ((img: i32) => void)[] = [];
  loaded: boolean = false;
  size: i32;
  constructor(size: i32) { this.size = size; }
}
const covers = new Map<string, Cover>();

async function read(c: Cover, trackId: string): Promise<void> {
  let img: i32 = -1;
  try { img = await ipod.cover(trackId, c.size); } catch (e) { img = -1; }   // an unreadable cover shows as none
  c.loaded = true;
  if (c.users === 0) { if (img >= 0) destroyImage(img); return; }   // dropped while it was read
  c.image = img;
  for (const f of c.waiting) f(img);
  c.waiting = [];
}

/** Calls `show` with the cover of the album `key` (read from the track `trackId` at about `size` px), now when it is cached,
 *  else once read; -1 when it has none. Pair each call with `releaseCover(key, size)`. */
export function useCover(key: string, trackId: string, size: i32, show: (img: i32) => void): void {
  const k = `${size}:${key}`;
  let c = covers.get(k);
  if (c === undefined) {
    const made = new Cover(size);
    covers.set(k, made);
    made.waiting.push(show);
    made.users = 1;
    read(made, trackId);
    return;
  }
  const have = c as Cover;
  have.users++;
  if (have.loaded) show(have.image);
  else have.waiting.push(show);
}

export function releaseCover(key: string, size: i32): void {
  const k = `${size}:${key}`;
  const c = covers.get(k);
  if (c === undefined) return;
  const have = c as Cover;
  have.users--;
  if (have.users > 0) return;
  if (have.image >= 0) destroyImage(have.image);
  covers.delete(k);
}

/** Frees every cover (the iPod was closed or another one opened). */
export function dropCovers(): void {
  covers.forEach((c: Cover, k: string) => { c.users = 0; if (c.image >= 0) destroyImage(c.image); });
  covers.clear();
}
