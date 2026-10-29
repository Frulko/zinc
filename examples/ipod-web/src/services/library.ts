// The open iPod's library: the daemon is the only program that opens the database. sync() opens the first mounted iPod with a
// database (or --mount), reopens it when it comes back and closes it when it goes; load() reads the tracks and playlists and
// numbers the albums and artists in the order of a sort by name (ids stable while the library does not change).
import * as ipod from 'zinc:ipod';
import * as fs from 'zinc:fs';

export class Album {
  id: string = '';
  name: string = '';
  artist: string = '';
  artistId: string = '';
  year: i32 = 0;
  genre: string = '';
  songs: ipod.Track[] = [];
  /** A track of the album with a cover, '' when none has one. */
  coverTrack: string = '';
  durationMs: number = 0;
  playCount: i32 = 0;
  added: number = 0;
  lastPlayed: number = 0;
}

export class Artist {
  id: string = '';
  name: string = '';
  albums: Album[] = [];
}

export class Library {
  /** '' when no iPod is open. */
  mountpoint: string = '';
  name: string = '';
  serial: string = '';
  /** The FireWire GUID (letters and digits, uppercase; else the serial): the name of its cache folder. */
  guid: string = '';
  tracks: ipod.Track[] = [];
  playlists: ipod.Playlist[] = [];
  albums: Album[] = [];
  artists: Artist[] = [];
  trackById: Map<string, ipod.Track> = new Map<string, ipod.Track>();
  albumOfTrack: Map<string, Album> = new Map<string, Album>();
  albumById: Map<string, Album> = new Map<string, Album>();
  artistById: Map<string, Artist> = new Map<string, Artist>();
  /** Why the last open failed, '' when it worked. */
  error: string = '';
}
export const lib = new Library();
let failedAt = '';   // an iPod that could not be opened is tried again once it has gone and come back

function byName(a: string, b: string): i32 {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : a < b ? -1 : a > b ? 1 : 0;
}

export function albumArtistOf(t: ipod.Track): string {
  if (t.albumArtist !== '') return t.albumArtist;
  return t.artist !== '' ? t.artist : 'Unknown Artist';
}

/** Numbers the albums and artists of lib.tracks (the Mac app calls it after filling lib from its own library). */
export function indexLibrary(): void {
  const albums: Album[] = [];
  const byKey = new Map<string, Album>();
  for (const t of lib.tracks) {
    const name = t.album !== '' ? t.album : 'Unknown Album';
    const artist = albumArtistOf(t);
    const key = artist + '\u0000' + name;
    let a = byKey.get(key);
    if (a === undefined) {
      const fresh = new Album();
      fresh.name = name;
      fresh.artist = artist;
      byKey.set(key, fresh);
      albums.push(fresh);
      a = fresh;
    }
    const al = a as Album;
    al.songs.push(t);
    al.durationMs += t.durationMs;
    al.playCount += t.playCount;
    if (t.year > 0 && al.year === 0) al.year = t.year;
    if (t.genre !== '' && al.genre === '') al.genre = t.genre;
    if (t.artwork && al.coverTrack === '') al.coverTrack = t.id;
    if (t.added > al.added) al.added = t.added;
    if (t.lastPlayed > al.lastPlayed) al.lastPlayed = t.lastPlayed;
  }
  albums.sort((a: Album, b: Album): i32 => { const c = byName(a.name, b.name); return c !== 0 ? c : byName(a.artist, b.artist); });
  const artists: Artist[] = [];
  const artistByName = new Map<string, Artist>();
  for (const a of albums) {
    a.songs.sort((x: ipod.Track, y: ipod.Track): i32 => (x.cdNr * 1000 + x.trackNr) - (y.cdNr * 1000 + y.trackNr) || byName(x.title, y.title));
    let ar = artistByName.get(a.artist);
    if (ar === undefined) { const fresh = new Artist(); fresh.name = a.artist; artistByName.set(a.artist, fresh); artists.push(fresh); ar = fresh; }
    (ar as Artist).albums.push(a);
  }
  artists.sort((a: Artist, b: Artist): i32 => byName(a.name, b.name));
  lib.albums = albums;
  lib.artists = artists;
  lib.trackById = new Map<string, ipod.Track>();
  lib.albumOfTrack = new Map<string, Album>();
  lib.albumById = new Map<string, Album>();
  lib.artistById = new Map<string, Artist>();
  for (let i = 0; i < artists.length; i++) { artists[i].id = `ar-${i + 1}`; lib.artistById.set(artists[i].id, artists[i]); }
  for (let i = 0; i < albums.length; i++) {
    const a = albums[i];
    a.id = `al-${i + 1}`;
    a.artistId = (artistByName.get(a.artist) as Artist).id;
    lib.albumById.set(a.id, a);
    for (const t of a.songs) { lib.trackById.set(t.id, t); lib.albumOfTrack.set(t.id, a); }
  }
}

/** The name of an iPod's cache folder: its FireWire GUID, else its serial, letters and digits only, uppercase (as the app names it). */
export function guidOf(d: ipod.Device): string {
  let raw = d.firewireGuid !== '' ? d.firewireGuid : d.serial !== '' ? d.serial : 'unknown';
  if (raw.startsWith('0x') || raw.startsWith('0X')) raw = raw.slice(2);   // SysInfo writes it 0x000A27...
  let s = '';
  for (let i = 0; i < raw.length; i++) { const c = raw.charCodeAt(i); if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122)) s += raw[i]; }
  return s !== '' ? s.toUpperCase() : 'unknown';
}

/** Reads the tracks and playlists of the open iPod again (after a change). */
export async function load(): Promise<void> {
  lib.tracks = await ipod.tracks();
  lib.playlists = await ipod.playlists();
  indexLibrary();
}

function clear(): void {
  lib.mountpoint = '';
  lib.name = '';
  lib.serial = '';
  lib.guid = '';
  lib.tracks = [];
  lib.playlists = [];
  indexLibrary();
}

export async function close(): Promise<void> {
  if (lib.mountpoint === '') return;
  try { await ipod.close(); } catch (e) { /* already gone */ }
  clear();
}

/** The iPod to serve: --mount when it is there, else the first mounted iPod with a database; '' when none. */
function target(pods: ipod.Device[], mount: string): string {
  if (mount !== '') return fs.exists(mount + '/iPod_Control') ? mount : '';
  for (const d of pods) if (d.connection === 'disk' && d.hasDatabase) return d.mountpoint;
  return '';
}

let syncing = false;
/** Called after each scan: opens, reopens or closes so that the library follows what is plugged in. */
export async function sync(pods: ipod.Device[], mount: string): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    const want = target(pods, mount);
    if (want !== failedAt) failedAt = '';
    if (lib.mountpoint !== '' && (want !== lib.mountpoint || !fs.exists(lib.mountpoint + '/iPod_Control'))) await close();
    if (want !== '' && lib.mountpoint === '' && failedAt === '') {
      try {
        const d = await ipod.open(want);
        lib.mountpoint = want;
        lib.name = d.name;
        lib.serial = d.serial;
        lib.guid = guidOf(d);
        await load();
        lib.error = '';
        console.log(`ipod-web: opened ${want}: ${lib.tracks.length} tracks`);
      } catch (e) {
        lib.error = (e as Error).message;
        failedAt = want;
        await close();
        console.log(`ipod-web: cannot open ${want}: ${lib.error}`);
      }
    }
  } finally {
    syncing = false;
  }
}
