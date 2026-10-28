// zinc:ipod stand-in (sim target, ZINC_NATIVE=sim): one iPod Classic in memory, "Zinc Pod" at /Volumes/ZINCPOD, with
// the same answers as the native side for the same calls, so a program and its tests run without an iPod or libgpod.
// The records of ipod.spec.ts (this file stands in for it, so it declares them).
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

const MP = '/Volumes/ZINCPOD';
const GB = 1024 * 1024 * 1024;
let open = false, used = 0, seq = 0, saves = 0;
const tracks: Track[] = [];
const taken: Backup[] = [];
const playlists: Playlist[] = [];
let cb: ((phase: string, done: i32, total: i32, detail: string) => void) | null = null;

function device(): Device {
  return { mountpoint: MP, name: 'Zinc Pod', model: 'Classic (Silver)', modelNumber: 'B029', generation: 'Classic', capacityGb: 80,
    totalBytes: 80 * GB, freeBytes: 80 * GB - used, serial: '8K1234ABCDE', firewireGuid: '000A27001234ABCD',
    sysInfoExtended: open, hasDatabase: open, readOnly: false, artwork: true, checksum: 'hash58', connection: 'disk', firmware: '1.1.2', usbProduct: 0x1261 };
}
function hex(n: number): string { const d = '0123456789abcdef'; let s = ''; for (let k = 0; k < 16; k++) { s = d[n % 16] + s; n = Math.floor(n / 16); } return s; }
function fail<T>(m: string): Promise<T> { return Promise.reject<T>(new Error(m)); }
// a Promise<void> of its own: one made by fail<void>() is not one yet (backlog/later.md)
function failV(m: string): Promise<void> { return Promise.reject(new Error(m)); }
const need = (): string => open ? '' : 'no iPod is open';
const none = (): Check => ({ missing: [] as string[], orphans: [] as string[], orphanBytes: 0 });
function base(file: string): string { const s = file.slice(file.lastIndexOf('/') + 1); const d = s.lastIndexOf('.'); return d > 0 ? s.slice(0, d) : s; }
function find(id: string): Track | null { for (const t of tracks) if (t.id === id) return t; return null; }
function playlist(id: string): Playlist | null { for (const p of playlists) if (p.id === id || p.name === id) return p; return null; }
function apply(t: Track, f: TrackInput): void {
  if (f.title !== undefined) t.title = f.title;
  if (f.artist !== undefined) t.artist = f.artist;
  if (f.album !== undefined) t.album = f.album;
  if (f.genre !== undefined) t.genre = f.genre;
  if (f.rating !== undefined) t.rating = f.rating;
  if (f.mediaType !== undefined) t.mediaType = f.mediaType;
}

