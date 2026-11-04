// Pictures of Discord's CDN: avatars, server icons, custom emoji and image attachments (docs/reports/discord-client-research.md 3). A picture
// is kept in a bounded decoded cache, and its file is kept on disk under a key without the URL's query: an attachment's signed URL expires
// (its ex= parameter, hex seconds), its file does not. An expired URL, or one the CDN refuses, is renewed with POST /attachments/refresh-urls.
// ponytail: animated avatars and emoji are asked as .png, their first frame (stickers and GIFs play: components/Animated.tsx).
import { pixelScale } from 'zinc:gfx';
import { load as decodeImage } from 'zinc:imageio';
import { ImageCache } from 'zinc:ui/image-cache';
import { addSignalListener, appState } from 'zinc:ui';
import { writeBytes, exists, mkdir } from 'zinc:fs';
import { dataDir } from 'zinc:system/window';
import { CDN_BASE, CACHE_DIR } from '../constants';
import * as guard from '../safety/index';

const CDN_SIZE = 128;   // px: the largest shown (48 pt) on a 2x screen; without it the CDN sends the picture as uploaded, up to 1024 px
const images = new ImageCache(16 * 1024 * 1024);
const pending = new Set<string>();
setInterval(() => { images.trim(appState() === 'background' ? 0 : -1); }, 2000);
addSignalListener((kind: string, arg: string): void => { if (kind === 'background') images.trim(0); });
const broken: Set<string> = new Set<string>();   // keys whose picture failed to download or to decode (an error state, not a placeholder)
let folder = '';
let loaded: () => void = (): void => {};
let log: (line: string) => void = (line: string): void => {};
/** f runs when a picture arrives (the screen shows it); l gets the log lines. */
export function onPicture(f: () => void, l: (line: string) => void): void { loaded = f; log = l; }

export const avatarKey = (userId: string, hash: string): string => `avatars/${userId}/${hash}.png`;
export const iconKey = (guildId: string, hash: string): string => `icons/${guildId}/${hash}.png`;
export const emojiKey = (id: string): string => `emojis/${id}.png`;
/** An attachment's key: its path on the CDN, without the signature that expires. */
export function attachmentKey(url: string): string {
  const path = url.split('?')[0], at = path.indexOf('/attachments/');
  return at >= 0 ? path.slice(at + 1) : path;
}

/** The picture of a CDN path (avatars/..., icons/..., emojis/...), -1 until it is loaded. */
export function cdnPicture(key: string): i32 { return picture(key, `${CDN_BASE}/${key}?size=${CDN_SIZE}`, CDN_SIZE, CDN_SIZE); }
/** The picture of an attachment's URL, -1 until it is loaded. */
export function attachmentPicture(url: string): i32 { return picture(attachmentKey(url), url, Math.round(432 * pixelScale()), Math.round(324 * pixelScale())); }
/** A picture of Discord's media proxy (an attachment's or an embed's proxy_url) at the physical w x h drawn, as WebP: the proxy resizes it
 *  (a 4000 px photo comes as 800 px), and its still frame stands for a video or a GIF. Kept under its path without the signature. */
export function mediaPicture(url: string, w: i32, h: i32): i32 {
  const q = url.indexOf('?'), sep = q < 0 ? '?' : url.endsWith('&') || url.endsWith('?') ? '' : '&';
  const pw = Math.max(1, Math.round(w * pixelScale())), ph = Math.max(1, Math.round(h * pixelScale()));
  return picture(mediaKey(url, w, h), `${url}${sep}width=${pw}&height=${ph}&format=webp`, pw, ph);
}
/** True once the picture of mediaPicture(url, w, h) or attachmentPicture(url) failed (the file is gone, refused, or not a picture). */
export const mediaFailed = (url: string, w: i32, h: i32): boolean => broken.has(mediaKey(url, w, h));
export const attachmentFailed = (url: string): boolean => broken.has(attachmentKey(url));
/** A sticker (PNG, APNG: its first frame, GIF) at 160 px. */
export function stickerPicture(id: string, gif: boolean): i32 {
  const key = `stickers/${id}.${gif ? 'gif' : 'png'}`;
  return picture(key, `${CDN_BASE}/${key}?size=160`, Math.round(160 * pixelScale()), Math.round(160 * pixelScale()));
}
/** A picture of another site (a GIF's preview from Tenor), at its own size, -1 until it is loaded. */
export function urlPicture(url: string): i32 { return picture(`ext/${hashOf(pathOf(url))}`, url, Math.round(432 * pixelScale()), Math.round(324 * pixelScale())); }
/** A URL without its scheme and host: the key of its file is the same whichever host serves it (the tests' fake on a random port). */
const pathOf = (url: string): string => { const at = url.indexOf('/', url.indexOf('//') + 2); return at < 0 ? url : url.slice(at); };
function mediaKey(url: string, w: i32, h: i32): string { const q = url.indexOf('?'); return `media/${hashOf(pathOf(q < 0 ? url : url.slice(0, q)))}-${Math.max(1, Math.round(w * pixelScale()))}x${Math.max(1, Math.round(h * pixelScale()))}`; }
/** The file of a picture on the disk, downloaded when it is not there yet (the frames of an animation are decoded from it). */
const fetching: Map<string, Promise<string>> = new Map<string, Promise<string>>();
export function cdnFile(key: string, url: string): Promise<string> {
  const file = fileOf(key);
  if (exists(file)) return Promise.resolve(file);
  const known = fetching.get(key);
  if (known !== undefined) return known;   // asked again while it downloads (the row drawn again): one request
  const p = download(url).then((bytes: u8[]): string => { writeBytes(file, bytes); log(`picture ${key}: from the CDN`); fetching.delete(key); return file; });
  fetching.set(key, p);
  p.catch((e: Error): string => { fetching.delete(key); return ''; });   // a failed download is asked again next time
  return p;
}
/** A short name for a URL's file (a 32-bit polynomial hash). */
function hashOf(s: string): string {
  let h: number = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 4294967296;
  return h.toString(16);
}

