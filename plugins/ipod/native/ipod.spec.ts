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
  /** Beats per minute, 0 when unknown. */
  bpm: i32;
  /** Times the song was skipped on the iPod, and the last time (Unix seconds, 0 when never). */
  skipCount: i32; lastSkipped: number;
  /** iTunes' Grouping, and the description (podcast show notes). */
  grouping: string; description: string;
  /** The file's kind as iTunes names it ("MPEG audio file", "AAC audio file"...). */
  kind: string;
  /** Part of a compilation (iTunes' "Album is a compilation of songs by various artists"). */
  compilation: boolean;
  /** The names the iPod sorts by ('' when the plain name is used). */
  sortTitle: string; sortArtist: string; sortAlbum: string; sortAlbumArtist: string; sortComposer: string;
  /** Where the song starts and stops playing, in milliseconds (stopMs 0: at its end). */
  startMs: i32; stopMs: i32;
  /** Volume adjustment, -100 to 100 percent (0: none). */
  volume: i32;
  /** Skipped when shuffling; remembers the playback position; has lyrics in its file (the iPod shows them). */
  skipWhenShuffling: boolean; rememberPosition: boolean; lyrics: boolean;
  /** Last changed (Unix seconds, 0 when never). */
  modified: number;
}

/** What to add or change. A field left out keeps what the file's tags (add) or the track (update) say; a field given is written,
 *  '' , 0 and false included: `update(id, { file: '', comment: '' })` clears the comment. */
export interface TrackInput {
  /** The file to copy (add) — ignored by update. */
  file: string;
  title?: string; artist?: string; album?: string; albumArtist?: string; genre?: string; composer?: string; comment?: string;
  grouping?: string; description?: string;
  trackNr?: i32; tracks?: i32; cdNr?: i32; cds?: i32; year?: i32; rating?: i32;
  /** Beats per minute (0 clears it); smart playlists can select on it. */
  bpm?: i32;
  mediaType?: string;
  compilation?: boolean;
  sortTitle?: string; sortArtist?: string; sortAlbum?: string; sortAlbumArtist?: string; sortComposer?: string;
  /** Milliseconds; stopMs 0 plays to the end. */
  startMs?: i32; stopMs?: i32;
  /** -100 to 100 percent. */
  volume?: i32;
  skipWhenShuffling?: boolean; rememberPosition?: boolean; lyrics?: boolean;
  /** Sets the play count (0: iTunes' Reset Plays). */
  playCount?: i32;
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
  /** The rules of a smart playlist (smart true); empty otherwise. */
  rules: SmartRules;
}

/** One rule of a smart playlist, as iTunes writes it ("Play count is 0", "BPM is in the range 120 to 130", "Last played is in the last
 *  2 weeks"). Values use the units of Track: rating in stars, durationMs in milliseconds, size in bytes, dates in Unix seconds.
 *
 *  field (SmartField) and its kind:
 *  - text: title, album, artist, albumArtist, composer, genre, comment, grouping, kind (the file type), tvShow
 *  - number: bitrate, sampleRate, year, trackNr, cdNr, size, durationMs, playCount, skipCount, rating, bpm, season
 *  - date: added, modified, lastPlayed, lastSkipped
 *  - yes/no: compilation; playlist (`text` is the playlist's id); videoKind (`value` holds media-type bits)
 *  action (SmartAction), by kind:
 *  - text: is, isNot, contains, doesNotContain, startsWith, doesNotStartWith, endsWith, doesNotEndWith
 *  - number: is, isNot, greaterThan, lessThan, inRange, notInRange
 *  - date: is, isNot, greaterThan (after), notGreaterThan, lessThan (before), notLessThan, inRange, notInRange, inTheLast, notInTheLast
 *  - compilation: is (is set), isNot; playlist: is (in the playlist), isNot; videoKind: is, isNot
 *  A field or action this plugin does not name reads as its number in hex ("0x5a"): the rule is kept on the iPod as it is, but cannot
 *  be written by setSmartRules. */
export interface SmartRule {
  field: string;
  action: string;
  /** The text of a text rule; the playlist id of a playlist rule. */
  text: string;
  /** The number or date; the first bound of inRange/notInRange; the count of inTheLast/notInTheLast. */
  value: number;
  /** The second bound of inRange/notInRange. */
  value2: number;
  /** inTheLast/notInTheLast: minutes | hours | days | weeks | months | years ('' otherwise; "seconds" for a unit iTunes has no name for). */
  units: string;
}

/** "Limit to 25 songs selected by most recently added". type: none | songs | minutes | hours | MB | GB. sort: random | title | album |
 *  artist | genre | mostRecentlyAdded | leastRecentlyAdded | mostOftenPlayed | leastOftenPlayed | mostRecentlyPlayed |
 *  leastRecentlyPlayed | highestRating | lowestRating. */
export interface SmartLimit { type: string; value: number; sort: string; }