export default {
  detect: (): Promise<Device[]> => Promise.resolve([device()]),
  open: (mp: string, _init: boolean, _model: string, _name: string): Promise<Device> => {
    if (mp !== MP) return fail(mp + ' is not an iPod (no iPod_Control folder)');
    if (!open) { open = true; playlists.push({ id: hex(++seq), name: 'Zinc Pod', master: true, podcasts: false, smart: false, trackIds: [] }); }
    return Promise.resolve(device());
  },
  info: (): Promise<Device> => need() !== '' ? fail<Device>(need()) : Promise.resolve(device()),
  close: (): Promise<void> => Promise.resolve(),
  tracks: (): Promise<Track[]> => Promise.resolve(tracks.slice()),
  playlists: (): Promise<Playlist[]> => Promise.resolve(playlists.slice()),
  add: (items: TrackInput[], pl: string): Promise<AddResult[]> => {
    if (need() !== '') return fail<AddResult[]>(need());
    const out: AddResult[] = [];
    let target = pl === '' ? null : playlist(pl);
    if (pl !== '' && !target) { target = { id: hex(++seq), name: pl, master: false, podcasts: false, smart: false, trackIds: [] }; playlists.push(target); }
    let i = 0;
    for (const it of items) {
      i++;
      const ext = it.file.slice(it.file.lastIndexOf('.')).toLowerCase();
      if (['.mp3', '.m4a', '.aac', '.m4b', '.wav', '.aif', '.aiff', '.mp4', '.m4v', '.mov'].indexOf(ext) < 0) { out.push({ file: it.file, id: '', error: 'an iPod cannot play ' + ext + ' files (convert to MP3, AAC or ALAC)' }); continue; }
      const t: Track = { id: hex(++seq), title: base(it.file), artist: '', album: '', albumArtist: '', genre: '', composer: '', comment: '',
        trackNr: 0, tracks: 0, cdNr: 0, cds: 0, year: 0, rating: 0, playCount: 0, bitrate: 128, sampleRate: 44100, durationMs: 180000, size: 3000000,
        mediaType: ext === '.m4b' ? 'audiobook' : 'audio', path: 'iPod_Control/Music/F00/ZN' + seq + ext, artwork: it.artworkFile !== undefined, added: 0, lastPlayed: 0 };
      apply(t, it);
      tracks.push(t); used += t.size;
      playlists[0].trackIds.push(t.id);
      if (target) target.trackIds.push(t.id);
      out.push({ file: it.file, id: t.id, error: '' });
      cb?.('add', i, items.length, it.file);
    }
    saves++;
    return Promise.resolve(out);
  },
  update: (id: string, f: TrackInput): Promise<Track> => { const t = find(id); if (!t) return fail('no track ' + id); apply(t, f); return Promise.resolve(t); },
  remove: (ids: string[]): Promise<void> => {
    for (const id of ids) { const k = tracks.findIndex((t: Track) => t.id === id); if (k >= 0) { used -= tracks[k].size; tracks.splice(k, 1); } for (const p of playlists) p.trackIds = p.trackIds.filter((x: string) => x !== id); }
    saves++;
    return Promise.resolve();
  },
  setArtwork: (id: string, _f: string): Promise<void> => { const t = find(id); if (!t) return failV('no track ' + id); t.artwork = true; return Promise.resolve(); },
  saveArtwork: (id: string, _png: string): Promise<boolean> => { const t = find(id); return t ? Promise.resolve(t.artwork) : fail('no track ' + id); },
  createPlaylist: (name: string): Promise<string> => { const p: Playlist = { id: hex(++seq), name: name, master: false, podcasts: false, smart: false, trackIds: [] }; playlists.push(p); return Promise.resolve(p.id); },
  renamePlaylist: (id: string, name: string): Promise<void> => { const p = playlist(id); if (!p) return failV('no playlist ' + id); p.name = name; return Promise.resolve(); },
  deletePlaylist: (id: string): Promise<void> => {
    const k = playlists.findIndex((p: Playlist) => p.id === id);
    if (k < 0) return failV('no playlist ' + id);
    if (playlists[k].master) return failV('the master playlist cannot be deleted');
    playlists.splice(k, 1);
    return Promise.resolve();
  },
  setPlaylistTracks: (id: string, ids: string[]): Promise<void> => { const p = playlist(id); if (!p) return failV('no playlist ' + id); p.trackIds = ids.slice(); return Promise.resolve(); },
  save: (): Promise<void> => { saves++; return Promise.resolve(); },
  snapshots: (): Promise<Snapshot[]> => { const s: Snapshot[] = []; for (let k = Math.min(saves, 5); k > 0; k--) s.push({ id: '20261028-12000' + k, created: 0, bytes: 1024 }); return Promise.resolve(s); },
  restoreSnapshot: (_id: string): Promise<void> => Promise.resolve(),
  backup: (dir: string, music: boolean): Promise<string> => {
    const folder = (dir === '' ? '~/.zinc/ipod/8K1234ABCDE' : dir) + '/20261028-12000' + taken.length;
    taken.unshift({ folder: folder, name: 'Zinc Pod', serial: '8K1234ABCDE', created: 0, bytes: 1024, music: music, tracks: tracks.length, auto: false });
    return Promise.resolve(folder);
  },
  restoreBackup: (_f: string, mp: string): Promise<Device> => mp === MP ? Promise.resolve(device()) : fail(mp + ' is not an iPod'),
  specs: (): Promise<SpecItem[]> => {
    if (need() !== '') return fail<SpecItem[]>(need());
    const d = device();
    const out: SpecItem[] = [
      { group: 'iPod', name: 'Model', value: d.model }, { group: 'iPod', name: 'Generation', value: d.generation },
      { group: 'iPod', name: 'Model number', value: d.modelNumber }, { group: 'iPod', name: 'Capacity', value: '80 GB' },
      { group: 'iPod', name: 'Serial number', value: d.serial }, { group: 'iPod', name: 'FireWire GUID', value: d.firewireGuid },
      { group: 'iPod', name: 'Firmware', value: d.firmware },
      { group: 'Storage', name: 'Free', value: Math.round(d.freeBytes / GB) + ' GB' },
      { group: 'Library', name: 'Tracks', value: '' + tracks.length }, { group: 'Library', name: 'Playlists', value: '' + (playlists.length - 1) },
      { group: 'Artwork', name: 'Formats', value: '1055 (128x128), 1060 (320x320), 1061 (56x56)' },
      { group: 'SysInfoExtended', name: 'FamilyID', value: '11' }];
    return Promise.resolve(out);
  },
  artwork: (id: string, size: i32): Promise<Picture> => {
    const t = find(id);
    if (!t) return fail<Picture>('no track ' + id);
    if (!t.artwork) return Promise.resolve({ width: 0, height: 0, rgba: [] as u8[] });
    const px: u8[] = [];   // a gradient that depends on the track, so covers differ
    const h = parseInt(id.slice(-2), 16);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { px.push((x * 255 / size) as u8); px.push(h as u8); px.push((y * 255 / size) as u8); px.push(255); }
    return Promise.resolve({ width: size, height: size, rgba: px });
  },
  backups: (_dir: string): Promise<Backup[]> => Promise.resolve(taken.slice()),
  check: (): Promise<Check> => Promise.resolve(none()),
  repair: (): Promise<Check> => Promise.resolve(none()),
  eject: (_mp: string): Promise<void> => { open = false; return Promise.resolve(); },
  onProgress: (f: (phase: string, done: i32, total: i32, detail: string) => void): void => { cb = f; },
};
