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
  /** Copies the database (and the music when `music`) into a new folder of `dir`; resolves with that folder. */
  backup(dir: string, music: boolean): Promise<string>;
  /** Copies a backup folder back onto the iPod at `mountpoint` (closed first) and reopens it. */
  restoreBackup(folder: string, mountpoint: string): Promise<Device>;
  check(): Promise<Check>;
  /** Removes the tracks whose file is missing and deletes the orphan files. Saves at the end. */
  repair(): Promise<Check>;
  /** Flushes, closes and ejects (diskutil on macOS, udisksctl or umount on Linux). */
  eject(mountpoint: string): Promise<void>;
  /** phase: copy | artwork | save | backup | restore; done/total: items (copy: bytes of the current file in `detail`). */
  onProgress(cb: (phase: string, done: i32, total: i32, detail: string) => void): void;
}
export default requireNative<Spec>('Ipod');
