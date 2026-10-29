// The iPod, plugged in (zinc:ipod) or remote (an iPod daemon's /api, services/remote.ts): find the iPods, open one and read its
// library (tracks, playlists, specs, photos, notes and other files), read it again after a change, close it, and the few calls
// that differ between the two: a cover, a track's file, add, remove, tag edits, download and eject. This file is the one place that decides
// local or remote; the pages and the actions call it the same way for both. Nothing here writes to the iPod by itself: the
// changes are the jobs of the actions, behind the Allow changes switch. What was read is kept per iPod (services/cache.ts): the
// library shows at once from it, the covers come from it.
import * as ipod from 'zinc:ipod';
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import { imageFromBytes } from 'zinc:gfx';
import * as remote from './remote';
import * as cache from './cache';

/** IPOD_DEMO_MOUNT=<folder> shows only the iPod mounted there (the tests use it to keep to their fake iPod). */
const onlyMount = sys.env('IPOD_DEMO_MOUNT');

/** Everything the pages show of an open iPod. */
export class PodLibrary {
  device: ipod.Device;
  tracks: ipod.Track[];
  playlists: ipod.Playlist[];
  specs: ipod.SpecItem[];
  photoAlbums: ipod.PhotoAlbum[];
  extras: ipod.Extra[];
  /** The daemon's address for a remote iPod, '' for one plugged into this computer. */
  remote: string = '';
  /** Shown from the cache while the iPod's database has changed since: readLibrary() reads it again. */
  stale: boolean = false;
  constructor(device: ipod.Device, tracks: ipod.Track[], playlists: ipod.Playlist[], specs: ipod.SpecItem[], photoAlbums: ipod.PhotoAlbum[], extras: ipod.Extra[]) {
    this.device = device; this.tracks = tracks; this.playlists = playlists; this.specs = specs; this.photoAlbums = photoAlbums; this.extras = extras;
  }
}

/** The iPods plugged in: mounted ones first, then those seen on USB only. */
export async function findPods(): Promise<ipod.Device[]> {
  const found = await ipod.detect();
  const out: ipod.Device[] = [];
  for (const d of found) if (d.connection === 'disk' && (onlyMount === '' || d.mountpoint === onlyMount)) out.push(d);
  for (const d of found) if (d.connection !== 'disk' && onlyMount === '') out.push(d);
  return out;
}

let openMount = '';

function isRemote(): boolean { return remote.remoteAddress() !== ''; }
/** The open iPod is a remote one (served by an iPod daemon). */
export function podIsRemote(): boolean { return isRemote(); }

/** Opens the iPod at `mountpoint` (closing the one open before) and shows its library: from the cache when it has one (stale when the
 *  database changed since), else read from the iPod. */
export async function openPod(mountpoint: string): Promise<PodLibrary> {
  await closePod();
  const device = await ipod.open(mountpoint);
  openMount = mountpoint;
  cache.useIpod(device);
  return await cachedLibrary();
}

/** Opens the iPod an iPod daemon serves at `address` (closing the one open before) and shows its library, as openPod does. */
export async function openRemote(address: string, token: string): Promise<PodLibrary> {
  await closePod();
  remote.connect(address, token);
  try {
    cache.useIpod(await remote.readRemote());
    return await cachedLibrary();
  } catch (e) { remote.disconnect(); throw e; }
}

/** What tells the open iPod's database changed: its size and time (the daemon's /api/status says it for a remote iPod); '' when unknown. */
async function marker(): Promise<string> {
  if (isRemote()) return await remote.marker();
  for (const name of ['iTunesDB', 'iTunesCDB']) {
    const f = `${openMount}/iPod_Control/iTunes/${name}`;
    try { if (fs.exists(f)) { const st = fs.stat(f); return `${st.size}:${Math.floor(st.mtimeMs)}`; } } catch (e) { /* unreadable: unknown */ }
  }
  return '';
}

