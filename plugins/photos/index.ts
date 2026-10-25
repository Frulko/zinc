// zinc:photos — the photo library (docs/plugins/photos.md): ask for access (full, limited or add only), list the albums and their assets
// newest first, load a thumbnail or the whole picture as a runtime image of zinc:gfx, save a picture to the library or to an album.
// The native side (native/photos.spec.ts) answers PhotoKit on its own queues; this file polls its jobs from the program's thread.
// ZINC_FAKE_PHOTOS=<folder> (and a deterministic run) lends a folder of PNG and JPEG files as the library.
// To let the person pick a few pictures without any permission, zinc:system/dialog's open() with image filters shows the system's photo
// picker on a phone (PHPickerViewController on iOS, out of process).
import S from './native/photos.spec';
import { createImage, destroyImage } from 'zinc:gfx';

const RS = '\u001e', FS = '\u001f';

/** Bytes of a PNG or JPEG file, or RGBA pixels. Zinc has no typed arrays: a u8[] (a real Uint8Array on the QuickJS engine). */
export type Uint8Array = u8[];
/** 'limited': the person shared some pictures only (iOS 14 and later); presentLimitedLibraryPicker() changes which. */
export type PermissionStatus = 'granted' | 'limited' | 'denied' | 'undetermined';
/** 'readWrite' to list and load (and save into an album); 'addOnly' to save pictures and nothing else. */
export type AccessLevel = 'readWrite' | 'addOnly';
export type MediaType = 'image' | 'video' | 'audio' | 'unknown';

export interface Album { id: string; title: string; kind: 'smart' | 'user'; count: number }
export interface Location { latitude: number; longitude: number }
export interface Asset { id: string; date: number; width: number; height: number; mediaType: MediaType; location: Location | null }
export interface AssetsOptions { offset?: number; limit?: number }

const status = (s: i32): PermissionStatus => s === 1 ? 'granted' : s === 3 ? 'limited' : s === 2 ? 'denied' : 'undetermined';
const levelOf = (l: AccessLevel): i32 => l === 'addOnly' ? 1 : 0;
const records = (s: string): string[][] => {
  const out: string[][] = [];
  for (const r of s.split(RS)) if (r !== '') out.push(r.split(FS));
  return out;
};

/** Where access stands now, without asking. */
export function permissionStatus(level: AccessLevel = 'readWrite'): PermissionStatus { return status(S.permission(levelOf(level), false)); }

/** Asks for access: the system's question once per app, resolved with the answer (or 'undetermined' after a minute without one).
 *  'denied' at once when the app's Info.plist lacks the usage text (zinc.json "permissions": ["photos"]) or zinc.json refuses it. */
export function requestPermission(level: AccessLevel = 'readWrite'): Promise<PermissionStatus> {
  const l = levelOf(level), first = S.permission(l, true);
  if (first !== 0) return Promise.resolve(status(first));
  return new Promise<PermissionStatus>((resolve: (s: PermissionStatus) => void) => {
    let tries = 0, t: i32 = -1;
    t = setInterval(() => {
      const s = S.permission(l, false);
      if (s === 0 && ++tries < 600) return;
      clearInterval(t);
      resolve(status(s));
    }, 100);
  });
}

// a job of the native side, polled until it ends: its id while it is done, or the reason it failed
function settle(job: i32): Promise<i32> {
  if (job < 0) return Promise.reject(new Error(S.error()));
  return new Promise<i32>((resolve: (j: i32) => void, reject: (e: Error) => void) => {
    const end = (): boolean => {
      const st = S.state(job);
      if (st === 0) return false;
      if (st === 1) resolve(job);
      else { const why = S.result(job); S.release(job); reject(new Error(why)); }
      return true;
    };
    if (end()) return;
    let t: i32 = -1;
    t = setInterval(() => { if (end()) clearInterval(t); }, 10);
  });
}

/** Shows the system's sheet where the person changes which pictures a limited access shares (iOS); resolves false when there is none
 *  (full access, macOS). List the assets again once it resolves true. */
export function presentLimitedLibraryPicker(): Promise<boolean> {
  const job = S.manageLimited();
  if (job < 0) return Promise.resolve(false);
  return settle(job).then((j: i32): boolean => { S.release(j); return true; });
}

/** The albums: Recents first, the smart albums that hold something (Favorites, Screenshots...), then the person's own. */
export function albums(): Promise<Album[]> {
  const s = S.albums(), e = S.error();
  if (e !== '') return Promise.reject(new Error(e));
  const out: Album[] = [];
  for (const f of records(s)) out.push({ id: f[0], title: f[1], kind: f[2] === 'user' ? 'user' : 'smart', count: parseInt(f[3]) });
  return Promise.resolve(out);
}

/** The assets of an album ('' for the whole library), newest first: `limit` (100) from `offset` (0), for a list that loads as it scrolls. */
export function assets(albumId: string, o: AssetsOptions = {}): Promise<Asset[]> {
  const s = S.assets(albumId, o.offset ?? 0, o.limit ?? 100), e = S.error();
  if (e !== '') return Promise.reject(new Error(e));
  const out: Asset[] = [];
  for (const f of records(s)) {
    const t = f[4];
    out.push({ id: f[0], date: parseFloat(f[1]), width: parseInt(f[2]), height: parseInt(f[3]),
      mediaType: t === 'image' || t === 'video' || t === 'audio' ? t : 'unknown',
      location: f[5] === '' ? null : { latitude: parseFloat(f[5]), longitude: parseFloat(f[6]) } });
  }
  return Promise.resolve(out);
}

/** The picture of an asset fitted in maxWidth x maxHeight (never enlarged; 0, 0: the whole picture, 4096 at most) as a new runtime image:
 *  gfx.drawImage it. Free it with gfx.destroyImage. A picture kept in iCloud is downloaded first. */
export async function loadImage(id: string, maxWidth: number = 0, maxHeight: number = 0): Promise<number> {
  const job = await settle(S.load(id, maxWidth, maxHeight));
  const sz = S.size(job);
  const img = createImage(sz[0], sz[1]);
  const ok = img >= 0 && S.copy(job, img);
  S.release(job);
  if (!ok) { if (img >= 0) destroyImage(img); throw new Error('photos: no image to draw the picture into (zinc:gfx)'); }
  return img;
}

/** A thumbnail: the picture fitted in a square of `size` pixels. */
export function loadThumbnail(id: string, size: number = 256): Promise<number> { return loadImage(id, size, size); }

async function saved(job: i32): Promise<string> {
  const j = await settle(job);
  const id = S.result(j);
  S.release(j);
  return id;
}

/** Saves the bytes of a PNG or JPEG file (camera.toPng(), a download) to the library, and to the user album `album` when given (made when
 *  missing; an album needs 'readWrite' access, the library alone 'addOnly'). Resolves with the new asset's id. */
export function saveImage(bytes: Uint8Array, album: string = ''): Promise<string> { return saved(S.save(bytes, album)); }

/** The same with RGBA pixels (width * height * 4 bytes), saved as a PNG. */
export function savePixels(rgba: Uint8Array, width: number, height: number, album: string = ''): Promise<string> {
  return saved(S.savePixels(rgba, width, height, album));
}
