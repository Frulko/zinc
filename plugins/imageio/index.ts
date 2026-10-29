// zinc:imageio — image files on disk (docs/plugins/imageio.md): what a picture is (size, orientation, EXIF) from its header alone, and
// thumbnails and downscaled pictures as runtime images of zinc:gfx, decoded by worker threads, turned upright, the newest request first.
// The native side (native/imageio.spec.ts) runs the jobs; this file polls the finished ones from the program's thread, every engine alike.
import S from './native/imageio.spec';
import { createImage, destroyImage } from 'zinc:gfx';
import { dataDir } from 'zinc:sys';

export interface Location { latitude: number; longitude: number }
/** What info() reads. Strings are '' and numbers 0 when the file does not say. */
export interface ImageInfo {
  /** As shown: the orientation applied (a portrait photo taken with the phone turned is taller than wide). */
  width: number; height: number;
  /** As stored in the file. */
  pixelWidth: number; pixelHeight: number;
  /** EXIF orientation, 1 (upright) to 8. */
  orientation: number;
  /** 'jpeg' 'png' 'heic' 'webp' 'gif' 'tiff' 'bmp' 'avif' 'raw' (or the system's type name for another format it reads). */
  format: string;
  /** Bytes. */
  fileSize: number;
  /** When the picture was taken, ISO 8601 in the camera's local time ('2024-05-01T12:34:56'); the file's date when it has none. */
  date: string;
  make: string; model: string; lens: string;
  iso: number;
  /** Seconds (0.008 for 1/125). */
  exposureTime: number;
  fNumber: number;
  /** Millimetres. */
  focalLength: number;
  location: Location | null;
}

const FS = '\u001f';

/** What the file at `path` is, read from its header (nothing is decoded); null when it is not an image this system reads. */
export function info(path: string): ImageInfo | null {
  const s = S.info(path);
  if (s === '') return null;
  const f = s.split(FS);
  return { width: parseInt(f[0]), height: parseInt(f[1]), pixelWidth: parseInt(f[2]), pixelHeight: parseInt(f[3]), orientation: parseInt(f[4]),
    format: f[5], fileSize: parseFloat(f[6]), date: f[7], make: f[8], model: f[9], lens: f[10], iso: parseFloat(f[11]),
    exposureTime: parseFloat(f[12]), fNumber: parseFloat(f[13]), focalLength: parseFloat(f[14]),
    location: f[15] === '' ? null : { latitude: parseFloat(f[15]), longitude: parseFloat(f[16]) } };
}

interface Waiter { job: i32; path: string; resolve: (image: number) => void; reject: (e: Error) => void }
const waiting = new Map<i32, Waiter>();
let timer: i32 = -1;

function settle(w: Waiter): void {
  waiting.delete(w.job);
  if (S.state(w.job) !== 1) { const why = S.result(w.job); S.release(w.job); w.reject(new Error(why)); return; }
  const sz = S.size(w.job);
  const img = createImage(sz[0], sz[1]);
  const ok = img >= 0 && S.copy(w.job, img);
  S.release(w.job);
  if (ok) { w.resolve(img); return; }
  if (img >= 0) destroyImage(img);
  w.reject(new Error('imageio: no image to draw the picture into (zinc:gfx)'));
}
function pump(): void {
  for (const id of S.finished()) {
    const w = waiting.get(id);
    if (w !== undefined) settle(w);
  }
  if (waiting.size === 0 && timer >= 0) { clearInterval(timer); timer = -1; }
}
function wait(job: i32, path: string): Promise<number> {
  return new Promise<number>((resolve: (image: number) => void, reject: (e: Error) => void) => {
    waiting.set(job, { job: job, path: path, resolve: resolve, reject: reject });
    if (timer < 0) timer = setInterval(pump, 8);
  });
}

let cacheDir: string | null = null;
/** Where thumbnails are kept: the app's data folder's cache/thumbnails (zinc:sys dataDir()) unless setCacheDir changed it; '' for none. */
export function thumbnailCacheDir(): string {
  if (cacheDir === null) cacheDir = dataDir() + '/cache/thumbnails';
  return cacheDir;
}
/** Keeps thumbnails in `dir` instead ('' for no cache at all). */
export function setCacheDir(dir: string): void { cacheDir = dir; }

/** A thumbnail of the picture at `path`: fitted in a square of `maxSide` pixels, upright, as a new runtime image (`<Image image={h} />`,
 *  gfx.drawImage); free it with gfx.destroyImage. Decoded off the program's thread, the newest request first, and kept in the thumbnail
 *  cache, so the next run reads it back at once. Rejects when the file is not an image, or with 'cancelled' (cancel). */
export function thumbnail(path: string, maxSide: number = 256): Promise<number> {
  return wait(S.thumbnail(path, maxSide, thumbnailCacheDir()), path);
}

/** The picture at `path` fitted in maxWidth x maxHeight (never enlarged; 0, 0: the whole picture, 4096 at most), upright, as a new runtime
 *  image, for a viewer. Decoded off the program's thread. */
export function load(path: string, maxWidth: number = 0, maxHeight: number = 0): Promise<number> { return wait(S.load(path, maxWidth, maxHeight), path); }

/** Drops the requests for `path` that have not started (a cell that scrolled away): they reject with 'cancelled'. */
export function cancel(path: string): void {
  for (const w of waiting.values()) if (w.path === path) S.cancel(w.job);
}
