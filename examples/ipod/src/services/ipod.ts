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
let artworkSession: i32 = 0;
enum ArtworkCacheState { Ready, Blocked }
class ArtworkRevision {
  revision: i32 = 0;
  state = ArtworkCacheState.Ready;
  error: string = '';
}
const artworkRevisions = new Map<string, ArtworkRevision>();
function cacheState(record: ArtworkRevision, next: ArtworkCacheState, error: string): void {
  if ((next === ArtworkCacheState.Blocked && error === '') || (next === ArtworkCacheState.Ready && error !== '')) throw new Error('Invalid artwork cache state');
  record.state = next;
  record.error = error;
}
function artworkRevision(trackId: string): i32 { const r = artworkRevisions.get(trackId); return r === undefined ? 0 : r.revision; }
const artworkViewers = new Map<i32, (ids: string[]) => void>();
let nextArtworkViewer: i32 = 0;

/** Changes on every close/reopen, even when the next iPod has the same numeric track ids. */
export function coverSession(): i32 { return artworkSession; }
/** Subscribe to successfully saved artwork changes; the disposer removes this exact subscription. */
export function onArtworkChanged(show: (ids: string[]) => void): () => void {
  const id = ++nextArtworkViewer;
  artworkViewers.set(id, show);
  return (): void => { artworkViewers.delete(id); };
}
function endArtworkSession(): void { artworkSession++; artworkRevisions.clear(); }

class CoverOwner {
  session: i32 = artworkSession;
  pod: string = cache.podKey();
  directory: string = cache.cacheDir('covers');
}
function requireCoverOwner(owner: CoverOwner): void {
  if (owner.session !== artworkSession || owner.pod !== cache.podKey()) throw new Error('The iPod changed while reading or changing its cover');
}

/** One per-iPod lock orders reads/publications and artwork writes/deletions across app processes. */
async function lockCovers(owner: CoverOwner): Promise<i32> {
  const deadline = sys.clock() + 5000;
  while (true) {
    requireCoverOwner(owner);
    const lock = fs.tryLock(`${owner.directory}/.lock`);
    if (lock > 0) return lock;
    if (sys.clock() >= deadline) throw new Error('The iPod cover cache is busy; try again');
    await new Promise<void>((resolve: () => void) => { setTimeout(resolve, 25); });
  }
}

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
    const device = await remote.readRemote();
    cache.useIpod(device);
    return await cachedLibrary(device);
  } catch (e) { endArtworkSession(); remote.disconnect(); throw e; }
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

/** The photo albums, none when the Photo Database is damaged: the music is still shown. */
async function photoAlbumsOrNone(): Promise<ipod.PhotoAlbum[]> {
  try { return await ipod.photoAlbums(); } catch (e) { return []; }
}

async function cachedLibrary(known: ipod.Device | null = null): Promise<PodLibrary> {
  const snap = cache.readSnapshot();
  if (snap === null) return await readLibrary();
  const s = snap as cache.LibrarySnapshot;
  let lib: PodLibrary;
  let now: string;
  if (isRemote()) {
    const [device, mark] = await Promise.all([known !== null ? Promise.resolve(known as ipod.Device) : remote.readRemote(), marker()]);   // the free space measured again
    lib = new PodLibrary(device, s.tracks, s.playlists, s.specs, [], []);
    lib.remote = remote.remoteAddress();
    now = mark;
  } else {   // in one queue: the worker keeps this order and answers them without a turn of the loop for each
    const [device, photoAlbums, extras, mark] = await Promise.all([ipod.info(), photoAlbumsOrNone(), ipod.extras(), marker()]);
    lib = new PodLibrary(device, s.tracks, s.playlists, s.specs, photoAlbums, extras);
    now = mark;
  }
  lib.stale = now === '' || now !== s.marker;
  return lib;
}

/** Reads the open iPod's library again (after an add, a restore or a repair, or when the cache was stale), its free space measured
 *  again, and keeps it in the cache. */
export async function readLibrary(): Promise<PodLibrary> {
  const before = await marker();   // taken first: a change while it reads leaves the cache stale, never wrong
  let lib: PodLibrary;
  if (isRemote()) {   // no photos nor notes over /api yet
    const [device, tracks, playlists, specs] = await Promise.all([remote.readRemote(), remote.tracks(), remote.playlists(), remote.specs()]);
    lib = new PodLibrary(device, tracks, playlists, specs, [], []);
    lib.remote = remote.remoteAddress();
  } else {
    const [device, tracks, playlists, specs, photoAlbums, extras] = await Promise.all([ipod.info(), ipod.tracks(), ipod.playlists(), ipod.specs(), photoAlbumsOrNone(), ipod.extras()]);
    lib = new PodLibrary(device, tracks, playlists, specs, photoAlbums, extras);
  }
  if (before !== '') cache.writeSnapshot({ marker: before, device: lib.device, tracks: lib.tracks, playlists: lib.playlists, specs: lib.specs });
  return lib;
}

export async function closePod(): Promise<void> {
  endArtworkSession();
  remote.disconnect();
  if (openMount === '') return;
  openMount = '';
  await ipod.close();
}

