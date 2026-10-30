// Pictures of Discord's CDN: avatars, server icons, custom emoji and image attachments (docs/reports/discord-client-research.md 3). A picture
// is decoded once and kept in memory, and its file is kept on disk under a key without the URL's query: an attachment's signed URL expires
// (its ex= parameter, hex seconds), its file does not. An expired URL, or one the CDN refuses, is renewed with POST /attachments/refresh-urls.
// ponytail: decoded pictures stay in memory for the session; evict the least recently shown when a long session's memory matters.
// ponytail: animated avatars and emoji are asked as .png, their first frame.
import { imageFromBytes } from 'zinc:gfx';
import { readBytes, writeBytes, exists, mkdir } from 'zinc:fs';
import { dataDir } from 'zinc:system/window';
import { CDN_BASE, CACHE_DIR } from '../constants';
import { api } from './rest';

const CDN_SIZE = 128;   // px: the largest shown (48 pt) on a 2x screen; without it the CDN sends the picture as uploaded, up to 1024 px
const AT_ONCE = 6;      // downloads at a time, as a browser per host: 93 servers' icons at once were 93 TLS handshakes on the loop
const images: Map<string, i32> = new Map<string, i32>();   // key -> picture; -1 while it loads, or when it failed
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
export function cdnPicture(key: string): i32 { return picture(key, `${CDN_BASE}/${key}?size=${CDN_SIZE}`); }
/** The picture of an attachment's URL, -1 until it is loaded. */
export function attachmentPicture(url: string): i32 { return picture(attachmentKey(url), url); }

function picture(key: string, url: string): i32 {
  const known = images.get(key);
  if (known !== undefined) return known;
  images.set(key, -1);
  load(key, url);
  return -1;
}

function cacheFolder(): string {
  if (folder === '') { folder = CACHE_DIR !== '' ? CACHE_DIR : `${dataDir()}/cdn`; mkdir(folder, true); }
  return folder;
}
/** avatars/101/ab.png -> <folder>/avatars_101_ab.png */
const fileOf = (key: string): string => `${cacheFolder()}/${key.split('/').join('_')}`;

let loading: i32 = 0;
/** Pictures on their way (the tests wait for none). */
export function picturesLoading(): i32 { return loading; }

const waiting: string[][] = [];   // [key, url] of the downloads past AT_ONCE: the last asked (the last shown) goes first
let downloading: i32 = 0;
async function load(key: string, url: string): Promise<void> {
  loading++;
  if (exists(fileOf(key)) || downloading < AT_ONCE) await fetchPicture(key, url);
  else { waiting.push([key, url]); return; }
  loading--;
  while (waiting.length > 0 && downloading < AT_ONCE) { const w = waiting.pop() as string[]; loading--; load(w[0], w[1]); }
}
async function fetchPicture(key: string, url: string): Promise<void> {
  await Promise.resolve();   // after the render that asked for it
  const file = fileOf(key);
  let bytes: u8[] = [];
  try {
    if (exists(file)) { bytes = readBytes(file); log(`picture ${key}: from the disk`); }
    else {
      downloading++;
      try { bytes = await download(url); } finally { downloading--; }
      writeBytes(file, bytes); log(`picture ${key}: from the CDN`);
    }
  } catch (e) { log(`picture ${key} failed: ${e.message}`); return; }
  const img = imageFromBytes(bytes);
  if (img < 0) { log(`picture ${key}: not a picture`); return; }
  images.set(key, img);
  if (!told) { told = true; setTimeout(() => { told = false; loaded(); }, 16); }   // one redraw for the pictures of a frame
}
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
  let r = await fetch(u);
  if ((r.status === 403 || r.status === 404) && signed(u) && u === url) { u = await refresh(url); r = await fetch(u); }   // expired on the way
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.bytes();
}
/** A signed attachment URL renewed (1 to 50 at once on Discord; one here, as each picture is asked for when it is shown). */
async function refresh(url: string): Promise<string> {
  const r: any = await api('POST', '/attachments/refresh-urls', { attachment_urls: [url] });
  log(`refreshed ${attachmentKey(url)}`);
  if (r !== null && Array.isArray(r.refreshed_urls)) for (const x of r.refreshed_urls) if (x.original === url && typeof x.refreshed === 'string') return x.refreshed;
  return url;
}
