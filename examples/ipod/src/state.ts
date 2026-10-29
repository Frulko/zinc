// The app's state: the iPods found (watched: one mounted, unmounted or pulled shows within seconds), the one open and its library
// (albums built from the tracks), the page shown, the search, sort and selection of the songs, the Allow changes switch, and the
// actions the pages call to look and open (the changes and transfers are in actions.ts). Nothing runs at import: main.tsx starts
// the scan.
import { createSignal, createMemo, batch } from 'zinc:ui/solid';
import * as ipod from 'zinc:ipod';
import { findPods, openPod, openRemote, closePod, forgetPod, PodLibrary } from './services/ipod';
import { loadConfig, saveConfig } from './services/config';
import { cancelWaiting } from './services/transfers';
import { log } from './services/log';
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
/** The tracks selected in a table (ids), and the row a shift-click extends from. */
export const [selected, setSelected] = createSignal<string[]>([]);
export const [selectAnchor, setSelectAnchor] = createSignal<i32>(-1);
/** Every change to the iPod (add, restore, repair) and to its backups (delete) waits for this switch: off at each start. */
export const [allowChanges, setAllowChanges] = createSignal<boolean>(false);

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

export function showPage(p: string): void { batch(() => { setPage(p); setAlbumShown(null); setPhotoShown(''); setSearch(''); setSelected([]); setSelectAnchor(-1); }); }

/** A click on row `i` of `list`: alone selects it, with Cmd or Ctrl adds or removes it, with Shift selects from the anchor to it. */
export function selectRow(list: ipod.Track[], i: i32, toggle: boolean, range: boolean): void {
  if (i < 0 || i >= list.length) return;
  const id = list[i].id, now = selected();
  if (range && selectAnchor() >= 0) {
    const a = Math.min(selectAnchor(), i), b = Math.max(selectAnchor(), i);
    const out: string[] = [];
    for (let k = a; k <= b && k < list.length; k++) out.push(list[k].id);
    setSelected(out);
    return;
  }
  batch(() => {
    setSelectAnchor(i);
    if (!toggle) setSelected([id]);
    else if (now.indexOf(id) >= 0) setSelected(now.filter((x: string) => x !== id));
    else setSelected([...now, id]);
  });
}

// ---- finding and opening iPods
let scanTimer: i32 = -1;

/** What a list of iPods looks like, to tell a change from the same answer (nothing is redrawn while nothing changes). */
function signature(list: ipod.Device[]): string {
  const parts: string[] = [];
  for (const d of list) parts.push(`${d.connection}|${d.mountpoint}|${d.name}|${d.serial}|${d.freeBytes}`);
  return parts.join('\n');
}

/** Looks for iPods (by itself every few seconds, at once with `manual`). The open iPod gone from the list (unmounted, ejected
 *  elsewhere or pulled) is closed; one mounted iPod and nothing open: it is opened. */
export async function rescan(manual: boolean = false): Promise<void> {
  if (scanTimer >= 0) clearTimeout(scanTimer);
  scanTimer = -1;
  if (manual) setScanning(true);
  try {
    const found = await findPods();
    if (signature(found) !== signature(pods())) setPods(found);
    if (error() !== '' && manual) setError('');
    const mounted: ipod.Device[] = [];
    for (const d of found) if (d.connection === 'disk') mounted.push(d);
    const lib = library();
    if (lib !== null && (lib as PodLibrary).remote === '') {   // a remote iPod is not on this computer's list
      const mp = (lib as PodLibrary).device.mountpoint;
      let still = false;
      for (const d of mounted) still = still || d.mountpoint === mp;
      if (!still) podGone(lib as PodLibrary);
    }
    if (library() === null && opening() === '' && mounted.length === 1) await openDevice(mounted[0].mountpoint);
  } catch (e) {
    setError(`Could not look for iPods: ${(e as Error).message}`);
  }
  if (manual) setScanning(false);
  scanTimer = setTimeout(() => { scanTimer = -1; rescan(false); }, SCAN_EVERY_MS);
}

