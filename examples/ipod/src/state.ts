// The app's state: the iPods found, the one open and its library (albums built from the tracks), the page shown, the search and
// sort of the songs, and the actions the pages call. Nothing runs at import: main.tsx starts the scan.
import { createSignal, createMemo, batch } from 'zinc:ui/solid';
import * as ipod from 'zinc:ipod';
import { findPods, openPod, closePod, PodLibrary } from './services/ipod';
import { dropCovers } from './services/covers';
import { stop as stopPlaying } from './services/player';
import { PAGE_OVERVIEW, SCAN_EVERY_MS, kindsOf } from './constants';

/** An album: the tracks that share an album name and album artist, in disc and track order. */
export class Album {
  key: string; title: string; artist: string; year: i32;
  tracks: ipod.Track[] = [];
  /** A track with a cover ('' when none has one). */
  coverTrack: string = '';
  constructor(key: string, title: string, artist: string) { this.key = key; this.title = title; this.artist = artist; this.year = 0; }
}

export const [pods, setPods] = createSignal<ipod.Device[]>([]);
export const [scanning, setScanning] = createSignal<boolean>(false);
/** The open iPod's library, null while none is open. */
export const [library, setLibrary] = createSignal<PodLibrary | null>(null);
/** The mountpoint being opened ('' when nothing is), for the spinner. */
export const [opening, setOpening] = createSignal<string>('');
export const [error, setError] = createSignal<string>('');
export const [page, setPage] = createSignal<string>(PAGE_OVERVIEW);
export const [albumShown, setAlbumShown] = createSignal<Album | null>(null);
export const [playlistShown, setPlaylistShown] = createSignal<string>('');
export const [photoAlbumShown, setPhotoAlbumShown] = createSignal<string>('');
/** The photo opened in full ('' while the grid is shown). */
export const [photoShown, setPhotoShown] = createSignal<string>('');
/** The path of the note, contact or calendar shown on the Files page. */
export const [extraShown, setExtraShown] = createSignal<string>('');
export const [search, setSearch] = createSignal<string>('');
/** The songs' sort: title | artist | album | time, and its direction. */
export const [sortKey, setSortKey] = createSignal<string>('title');
export const [sortUp, setSortUp] = createSignal<boolean>(true);

function lower(s: string): string { return s.toLowerCase(); }
function byText(a: string, b: string): i32 { const x = lower(a), y = lower(b); return x < y ? -1 : x > y ? 1 : 0; }
function inAlbumOrder(a: ipod.Track, b: ipod.Track): i32 { return a.cdNr !== b.cdNr ? a.cdNr - b.cdNr : a.trackNr !== b.trackNr ? a.trackNr - b.trackNr : byText(a.title, b.title); }

/** The albums of the open iPod, sorted by artist then title (music only: podcasts and videos are left out). */
export const albums = createMemo<Album[]>(() => {
  const lib = library();
  const out: Album[] = [];
  if (lib === null) return out;
  const byKey = new Map<string, Album>();
  for (const t of lib.tracks) {
    if (t.mediaType !== 'audio') continue;
    const artist = t.albumArtist !== '' ? t.albumArtist : t.artist;
    const title = t.album !== '' ? t.album : 'Unknown album';
    const key = `${lower(artist)}\u001f${lower(title)}`;
    let a = byKey.get(key);
    if (a === undefined) { const made = new Album(key, title, artist !== '' ? artist : 'Unknown artist'); byKey.set(key, made); out.push(made); a = made; }
    const al = a as Album;
    al.tracks.push(t);
    if (al.year === 0 && t.year > 0) al.year = t.year;
    if (al.coverTrack === '' && t.artwork) al.coverTrack = t.id;
  }
  for (const a of out) a.tracks.sort(inAlbumOrder);
  out.sort((a: Album, b: Album) => { const c = byText(a.artist, b.artist); return c !== 0 ? c : byText(a.title, b.title); });
  return out;
}, []);

/** How many tracks of the open iPod are of the kinds a page lists. */
export function countOf(page: string): i32 {
  const lib = library();
  if (lib === null) return 0;
  const kinds = kindsOf(page);
  let n = 0;
  for (const t of lib.tracks) if (kinds.indexOf(t.mediaType) >= 0) n++;
  return n;
}

/** The tracks of the page shown (songs, podcasts, audiobooks or videos), filtered by the search (title, artist, album) and
 *  sorted by the chosen column. */