/** What fills a smart playlist. match: all | any. No rule matches every track. */
export interface SmartRules {
  match: string;
  rules: SmartRule[];
  limit: SmartLimit;
  /** Live updating: re-evaluated whenever the plugin saves (the iPod itself shows the members written at the last save). */
  liveUpdate: boolean;
  /** Match only checked songs. */
  checkedOnly: boolean;
  /** False when a rule or the limit uses something the plugin cannot evaluate (a field newer than libgpod): its members are kept as
   *  iTunes or the iPod wrote them, and the rules are shown read-only. Ignored by createSmartPlaylist and setSmartRules. */
  refreshable: boolean;
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

/** Tracks that are one song (analyze()). The copy to keep comes first, by this score, criterion after criterion: lossless first,
 *  then the higher bitrate (within 5% is a tie), the higher sample rate, more tags filled (title, artist, album, album artist,
 *  genre, composer), a cover, more of the track and disc numbers, a year, then the one added first. */
export interface DuplicateGroup {
  /** The copies, the one to keep first. */
  trackIds: string[];
  /** Why they are one song: tags (the same title and artist, the same album or one without, durations within 2 s), file
   *  (byte-identical files) and audio (the same Chromaprint fingerprint); one or more. */
  reasons: string[];
  /** The criterion the first copy wins by against the second ("lossless", "320 kbps against 128"...). */
  keepWhy: string;
  /** What the score sees of each copy, in trackIds' order ("MP3 · 128 kbps · 44.1 kHz · 4 tags · cover"). */
  quality: string[];
  /** Bytes freed by keeping only the first copy. */
  savedBytes: number;
}

/** What analyze() finds on the open iPod. Ids are tracks' ids, except emptyPlaylists (playlists' ids). */
export interface Analysis {
  groups: DuplicateGroup[];
  /** Music tracks without a cover. */
  noArtwork: string[];
  /** Music tracks without a title, an artist or an album. */
  missingTags: string[];
  /** check(): tracks whose file is gone, files no track uses. */
  missing: string[];
  orphans: string[];
  orphanBytes: number;
  /** Playlists (not smart) without a track. */
  emptyPlaylists: string[];
  /** Fingerprints computed by this analysis, taken from the cache, and the files that gave none (unreadable, too short or silent). */
  fingerprinted: i32;
  fromCache: i32;
  noFingerprint: i32;
}

/** Plays heard away from the iPod (on the computer, a Sonos speaker, a Subsonic client) to count on it: `count` more plays of the
 *  track `id`, the last one at `at` (Unix seconds). */
export interface Play { id: string; count: i32; at: number; }

/** One group to merge: the track kept and the copies removed. */
export interface MergeGroup { keep: string; remove: string[]; }

/** What a merge did to one group: the copies removed, the bytes freed, the playlist places moved to the kept track, the fields it
 *  took from the removed copies ("album", "cover"...), its play count after; `error` when the group was left as it was. */
export interface MergeResult { keep: string; removed: string[]; freedBytes: number; playlistPlaces: i32; filled: string[]; playCount: i32; error: string; }

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
  /** Creates a smart playlist and fills it from its rules (save() writes it); resolves with its id. Refused on a Nano 6G/7G (its
   *  SQLite database keeps no smart playlists) and for a rule it cannot write. */
  createSmartPlaylist(name: string, rules: SmartRules): Promise<string>;
  /** Replaces a smart playlist's rules and refills it (save() writes it). */
  setSmartRules(id: string, rules: SmartRules): Promise<void>;
  /** Refills every smart playlist the plugin can evaluate, live updating or not, and saves. */
  refreshSmartPlaylists(): Promise<void>;
  /** Writes the database (a snapshot of the old one is taken first), after refilling the live smart playlists from the tracks as
   *  they are now. Every call that saves does the same. */
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
  /** Looks for duplicates (tags, identical files and, with `fingerprints`, the audio's Chromaprint fingerprint), music without a
   *  cover or tags, the files check() finds and empty playlists. Reads the iPod only; the fingerprints are cached on the computer (beside
   *  the iPod's backups, by track, size and file time), so the next analysis decodes only what changed. */
  analyze(fingerprints: boolean): Promise<Analysis>;
  /** Merges each group into its kept track (the tags and cover it lacks, play counts summed, the higher rating, the last played, the
   *  first added, the removed copies' playlist places), then removes the other copies and their files; one save at the end. */
  merge(groups: MergeGroup[]): Promise<MergeResult[]>;
  /** Counts plays on the iPod, as the iPod counts its own: each track's play count goes up by `count` and its last played becomes `at`
   *  when later. Tracks no longer there are skipped. One save at the end (after the session's restore point); resolves with the tracks
   *  counted, as they are now. */
  played(plays: Play[]): Promise<Track[]>;
  /** Mounts the disk `device` (disk4 on macOS, sdb2 on Linux), or with '' every iPod plugged in but not mounted (macOS: the
   *  external disks whose media name says iPod). Changes nothing on the iPod. */
  mount(device: string): Promise<void>;
  /** Flushes, closes and ejects (diskutil on macOS, udisksctl or umount on Linux). */
  eject(mountpoint: string): Promise<void>;
  /** phase: copy | add | download | artwork | save | backup | restore | hash | fingerprint | merge; done/total: items (copy: bytes of the current file in `detail`). */
  onProgress(cb: (phase: string, done: i32, total: i32, detail: string) => void): void;
}
export default requireNative<Spec>('Ipod');