const decodedKey = (key: string, w: i32, h: i32): string => `${key}@${w}x${h}`;
function picture(key: string, url: string, w: i32, h: i32): i32 {
  const variant = decodedKey(key, w, h), known = images.get(variant);
  if (known >= 0) return known;
  if (pending.has(variant) || broken.has(key)) return -1;
  pending.add(variant);
  load(key, url, w, h);
  return -1;
}

/** The client's disk cache: the pictures, and READY of the last session (the guard's quick restart). */
export function cacheFolder(): string {
  if (folder === '') { folder = CACHE_DIR !== '' ? CACHE_DIR : `${dataDir()}/cdn`; mkdir(folder, true); }
  return folder;
}
/** avatars/101/ab.png -> <folder>/avatars_101_ab.png */
const fileOf = (key: string): string => `${cacheFolder()}/${key.split('/').join('_')}`;

let loading: i32 = 0;
/** Pictures on their way (the tests wait for none). */
export function picturesLoading(): i32 { return loading; }
/** Discards unused decoded pictures; encoded files stay on disk for the next visit. */
export function trimPictures(): void { images.trim(0); }
/** Decoded cache entries and owned pixel bytes (the live working set is protected). */
export function pictureCacheStats(): number[] { return [images.size, images.bytes]; }

async function load(key: string, url: string, w: i32, h: i32): Promise<void> {
  loading++;
  try { await fetchPicture(key, url, w, h); }
  finally { loading--; pending.delete(decodedKey(key, w, h)); }
}
async function fetchPicture(key: string, url: string, w: i32, h: i32): Promise<void> {
  await Promise.resolve();   // after the render that asked for it
  const file = fileOf(key);
  try {
    if (exists(file)) { log(`picture ${key}: from the disk`); }
    else await cdnFile(key, url);
  } catch (e) { log(`picture ${key} failed: ${e.message}`); fail(key); return; }
  try {
    const img = await decodeImage(file, w, h);
    images.put(decodedKey(key, w, h), img);
    redraw();
  } catch (e) { log(`picture ${key}: not a picture`); fail(key); }
}
function fail(key: string): void { broken.add(key); redraw(); }
function redraw(): void { if (!told) { told = true; setTimeout(() => { told = false; loaded(); }, 16); } }   // one redraw for the pictures of a frame
let told = false;

/** The value of a query parameter, '' when the URL has none. */
function param(url: string, name: string): string {
  const q = url.indexOf('?');
  if (q < 0) return '';
  for (const kv of url.slice(q + 1).split('&')) { const e = kv.indexOf('='); if (e > 0 && kv.slice(0, e) === name) return kv.slice(e + 1); }
  return '';
}
const signed = (url: string): boolean => param(url, 'ex') !== '';
const expired = (url: string): boolean => signed(url) && parseInt(param(url, 'ex'), 16) * 1000 <= Date.now();

async function download(url: string): Promise<u8[]> {
  let u = expired(url) ? await refresh(url) : url;
  let r = await guard.download(u);
  if ((r.status === 403 || r.status === 404) && signed(u) && u === url) { u = await refresh(url); r = await guard.download(u); }   // expired on the way
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.bytes();
}
/** A signed attachment URL renewed. The pictures of one frame ask together: their URLs go in one request (the guard's REFRESH_BATCH at
 *  most each), instead of one request a picture. */
let toRefresh: string[] = [];
let refreshing: Promise<Map<string, string>> | null = null;
async function refreshAll(): Promise<Map<string, string>> {
  await new Promise<void>((done: () => void) => { setTimeout(done, 16); });
  const urls = toRefresh;
  toRefresh = []; refreshing = null;
  const out = new Map<string, string>();
  for (let i = 0; i < urls.length; i += guard.REFRESH_BATCH) {
    let r: any = null;
    try { r = await guard.api('refresh', 'POST', '/attachments/refresh-urls', { attachment_urls: urls.slice(i, i + guard.REFRESH_BATCH) }); }
    catch (e) { log(`refresh-urls: ${e.message}`); }   // the guard or Discord said no: those pictures stay as they are
    if (r !== null && Array.isArray(r.refreshed_urls)) for (const x of r.refreshed_urls) if (typeof x.original === 'string' && typeof x.refreshed === 'string') out.set(x.original, x.refreshed);
  }
  return out;
}
async function refresh(url: string): Promise<string> {
  if (toRefresh.indexOf(url) < 0) toRefresh.push(url);
  if (refreshing === null) refreshing = refreshAll();
  const done = await (refreshing as Promise<Map<string, string>>);
  log(`refreshed ${attachmentKey(url)}`);
  const u = done.get(url);
  return u !== undefined ? u : url;
}
