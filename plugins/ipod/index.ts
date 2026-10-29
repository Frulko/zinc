// zinc:ipod — classic iPods (Classic, Nano 1G-7G, Mini, Video, Shuffle) over libgpod: find them, open or initialise
// one, read and change its tracks and playlists with their covers, and keep it safe: the free space is checked before
// anything is copied, every save keeps a snapshot of the old database, backups and restores, a check that finds missing
// and orphan files, and a clean eject. One iPod is open at a time; every call that touches the disk is a Promise.
//
//   const [pod] = await ipod.detect();
//   await ipod.open(pod.mountpoint);
//   await ipod.add(['/Music/song.mp3'], 'Road trip');     // tags, duration and cover come from the file
//   for (const t of await ipod.tracks()) console.log(t.artist, '-', t.title);
//   await ipod.eject(pod.mountpoint);
import N from './native/ipod.spec';
import type { Device, Track, TrackInput, AddResult, Playlist, Snapshot, Check, SpecItem, Picture, Backup, PhotoAlbum, Extra, DownloadResult, Analysis, DuplicateGroup, MergeGroup, MergeResult, Play } from './native/ipod.spec';
export type { Play, Analysis, DuplicateGroup, MergeGroup, MergeResult, DownloadResult, Device, Track, TrackInput, AddResult, Playlist, Snapshot, Check, SpecItem, Picture, Backup, PhotoAlbum, Extra };
import { imageFromPixels } from 'zinc:gfx';

/** iPods on this machine: mounted ones (connection 'disk'), and those plugged in by USB but not mounted ('usb', no mountpoint). */
export function detect(): Promise<Device[]> { return N.detect(); }
/** Opens an iPod. `init`: write a fresh database when it has none (model e.g. "MB147", '' to guess; name shown on the
 *  iPod). SysInfoExtended is written when missing. */
export function open(mountpoint: string, init: boolean = false, model: string = '', name: string = ''): Promise<Device> { return N.open(mountpoint, init, model, name); }
/** The open iPod, with its free space measured again. */
export function info(): Promise<Device> { return N.info(); }
export function close(): Promise<void> { return N.close(); }

export function tracks(): Promise<Track[]> { return N.tracks(); }
export function playlists(): Promise<Playlist[]> { return N.playlists(); }

/** Copies files to the iPod (MP3, AAC, ALAC, WAV, AIFF, M4B, MP4/M4V video) and adds them, to `playlist` too (a name or an
 *  id; created when missing). The batch is refused before any copy when it does not fit. Saves at the end. */
export function add(files: string[], playlist: string = ''): Promise<AddResult[]> {
  const items: TrackInput[] = [];
  for (const f of files) items.push({ file: f });
  return N.add(items, playlist);
}
/** add() with fields that override the tags (title, artist, rating, mediaType 'podcast' | 'audiobook'..., artworkFile). */
export function addWith(items: TrackInput[], playlist: string = ''): Promise<AddResult[]> { return N.add(items, playlist); }
/** Changes fields of a track (only those given); save() writes it. */
export function update(id: string, fields: TrackInput): Promise<Track> { return N.update(id, fields); }
/** Removes tracks and deletes their files; saves. */
export function remove(ids: string[]): Promise<void> { return N.remove(ids); }
export function setArtwork(id: string, imageFile: string): Promise<void> { return N.setArtwork(id, imageFile); }
/** Writes a track's cover as a PNG file; false when it has none. */
export function saveArtwork(id: string, pngFile: string): Promise<boolean> { return N.saveArtwork(id, pngFile); }

export function createPlaylist(name: string): Promise<string> { return N.createPlaylist(name); }
export function renamePlaylist(id: string, name: string): Promise<void> { return N.renamePlaylist(id, name); }
export function deletePlaylist(id: string): Promise<void> { return N.deletePlaylist(id); }
/** Sets the playlist's tracks, in order. */
export function setPlaylistTracks(id: string, trackIds: string[]): Promise<void> { return N.setPlaylistTracks(id, trackIds); }