async function cachedLibrary(): Promise<PodLibrary> {
  const snap = cache.readSnapshot();
  if (snap === null) return await readLibrary();
  const s = snap as cache.LibrarySnapshot;
  const device = isRemote() ? await remote.readRemote() : await ipod.info();   // the free space measured again
  const lib = new PodLibrary(device, s.tracks, s.playlists, s.specs, [], []);
  if (isRemote()) lib.remote = remote.remoteAddress();
  else {
    try { lib.photoAlbums = await ipod.photoAlbums(); } catch (e) { /* a damaged Photo Database: the music is still shown */ }
    lib.extras = await ipod.extras();
  }
  const now = await marker();
  lib.stale = now === '' || now !== s.marker;
  return lib;
}

/** Reads the open iPod's library again (after an add, a restore or a repair, or when the cache was stale), its free space measured
 *  again, and keeps it in the cache. */
export async function readLibrary(): Promise<PodLibrary> {
  const before = await marker();   // taken first: a change while it reads leaves the cache stale, never wrong
  let lib: PodLibrary;
  if (isRemote()) {   // no photos nor notes over /api yet
    const device = await remote.readRemote();
    lib = new PodLibrary(device, await remote.tracks(), await remote.playlists(), await remote.specs(), [], []);
    lib.remote = remote.remoteAddress();
  } else {
    const device = await ipod.info();
    const tracks = await ipod.tracks();
    const playlists = await ipod.playlists();
    const specs = await ipod.specs();
    let photoAlbums: ipod.PhotoAlbum[] = [];
    try { photoAlbums = await ipod.photoAlbums(); } catch (e) { /* a damaged Photo Database: the music is still shown */ }
    const extras = await ipod.extras();
    lib = new PodLibrary(device, tracks, playlists, specs, photoAlbums, extras);
  }
  if (before !== '') cache.writeSnapshot({ marker: before, device: lib.device, tracks: lib.tracks, playlists: lib.playlists, specs: lib.specs });
  return lib;
}

export async function closePod(): Promise<void> {
  remote.disconnect();
  if (openMount === '') return;
  openMount = '';
  await ipod.close();
}

/** The iPod was ejected or pulled: zinc:ipod closed it or will fail; forget it here. */
export function forgetPod(): void { openMount = ''; remote.disconnect(); }

/** The track's cover as a PNG file of the cache (the largest the iPod stores), read from the iPod or the daemon the first time; ''
 *  when it has none. */
export async function coverPng(trackId: string): Promise<string> {
  const file = cache.coverFile(trackId);
  if (fs.exists(file)) return file;
  if (isRemote()) return (await remote.coverTo(trackId, file)) ? file : '';
  return (await ipod.saveArtwork(trackId, file)) ? file : '';
}

/** A track's cover as a runtime image (-1 when it has none), from the cache. */
export async function coverImage(trackId: string, size: i32): Promise<i32> {
  // ponytail: one file per cover, the largest the iPod stores; it is scaled when drawn, whatever `size`
  const file = await coverPng(trackId);
  return file !== '' ? imageFromBytes(fs.readBytes(file)) : -1;
}

/** The file of `t` on this computer, to play: on the iPod plugged in, else fetched once from the daemon into a cache. */
export async function playableFile(lib: PodLibrary, t: ipod.Track): Promise<string> {
  return lib.remote !== '' ? await remote.localFile(t) : `${lib.device.mountpoint}/${t.path}`;
}

/** Copies the files (each with its kind) to the iPod, into `playlist` ('' = none); one result per file. A remote iPod takes the
 *  kind from the file's tags (the daemon's /api/add has no kind); the tags given (an item with a title) are written after the upload
 *  by /api/update, the cover is the file's own. */
export async function addTracks(items: ipod.TrackInput[], playlist: string): Promise<ipod.AddResult[]> {
  if (!isRemote()) return await ipod.addWith(items, playlist);
  const files: string[] = [];
  for (const it of items) files.push(it.file);
  const res = await remote.add(files, playlist);
  for (let i = 0; i < res.length && i < items.length; i++) {
    if (res[i].error !== '' || items[i].title === undefined) continue;
    const patch: ipod.TrackInput = { ...items[i], file: '' };
    patch.artworkFile = undefined;
    patch.mediaType = undefined;
    try { await remote.update([res[i].id], patch); } catch (e) { res[i].error = `added, but its tags were not written: ${(e as Error).message}`; }
  }
  return res;
}