/** The open iPod went away without being ejected here: playback and the jobs not started stop, it is closed and the Devices page
 *  says so. A job that was running fails by itself (its files are gone). */
function podGone(lib: PodLibrary): void {
  const name = lib.device.name !== '' ? lib.device.name : 'The iPod';
  stopPlaying();
  cancelWaiting();
  dropCovers();
  forgetPod();
  ipod.close().catch((e: Error) => { /* already closed */ });
  batch(() => { setLibrary(null); setError(`${name} was disconnected (${lib.device.mountpoint} is no longer mounted). Plug it in again to open it.`); });
  log(`${name} disconnected`, `${lib.device.mountpoint} is no longer mounted`, false);
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
    batch(() => { setLibrary(opened); setError(''); setPlaylistShown(''); setPhotoAlbumShown(''); setExtraShown(''); showPage(PAGE_OVERVIEW); });
    log(`Opened ${opened.device.name !== '' ? opened.device.name : 'the iPod'}`, `${mountpoint}: ${opened.tracks.length} tracks, ${opened.playlists.length} playlists`, true);
  } catch (e) {
    setError(`Could not read the iPod at ${mountpoint}: ${(e as Error).message}`);
    log(`Open ${mountpoint}`, (e as Error).message, false);
  }
  setOpening('');
}

// ---- a remote iPod (an iPod daemon, examples/ipod-web): its address and token, kept in the config

/** The remote iPod's address ('' = none set) and token, as the config keeps them (loadRemote reads them at start). */
export const [remoteAddress, setRemoteAddress] = createSignal<string>('');
export const [remoteToken, setRemoteToken] = createSignal<string>('');

export function loadRemote(): void {
  const c = loadConfig();
  batch(() => { setRemoteAddress(c.remoteAddress); setRemoteToken(c.remoteToken); });
}

function keepRemote(address: string, token: string): void {
  const c = loadConfig();
  c.remoteAddress = address; c.remoteToken = token;
  saveConfig(c);
  batch(() => { setRemoteAddress(address); setRemoteToken(token); });
}

/** Connects to the iPod daemon at `address` with `token`, keeps them in the config and shows its iPod's overview. */
export async function openRemoteDevice(address: string, token: string): Promise<void> {
  const at = address.trim();
  if (at === '') { setError('Give the address of the iPod daemon, as http://pi.local:8686'); return; }
  const lib = library();
  if (lib !== null && (lib as PodLibrary).remote !== '' && remoteAddress() === at) { showPage(PAGE_OVERVIEW); return; }
  batch(() => { setOpening(at); setError(''); });
  keepRemote(at, token.trim());
  try {
    stopPlaying();
    dropCovers();
    setLibrary(null);
    const opened = await openRemote(at, token);
    batch(() => { setLibrary(opened); setError(''); setPlaylistShown(''); setPhotoAlbumShown(''); setExtraShown(''); showPage(PAGE_OVERVIEW); });
    log(`Opened ${opened.device.name !== '' ? opened.device.name : 'the iPod'} (remote)`, `${opened.remote}: ${opened.tracks.length} tracks, ${opened.playlists.length} playlists`, true);
  } catch (e) {
    setError(`Could not open the remote iPod at ${at}: ${(e as Error).message}`);
    log(`Open ${at}`, (e as Error).message, false);
  }
  setOpening('');
}

/** Closes the remote iPod if it is open and forgets its address (the config too). */
export async function disconnectRemote(): Promise<void> {
  const lib = library(), at = remoteAddress();
  if (lib !== null && (lib as PodLibrary).remote !== '') {
    stopPlaying();
    cancelWaiting();
    dropCovers();
    setLibrary(null);
    await closePod();
  }
  keepRemote('', '');
  log('Disconnect the remote iPod', at, true);
}

/** Closes the open iPod (before the app quits). */
export async function closeDevice(): Promise<void> {
  stopPlaying();
  dropCovers();
  setLibrary(null);
  await closePod();
}