export const songs = createMemo<ipod.Track[]>(() => {
  const lib = library();
  if (lib === null) return [];
  const q = lower(search().trim()), key = sortKey(), up = sortUp(), kinds = kindsOf(page());
  const out: ipod.Track[] = [];
  for (const t of lib.tracks) {
    if (kinds.indexOf(t.mediaType) < 0) continue;
    if (q === '' || lower(t.title).indexOf(q) >= 0 || lower(t.artist).indexOf(q) >= 0 || lower(t.album).indexOf(q) >= 0) out.push(t);
  }
  out.sort((a: ipod.Track, b: ipod.Track) => {
    let c: i32 = 0;
    if (key === 'artist') c = byText(a.artist, b.artist);
    else if (key === 'album') c = byText(a.album, b.album) !== 0 ? byText(a.album, b.album) : inAlbumOrder(a, b);
    else if (key === 'time') c = a.durationMs < b.durationMs ? -1 : a.durationMs > b.durationMs ? 1 : 0;
    if (c === 0) c = byText(a.title, b.title);
    return up ? c : -c;
  });
  return out;
}, []);

/** The playlists made on the iPod or in iTunes (the master playlist, which holds every track, is left out). */
export const playlists = createMemo<ipod.Playlist[]>(() => {
  const lib = library();
  const out: ipod.Playlist[] = [];
  if (lib === null) return out;
  for (const p of lib.playlists) if (!p.master) out.push(p);
  return out;
}, []);

/** The photo albums, the master one ("Photo Library") first. */
export const photoAlbums = createMemo<ipod.PhotoAlbum[]>(() => {
  const lib = library();
  const out: ipod.PhotoAlbum[] = [];
  if (lib === null) return out;
  for (const a of lib.photoAlbums) if (a.master) out.push(a);
  for (const a of lib.photoAlbums) if (!a.master) out.push(a);
  return out;
}, []);

/** How many photos the iPod holds (the master album's). */
export function photoCount(): i32 { const a = photoAlbums(); return a.length > 0 ? a[0].photoIds.length : 0; }

/** The tracks of a playlist, in its order. */
export function playlistTracks(id: string): ipod.Track[] {
  const lib = library();
  const out: ipod.Track[] = [];
  if (lib === null) return out;
  const byId = new Map<string, ipod.Track>();
  for (const t of lib.tracks) byId.set(t.id, t);
  for (const p of lib.playlists) {
    if (p.id !== id) continue;
    for (const tid of p.trackIds) { const t = byId.get(tid); if (t !== undefined) out.push(t as ipod.Track); }
  }
  return out;
}

export function sortBy(key: string): void {
  if (sortKey() === key) setSortUp(!sortUp());
  else batch(() => { setSortKey(key); setSortUp(true); });
}

export function showPage(p: string): void { batch(() => { setPage(p); setAlbumShown(null); setPhotoShown(''); setSearch(''); }); }

// ---- finding and opening iPods
let scanTimer: i32 = -1;

/** Looks for iPods now; one mounted iPod and nothing open: it is opened. Again every few seconds while no iPod is shown. */
export async function rescan(): Promise<void> {
  setScanning(true);
  try {
    const found = await findPods();
    setPods(found);
    setError('');
    const mounted: ipod.Device[] = [];
    for (const d of found) if (d.connection === 'disk') mounted.push(d);
    if (library() === null && opening() === '' && mounted.length === 1) await openDevice(mounted[0].mountpoint);
  } catch (e) {
    setError(`Could not look for iPods: ${(e as Error).message}`);
  }
  setScanning(false);
  scheduleScan();
}

function scheduleScan(): void {
  if (scanTimer >= 0) clearTimeout(scanTimer);
  scanTimer = -1;
  if (library() !== null) return;   // an iPod is shown: no polling (Rescan in the sidebar looks again)
  scanTimer = setTimeout(() => { scanTimer = -1; rescan(); }, SCAN_EVERY_MS);
}

/** Opens the iPod at `mountpoint` and shows its overview; an error is shown as a message. */
export async function openDevice(mountpoint: string): Promise<void> {
  const lib = library();
  if (lib !== null && (lib as PodLibrary).device.mountpoint === mountpoint) { showPage(PAGE_OVERVIEW); return; }
  batch(() => { setOpening(mountpoint); setError(''); });
  try {
    stopPlaying();
    dropCovers();
    setLibrary(null);
    const opened = await openPod(mountpoint);
    batch(() => { setLibrary(opened); setPlaylistShown(''); setPhotoAlbumShown(''); setExtraShown(''); showPage(PAGE_OVERVIEW); });
  } catch (e) {
    setError(`Could not read the iPod at ${mountpoint}: ${(e as Error).message}`);
  }
  setOpening('');
  scheduleScan();
}

/** Closes the open iPod (before the app quits). */
export async function closeDevice(): Promise<void> {
  stopPlaying();
  dropCovers();
  setLibrary(null);
  await closePod();
}