/** The iPod was ejected or pulled: zinc:ipod closed it or will fail; forget it here. */
export function forgetPod(): void { endArtworkSession(); openMount = ''; remote.disconnect(); }

/** The track's cover as a PNG file of the cache (the largest the iPod stores), read from the iPod or the daemon the first time; ''
 *  when it has none. */
export async function coverPng(trackId: string): Promise<string> {
  const name = cache.coverName(trackId);
  const owner = new CoverOwner();
  const lock = await lockCovers(owner);
  try { return await readCover(owner, trackId, name); }
  finally { fs.unlock(lock); }
}

/** Called only under the per-iPod lock. Native and remote writers get a private destination, never the published PNG. */
async function readCover(owner: CoverOwner, trackId: string, name: string): Promise<string> {
  requireCoverOwner(owner);
  const record = artworkRevisions.get(trackId);
  if (record !== undefined && record.state === ArtworkCacheState.Blocked) throw new Error(record.error);
  const revision = artworkRevision(trackId);
  const file = `${owner.directory}/${name}`;
  if (fs.exists(file)) return file;
  const temporary = fs.mkdtemp(`${owner.directory}/.cover-`);
  try {
    const staging = `${temporary}/cover.png`;
    const had = isRemote() ? await remote.coverTo(trackId, staging) : await ipod.saveArtwork(trackId, staging);
    requireCoverOwner(owner);
    if (artworkRevision(trackId) !== revision) throw new Error('The artwork changed while its cover was read');
    if (!had) return '';
    fs.rename(staging, file);
    return file;
  } finally { if (!fs.remove(temporary, true)) console.error(`Cannot remove temporary cover directory ${temporary}`); }
}

/** Decode under the same lock: another process cannot delete/replace the published PNG between lookup and readBytes. */
export async function coverImage(trackId: string, size: i32): Promise<i32> {
  const name = cache.coverName(trackId);
  const owner = new CoverOwner();
  const lock = await lockCovers(owner);
  try {
    const file = await readCover(owner, trackId, name);
    requireCoverOwner(owner);
    return file !== '' ? imageFromBytes(fs.readBytes(file)) : -1;
  } finally { fs.unlock(lock); }
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
  await updateMany([{ ids: ids, patch: patch }]);
}

/** One patch for some tracks (updateMany). */
export interface Change { ids: string[]; patch: ipod.TrackInput; }

async function writeChanges(changes: Change[]): Promise<void> {
  for (const c of changes) for (const id of c.ids) await ipod.update(id, c.patch);
  await ipod.save();
}

/** Writes each change, then saves once. Artwork owns the same cache lock as every cover read until obsolete PNGs are gone. */
export async function updateMany(changes: Change[]): Promise<void> {
  if (isRemote()) {
    for (const c of changes) if (c.patch.artworkFile !== undefined) throw new Error('a cover cannot be sent to a remote iPod yet');
    for (const c of changes) await remote.update(c.ids, c.patch);
    return;
  }
  const ids: string[] = [];
  for (const c of changes) if (c.patch.artworkFile !== undefined) for (const id of c.ids) if (ids.indexOf(id) < 0) ids.push(id);
  if (ids.length === 0) { await writeChanges(changes); return; }
  const names = ids.map((id: string) => cache.coverName(id));
  const owner = new CoverOwner();
  const lock = await lockCovers(owner);
  try {
    requireCoverOwner(owner);
    await writeChanges(changes);
    requireCoverOwner(owner);
    let failure = '';
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      let record = artworkRevisions.get(id);
      if (record === undefined) { record = new ArtworkRevision(); artworkRevisions.set(id, record); }
      record.revision++;
      const file = `${owner.directory}/${names[i]}`;
      try {
        if (fs.exists(file) && !fs.remove(file, false)) throw new Error(`Cannot remove obsolete cover ${file}`);
        cacheState(record, ArtworkCacheState.Ready, '');
      } catch (e) {
        const why = `Artwork saved, but its cached cover cannot be invalidated: ${(e as Error).message}`;
        cacheState(record, ArtworkCacheState.Blocked, why);
        if (failure === '') failure = why;
      }
    }
    const viewers: i32[] = [];
    for (const id of artworkViewers.keys()) viewers.push(id);
    for (const id of viewers) {
      const show = artworkViewers.get(id);
      if (show !== undefined) {
        try { show(ids); } catch (e) { console.error(`artwork viewer: ${(e as Error).message}`); }
      }
    }
    if (failure !== '') throw new Error(failure);
  } finally { fs.unlock(lock); }
}

/** Writes `text` as the lyrics in the track's file and sets its lyrics flag, then saves the iPod. The daemon has no route for it yet: a remote
 *  iPod refuses. */
export async function writeLyrics(id: string, text: string): Promise<void> {
  if (isRemote()) throw new Error('lyrics cannot be written to a remote iPod yet');
  await ipod.writeLyrics(id, text);
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
  if (isRemote()) { await remote.eject(); endArtworkSession(); remote.disconnect(); return; }
  await closePod();
  await ipod.eject(mountpoint);
}
