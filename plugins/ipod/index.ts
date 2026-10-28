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
import type { Device, Track, TrackInput, AddResult, Playlist, Snapshot, Check } from './native/ipod.spec';
export type { Device, Track, TrackInput, AddResult, Playlist, Snapshot, Check };

/** iPods mounted on this machine. */
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
/** Copies the database, and the music when `music`, into a new folder of `dir`; resolves with that folder. */
export function backup(dir: string, music: boolean = true): Promise<string> { return N.backup(dir, music); }
export function restoreBackup(folder: string, mountpoint: string): Promise<Device> { return N.restoreBackup(folder, mountpoint); }
/** Tracks whose file is gone and files no track uses. */
export function check(): Promise<Check> { return N.check(); }
/** Fixes what check() finds; saves. */
export function repair(): Promise<Check> { return N.repair(); }
/** Saves nothing: closes, flushes and ejects. Save first if you changed something. */
export function eject(mountpoint: string): Promise<void> { return N.eject(mountpoint); }

const progressCbs: ((phase: string, done: i32, total: i32, detail: string) => void)[] = [];
let listening = false;
/** Progress of long calls. phase: copy (done/total in KiB of the file `detail`), add, save, backup, restore. */
export function onProgress(cb: (phase: string, done: i32, total: i32, detail: string) => void): void {
  progressCbs.push(cb);
  if (listening) return;
  listening = true;
  N.onProgress((phase: string, done: i32, total: i32, detail: string) => { for (const f of progressCbs) f(phase, done, total, detail); });
}
