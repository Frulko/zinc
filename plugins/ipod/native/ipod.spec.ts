// zinc:ipod native side: libgpod (vendor/libgpod) on one worker thread that owns the open database; every call that
// touches the disk is a Promise settled on the loop (runtime/zrt_jobs.h). Records cross as native records (ZN-850).
import { NativeModule, requireNative } from 'zinc:native';

/** A mounted iPod. Sizes in bytes. */
export interface Device {
  mountpoint: string;
  /** The name shown on the iPod (the master playlist's name), '' before a database exists. */
  name: string;
  /** e.g. "iPod Classic (Black)", "iPod Nano (Silver)" */
  model: string;
  /** Apple's model number without the region letter, e.g. "B147" */
  modelNumber: string;
  /** e.g. "Classic (3rd Gen.)", "Nano with camera (5th Gen.)" */
  generation: string;
  capacityGb: number;
  totalBytes: number;
  freeBytes: number;
  serial: string;
  firewireGuid: string;
  /** iPod_Control/Device/SysInfoExtended exists (read from the device or written by open()). */
  sysInfoExtended: boolean;
  /** The database exists (iPod_Control/iTunes/iTunesDB or the SQLite set of a Nano 6G/7G). */
  hasDatabase: boolean;
  /** Mounted read-only (a journaled HFS+ iPod on Linux): nothing can be written. */
  readOnly: boolean;
  /** Can show artwork; checksum: none | hash58 | hash72 | hashAB. */
  artwork: boolean;
  checksum: string;
  /** disk: mounted, its files readable; usb: plugged in but not mounted (no mountpoint: only what USB tells). */
  connection: string;
  /** The version the iPod shows in Settings > About, e.g. "2.0.2"; '' when unknown. */
  firmware: string;
  /** The USB product id (0x1261 for a Classic 7G...), 0 when not seen on USB. */
  usbProduct: i32;
}

export interface Track {
  /** Stable id (the database's 64-bit dbid, in hex). */
  id: string;
  title: string; artist: string; album: string; albumArtist: string; genre: string; composer: string; comment: string;
  trackNr: i32; tracks: i32; cdNr: i32; cds: i32; year: i32;
  /** 0..5 stars */
  rating: i32;
  playCount: i32; bitrate: i32; sampleRate: i32;
  durationMs: number;
  size: number;
  /** audio | podcast | audiobook | video | musicvideo | tvshow */
  mediaType: string;
  /** The file, relative to the mountpoint ("iPod_Control/Music/F12/ABCD.mp3"). */
  path: string;
  artwork: boolean;
  /** Unix seconds; 0 when never. */
  added: number; lastPlayed: number;
}

/** What to add or change. Empty strings and 0 keep what the file's tags (or the track) say. */
export interface TrackInput {
  /** The file to copy (add) — ignored by update. */
  file: string;
  title?: string; artist?: string; album?: string; albumArtist?: string; genre?: string; composer?: string; comment?: string;
  trackNr?: i32; tracks?: i32; cdNr?: i32; cds?: i32; year?: i32; rating?: i32;
  mediaType?: string;
  /** An image file for the cover; without it, the picture embedded in the file is used. */
  artworkFile?: string;
}

export interface AddResult { file: string; id: string; error: string; }

/** A track copied from the iPod to the computer: `file` is where it is (or would be), `skipped` when a file of the same size was
 *  already there, `error` '' when it worked. */
export interface DownloadResult { id: string; file: string; error: string; skipped: boolean; }

export interface Playlist {
  id: string;
  name: string;
  /** The master playlist (every track; its name is the iPod's name). */
  master: boolean;
  podcasts: boolean;
  smart: boolean;
  trackIds: string[];
}

export interface Snapshot { id: string; created: number; bytes: number; }

export interface Check {
  /** Tracks whose file is gone from the iPod. */
  missing: string[];
  /** Files under iPod_Control/Music that no track points to (relative paths). */
  orphans: string[];
  orphanBytes: number;
}

/** One line of specs(): a group ("iPod", "Storage", "Library", "Artwork", "SysInfoExtended"), a name and its value as shown. */
export interface SpecItem { group: string; name: string; value: string; }

/** A cover in RGBA pixels (imageFromPixels takes them as they are); width 0 when the track has none. */
export interface Picture { width: i32; height: i32; rgba: u8[]; }

/** A photo album of the iPod; the master one ("Photo Library") holds every photo. Photo ids are strings like the tracks'. */
export interface PhotoAlbum { id: string; name: string; master: boolean; photoIds: string[]; }

/** A file the iPod keeps beside its music: a note (Notes), a contact card (Contacts), a calendar (Calendars), a voice
 *  recording (Recordings). `kind` is note | contact | calendar | recording, `path` is absolute. */
export interface Extra { kind: string; name: string; path: string; bytes: number; modified: number; }

