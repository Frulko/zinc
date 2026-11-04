// Decoded UI images: the original encoded files belong on disk, not in another RAM cache.
import { destroyImage, imageWidth, imageHeight } from 'zinc:gfx';
import { referencedImages } from './ui';

const reserved = new Map<i32, i32>();
/** Reserves a cached image kept outside UI nodes (for example, a viewer's next thumbnail). Balance with releaseCachedImage. */
export function retainCachedImage(image: i32): void {
  if (image >= 0) reserved.set(image, (reserved.get(image) ?? 0) + 1);
}
export function releaseCachedImage(image: i32): void {
  const n = reserved.get(image) ?? 0;
  if (n <= 1) reserved.delete(image); else reserved.set(image, n - 1);
}
interface Entry { image: i32; bytes: number; used: number; ready: number }
/** Owns immutable decoded images. get() returns a borrowed handle: assign it to a UI node synchronously, or reserve it while held elsewhere.
 * Only unreferenced entries are evicted; the live working set may exceed the budget. Mutable surfaces and animation frames stay caller-owned.
 * Call trim after loading/navigation and on background; no timer or disk cache is created by this class. */
export class ImageCache {
  private entries = new Map<string, Entry>();
  private clock = 0;
  bytes = 0;
  constructor(public maxBytes: number, public maxEntries: i32 = 512) {}
  get size(): i32 { return this.entries.size; }
  get(key: string): i32 {
    const e = this.entries.get(key);
    if (e === undefined) return -1;
    e.used = ++this.clock;
    return e.image;
  }
  /** Transfers ownership. A duplicate keeps the existing image and destroys the supplied copy. Does not evict before a consumer can mount. */
  put(key: string, image: i32): i32 {
    if (image < 0) return -1;
    const old = this.entries.get(key);
    if (old !== undefined) { if (old.image !== image) destroyImage(image); return this.get(key); }
    const bytes = imageWidth(image) * imageHeight(image) * 4;
    this.entries.set(key, { image: image, bytes: bytes, used: ++this.clock, ready: Date.now() + 250 });
    this.bytes += bytes;
    return image;
  }
  /** Drops the coldest unreferenced images until both limits fit. targetBytes=0 clears unused entries, including newly arrived ones. */
  trim(targetBytes: number = -1): void {
    const target = targetBytes < 0 ? this.maxBytes : Math.max(0, targetBytes);
    if (this.bytes <= target && this.size <= this.maxEntries) return;
    const live = referencedImages(), now = Date.now();
    const cold: string[] = [];
    for (const k of this.entries.keys()) {
      const e = this.entries.get(k) as Entry;
      if (!live.has(e.image) && !reserved.has(e.image) && (target === 0 || now >= e.ready)) cold.push(k);
    }
    cold.sort((a: string, b: string): number => (this.entries.get(a) as Entry).used - (this.entries.get(b) as Entry).used);
    for (const key of cold) {
      if (this.bytes <= target && this.size <= this.maxEntries) break;
      const e = this.entries.get(key) as Entry;
      this.entries.delete(key); this.bytes -= e.bytes; destroyImage(e.image);
    }
  }
}