/** Removes the tracks and their files from the iPod. */
export async function removeTracks(ids: string[]): Promise<void> { if (isRemote()) await remote.remove(ids); else await ipod.remove(ids); }

/** Writes the fields of `patch` (those given; '' and 0 clear one) to the tracks `ids`, then saves the iPod once. A remote iPod's daemon
 *  takes no cover (`artworkFile`): it is refused. */
export async function updateTracks(ids: string[], patch: ipod.TrackInput): Promise<void> {
  if (isRemote()) {
    if (patch.artworkFile !== undefined) throw new Error(`a cover cannot be sent to a remote iPod yet`);
    await remote.update(ids, patch);
    return;
  }
  for (const id of ids) await ipod.update(id, patch);
  await ipod.save();
}

/** A new normal playlist `name` of the tracks `ids` in that order, saved on the iPod (a remote one through its daemon); its id. */
export async function createPlaylistOf(name: string, ids: string[]): Promise<string> {
  if (isRemote()) return await remote.createPlaylist(name, ids);
  const id = await ipod.createPlaylist(name);
  await ipod.setPlaylistTracks(id, ids);
  await ipod.save();
  return id;
}

/** A name safe for a file or folder, as zinc:ipod's download makes it. */
function safeName(name: string, fallback: string): string {
  let s = '';
  for (let i = 0; i < name.length; i++) s += '/\\:*?"<>|'.indexOf(name[i]) >= 0 || name.charCodeAt(i) < 32 ? '_' : name[i];
  s = s.trim();
  while (s.startsWith('.')) s = s.slice(1);
  while (s.endsWith('.')) s = s.slice(0, s.length - 1);
  return s !== '' ? s : fallback;
}
function pad2(n: i32): string { return n < 10 ? `0${n}` : `${n}`; }

/** Copies the tracks to `dir` as Artist/Album/NN Title.ext, a file of the same size already there skipped. */
export async function downloadTracks(tracks: ipod.Track[], dir: string): Promise<ipod.DownloadResult[]> {
  const ids: string[] = [];
  for (const t of tracks) ids.push(t.id);
  if (!isRemote()) return await ipod.download(ids, dir);
  const out: ipod.DownloadResult[] = [];
  for (const t of tracks) {
    const dot = t.path.lastIndexOf('.');
    const ext = dot > t.path.lastIndexOf(':') ? t.path.slice(dot).toLowerCase() : '';
    const nr = t.trackNr > 0 && t.cds > 1 && t.cdNr > 0 ? `${t.cdNr}-${pad2(t.trackNr)} ` : t.trackNr > 0 ? `${pad2(t.trackNr)} ` : '';
    const file = `${dir}/${safeName(t.albumArtist !== '' ? t.albumArtist : t.artist, 'Unknown Artist')}/${safeName(t.album, 'Unknown Album')}/${nr}${safeName(t.title, 'Untitled')}${ext}`;
    let size: number = -1;
    try { size = fs.stat(file).size; } catch (e) { /* not there yet */ }
    if (size === t.size) { out.push({ id: t.id, file: file, error: '', skipped: true }); continue; }
    try { await remote.fetchFile(t, file); out.push({ id: t.id, file: file, error: '', skipped: false }); }
    catch (e) { out.push({ id: t.id, file: file, error: (e as Error).message, skipped: false }); }
  }
  return out;
}

/** Closes the open iPod and ejects it (a remote one is ejected by its daemon, then forgotten here). */
export async function ejectOpen(mountpoint: string): Promise<void> {
  if (isRemote()) { await remote.eject(); remote.disconnect(); return; }
  await closePod();
  await ipod.eject(mountpoint);
}