/** A backup on the computer, from the manifest written with it. */
export interface Backup {
  folder: string;
  /** The iPod's name and serial when it was taken. */
  name: string; serial: string;
  created: number;
  /** Size of the database part (the music is shared between the backups of an iPod). */
  bytes: number;
  /** It has the music (in the shared Music folder beside it). */
  music: boolean;
  tracks: i32;
  /** Taken by the plugin before the first change of a session. */
  auto: boolean;
}

export interface Spec extends NativeModule {
  /** iPods mounted on this machine (the volumes holding iPod_Control). */
  detect(): Promise<Device[]>;
  /** Opens the iPod at `mountpoint`; with `init`, writes a fresh database when there is none (model: e.g. "MB147", '' to
   *  guess; name: the iPod's name). Writes SysInfoExtended when it is missing (read from the device over USB, else
   *  built from SysInfo). One iPod is open at a time. */
  open(mountpoint: string, init: boolean, model: string, name: string): Promise<Device>;
  /** The open iPod, its free space measured again. */
  info(): Promise<Device>;
  close(): Promise<void>;
  tracks(): Promise<Track[]>;
  playlists(): Promise<Playlist[]>;
  /** Copies the files and adds them (to the playlist `playlist` too when not ''). Refuses the whole batch, before copying
   *  anything, when it does not fit. Each item has its own result. Saves at the end. */
  add(items: TrackInput[], playlist: string): Promise<AddResult[]>;
  update(id: string, fields: TrackInput): Promise<Track>;
  /** Removes the tracks and deletes their files. Saves at the end. */
  remove(ids: string[]): Promise<void>;
  setArtwork(id: string, imageFile: string): Promise<void>;
  /** Writes the track's cover as a PNG (the largest size the iPod stores); false when it has none. */
  saveArtwork(id: string, pngFile: string): Promise<boolean>;
  createPlaylist(name: string): Promise<string>;
  renamePlaylist(id: string, name: string): Promise<void>;
  deletePlaylist(id: string): Promise<void>;
  /** Replaces the playlist's tracks (adds, removes and reorders in one call). */
  setPlaylistTracks(id: string, trackIds: string[]): Promise<void>;
  /** Writes the database (a snapshot of the old one is taken first). */
  save(): Promise<void>;
  snapshots(): Promise<Snapshot[]>;
  /** Puts back the database files of a snapshot and reopens. */
  restoreSnapshot(id: string): Promise<void>;
  /** Everything known about the open iPod: model, firmware, serial, storage by kind, library counts, artwork formats, every key
   *  of SysInfoExtended. */
  specs(): Promise<SpecItem[]>;
  /** The track's cover at about `size` pixels (the iPod's nearest stored size, scaled); width 0 when it has none. */
  artwork(id: string, size: i32): Promise<Picture>;
  /** The photo albums of the open iPod (its Photo Database); none when it holds no photos. */
  photoAlbums(): Promise<PhotoAlbum[]>;
  /** A photo at about `size` pixels on its long side (the iPod's nearest stored size, scaled). */
  photo(id: string, size: i32): Promise<Picture>;
  /** The notes, contacts, calendars and voice recordings of the open iPod, by kind then name. */
  extras(): Promise<Extra[]>;
  /** Copies the database into a new folder of `dir` ('' = the iPod's folder of the default place, ZINC_HOME/ipod/<serial>), and
   *  with `music` the music into the Music folder beside it, copying only the files it does not have yet; resolves with the folder. */
  backup(dir: string, music: boolean): Promise<string>;
  /** The backups in `dir` and its iPod folders ('' = the default place), newest first. */
  backups(dir: string): Promise<Backup[]>;
  /** Deletes one backup folder (a folder of backups() under the default place; anything else is refused). The shared Music
   *  folder is kept. */
  deleteBackup(folder: string): Promise<void>;
  /** Copies tracks of the open iPod into `dir` as Artist/Album/NN Title.ext (names from the tags, made safe for any disk);
   *  a file of the same size already there is skipped. Reads the iPod only. One result per id. */
  download(ids: string[], dir: string): Promise<DownloadResult[]>;
  /** Copies a backup folder back onto the iPod at `mountpoint` (closed first) and reopens it. */
  restoreBackup(folder: string, mountpoint: string): Promise<Device>;
  check(): Promise<Check>;
  /** Removes the tracks whose file is missing and deletes the orphan files. Saves at the end. */
  repair(): Promise<Check>;
  /** Mounts the disk `device` (disk4 on macOS, sdb2 on Linux), or with '' every iPod plugged in but not mounted (macOS: the
   *  external disks whose media name says iPod). Changes nothing on the iPod. */
  mount(device: string): Promise<void>;
  /** Flushes, closes and ejects (diskutil on macOS, udisksctl or umount on Linux). */
  eject(mountpoint: string): Promise<void>;
  /** phase: copy | add | download | artwork | save | backup | restore; done/total: items (copy: bytes of the current file in `detail`). */
  onProgress(cb: (phase: string, done: i32, total: i32, detail: string) => void): void;
}
export default requireNative<Spec>('Ipod');