/** Writes the database; the previous one is kept as a snapshot (the last five). */
export function save(): Promise<void> { return N.save(); }
export function snapshots(): Promise<Snapshot[]> { return N.snapshots(); }
export function restoreSnapshot(id: string): Promise<void> { return N.restoreSnapshot(id); }
/** Everything known about the open iPod, as groups of name and value (model, firmware, storage, library, artwork, SysInfoExtended). */
export function specs(): Promise<SpecItem[]> { return N.specs(); }
/** A track's cover in RGBA pixels at about `size` pixels; width 0 when it has none. */
export function artwork(id: string, size: i32 = 300): Promise<Picture> { return N.artwork(id, size); }
/** A track's cover as a runtime image for `<Image image={...} />` or drawImage; -1 when it has none. destroyImage frees it. */
export async function cover(id: string, size: i32 = 300): Promise<i32> {
  const p = await N.artwork(id, size);
  return p.width > 0 ? imageFromPixels(p.rgba, p.width, p.height) : -1;
}
/** The photo albums of the open iPod; the master one holds every photo. */
export function photoAlbums(): Promise<PhotoAlbum[]> { return N.photoAlbums(); }
/** A photo in RGBA pixels at about `size` pixels on its long side. */
export function photo(id: string, size: i32 = 300): Promise<Picture> { return N.photo(id, size); }
/** A photo as a runtime image for `<Image image={...} />`; -1 when it cannot be read. destroyImage frees it. */
export async function photoImage(id: string, size: i32 = 300): Promise<i32> {
  const p = await N.photo(id, size);
  return p.width > 0 ? imageFromPixels(p.rgba, p.width, p.height) : -1;
}
/** The notes, contacts, calendars and voice recordings of the open iPod. */
export function extras(): Promise<Extra[]> { return N.extras(); }
/** Copies the database into a new folder of `dir` ('' = ZINC_HOME/ipod/<serial>), and with `music` the music into the Music folder
 *  beside it (only the files it does not have yet); resolves with the folder. A first change of a session backs up the database by
 *  itself. */
export function backup(dir: string = '', music: boolean = true): Promise<string> { return N.backup(dir, music); }
/** The backups of `dir` ('' = the default place, every iPod), newest first. */
export function backups(dir: string = ''): Promise<Backup[]> { return N.backups(dir); }
/** Deletes a backup folder of backups(); refused outside the default place (ZINC_IPOD_BACKUPS, ZINC_HOME/ipod or ~/.zinc/ipod). */
export function deleteBackup(folder: string): Promise<void> { return N.deleteBackup(folder); }
/** Copies tracks from the iPod into `dir` as Artist/Album/NN Title.ext, skipping the files already there with the same size. */
export function download(ids: string[], dir: string): Promise<DownloadResult[]> { return N.download(ids, dir); }
export function restoreBackup(folder: string, mountpoint: string): Promise<Device> { return N.restoreBackup(folder, mountpoint); }
/** Tracks whose file is gone and files no track uses. */
export function check(): Promise<Check> { return N.check(); }
/** Fixes what check() finds; saves. */
export function repair(): Promise<Check> { return N.repair(); }
/** Finds what can be cleaned up: duplicates (by tags, identical files and, with `fingerprints`, the sound itself), music without a
 *  cover or tags, the files check() finds, empty playlists. Reads the iPod only; fingerprints are cached on the computer. */
export function analyze(fingerprints: boolean = true): Promise<Analysis> { return N.analyze(fingerprints); }
/** Merges duplicates: each group's kept track takes the tags and cover it lacks, the play counts, the higher rating and the removed
 *  copies' playlist places; the other copies and their files are removed; one save. */
export function merge(groups: MergeGroup[]): Promise<MergeResult[]> { return N.merge(groups); }
/** Counts plays heard away from the iPod (the computer, a speaker, a Subsonic client) as the iPod counts its own: play count up by
 *  `count`, last played moved to `at` (Unix seconds) when later; tracks no longer there are skipped. Saves once; resolves with the
 *  tracks counted. */
export function played(plays: Play[]): Promise<Track[]> { return N.played(plays); }
/** Mounts an iPod seen over USB but not mounted: '' = every such iPod (macOS), or a disk name (disk4, sdb2). Writes nothing. */
export function mount(device: string = ''): Promise<void> { return N.mount(device); }
/** Saves nothing: closes, flushes and ejects. Save first if you changed something. */
export function eject(mountpoint: string): Promise<void> { return N.eject(mountpoint); }

const progressCbs: ((phase: string, done: i32, total: i32, detail: string) => void)[] = [];
let listening = false;
/** Progress of long calls. phase: copy (done/total in KiB of the file `detail`), add, download (files), save, backup, restore, hash and
 *  fingerprint (analyze: tracks), merge (groups). */
export function onProgress(cb: (phase: string, done: i32, total: i32, detail: string) => void): void {
  progressCbs.push(cb);
  if (listening) return;
  listening = true;
  N.onProgress((phase: string, done: i32, total: i32, detail: string) => { for (const f of progressCbs) f(phase, done, total, detail); });
}
