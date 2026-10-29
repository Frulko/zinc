// zinc:ipod stand-in (sim target, ZINC_NATIVE=sim): one iPod Classic in memory, "Zinc Pod" at /Volumes/ZINCPOD, with
// the same answers as the native side for the same calls, so a program and its tests run without an iPod or libgpod.
import type { Device, Track, TrackInput, AddResult, Playlist, Snapshot, Check, SpecItem, Picture, Backup, PhotoAlbum, Extra, DownloadResult } from './ipod.spec';

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
const hex = (n: number): string => n.toString(16).padStart(16, '0');
function fail<T>(m: string): Promise<T> { return Promise.reject<T>(new Error(m)); }
const need = (): string => open ? '' : 'no iPod is open';
function base(file: string): string { const s = file.slice(file.lastIndexOf('/') + 1); const d = s.lastIndexOf('.'); return d > 0 ? s.slice(0, d) : s; }
function find(id: string): Track | null { for (const t of tracks) if (t.id === id) return t; return null; }
function playlist(id: string): Playlist | null { for (const p of playlists) if (p.id === id || p.name === id) return p; return null; }
/** The native side's safeName: no / \ : * ? " < > | nor control characters, no leading or trailing dot or space. */
function safe(name: string, fallback: string): string {
  let s = '';
  for (let i = 0; i < name.length; i++) { const c = name.charCodeAt(i); s += c < 32 || c === 127 || '/\\:*?"<>|'.indexOf(name[i]) >= 0 ? '_' : name[i]; }
  let a = 0, b = s.length;
  while (a < b && (s[a] === ' ' || s[a] === '.')) a++;
  while (b > a && (s[b - 1] === ' ' || s[b - 1] === '.')) b--;
  s = s.slice(a, Math.min(b, a + 120));
  return s === '' ? fallback : s;
}
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
  info: (): Promise<Device> => need() ? fail<Device>(need()) : Promise.resolve(device()),
  close: (): Promise<void> => Promise.resolve(),
  tracks: (): Promise<Track[]> => Promise.resolve(tracks.slice()),
  playlists: (): Promise<Playlist[]> => Promise.resolve(playlists.slice()),
  add: (items: TrackInput[], pl: string): Promise<AddResult[]> => {
    if (need()) return fail<AddResult[]>(need());
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
  setArtwork: (id: string, _f: string): Promise<void> => { const t = find(id); if (!t) return fail<void>('no track ' + id); t.artwork = true; return Promise.resolve(); },
  saveArtwork: (id: string, _png: string): Promise<boolean> => { const t = find(id); return t ? Promise.resolve(t.artwork) : fail('no track ' + id); },
  createPlaylist: (name: string): Promise<string> => { const p: Playlist = { id: hex(++seq), name: name, master: false, podcasts: false, smart: false, trackIds: [] }; playlists.push(p); return Promise.resolve(p.id); },
  renamePlaylist: (id: string, name: string): Promise<void> => { const p = playlist(id); if (!p) return fail<void>('no playlist ' + id); p.name = name; return Promise.resolve(); },
  deletePlaylist: (id: string): Promise<void> => {
    const k = playlists.findIndex((p: Playlist) => p.id === id);
    if (k < 0) return fail<void>('no playlist ' + id);
    if (playlists[k].master) return fail<void>('the master playlist cannot be deleted');
    playlists.splice(k, 1);
    return Promise.resolve();
  },
  setPlaylistTracks: (id: string, ids: string[]): Promise<void> => { const p = playlist(id); if (!p) return fail<void>('no playlist ' + id); p.trackIds = ids.slice(); return Promise.resolve(); },
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
    if (need()) return fail<SpecItem[]>(need());
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
  photoAlbums: (): Promise<PhotoAlbum[]> => need() ? fail<PhotoAlbum[]>(need()) : Promise.resolve([
    { id: '0', name: 'Photo Library', master: true, photoIds: ['0000000000000064', '0000000000000065', '0000000000000066'] },
    { id: '1', name: 'Holidays', master: false, photoIds: ['0000000000000065', '0000000000000066'] }]),
  photo: (id: string, size: i32): Promise<Picture> => {
    const k = parseInt(id, 16) - 100;
    if (k < 0 || k > 2) return fail<Picture>('no photo ' + id);
    const w = size, h = Math.floor(size * 3 / 4);
    const px: u8[] = [];   // a landscape gradient per photo
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { px.push((k * 90) as u8); px.push((x * 255 / w) as u8); px.push((y * 255 / h) as u8); px.push(255); }
    return Promise.resolve({ width: w, height: h, rgba: px });
  },
  extras: (): Promise<Extra[]> => need() ? fail<Extra[]>(need()) : Promise.resolve([
    { kind: 'note', name: 'Shopping.txt', path: MP + '/Notes/Shopping.txt', bytes: 120, modified: 0 },
    { kind: 'contact', name: 'Ada Lovelace.vcf', path: MP + '/Contacts/Ada Lovelace.vcf', bytes: 210, modified: 0 },
    { kind: 'recording', name: 'Memo 1.wav', path: MP + '/Recordings/Memo 1.wav', bytes: 480000, modified: 0 }]),
  backups: (_dir: string): Promise<Backup[]> => Promise.resolve(taken.slice()),
  deleteBackup: (folder: string): Promise<void> => {
    const k = taken.findIndex((b: Backup) => b.folder === folder);
    if (k < 0) return fail<void>(folder + ' is not a backup of ~/.zinc/ipod: refused');
    taken.splice(k, 1);
    return Promise.resolve();
  },
  download: (ids: string[], dir: string): Promise<DownloadResult[]> => {
    if (need()) return fail<DownloadResult[]>(need());
    const out: DownloadResult[] = [];
    let i = 0;
    for (const id of ids) {
      i++;
      const t = find(id);
      if (!t) { out.push({ id: id, file: '', error: 'no track ' + id + ' on the iPod', skipped: false }); continue; }
      const nr = t.trackNr > 0 ? (t.trackNr < 10 ? '0' : '') + t.trackNr + ' ' : '';
      const file = dir + '/' + safe(t.albumArtist !== '' ? t.albumArtist : t.artist, 'Unknown Artist') + '/' + safe(t.album, 'Unknown Album') + '/' +
        nr + safe(t.title, 'Untitled') + t.path.slice(t.path.lastIndexOf('.')).toLowerCase();
      out.push({ id: id, file: file, error: '', skipped: false });
      cb?.('download', i, ids.length, file);
    }
    return Promise.resolve(out);
  },
  check: (): Promise<Check> => Promise.resolve({ missing: [], orphans: [], orphanBytes: 0 }),
  repair: (): Promise<Check> => Promise.resolve({ missing: [], orphans: [], orphanBytes: 0 }),
  mount: (_device: string): Promise<void> => Promise.resolve(),
  eject: (_mp: string): Promise<void> => { open = false; return Promise.resolve(); },
  onProgress: (f: (phase: string, done: i32, total: i32, detail: string) => void): void => { cb = f; },
};
