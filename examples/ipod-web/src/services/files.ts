// Files sent as they are: a track's file on the iPod and the covers, written once as PNG files into the iPod's cache folder (one per
// FireWire GUID, kept between runs: <backups>/cache/<GUID>/covers, ~/.zinc/ipod/cache/... by default, as the app keeps its own).
import * as ipod from 'zinc:ipod';
import * as fs from 'zinc:fs';
import * as net from 'zinc:net';
import * as sys from 'zinc:sys';
import { lib } from './library';

const TYPES: string[] = ['mp3', 'audio/mpeg', 'm4a', 'audio/mp4', 'm4b', 'audio/mp4', 'm4p', 'audio/mp4', 'aac', 'audio/aac',
  'wav', 'audio/wav', 'aif', 'audio/aiff', 'aiff', 'audio/aiff', 'mp4', 'video/mp4', 'm4v', 'video/mp4', 'mov', 'video/quicktime'];

export function suffixOf(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot < 0 || dot < path.lastIndexOf('/') ? '' : path.slice(dot + 1).toLowerCase();
}
export function contentTypeOf(path: string): string {
  const i = TYPES.indexOf(suffixOf(path));
  return i >= 0 && i % 2 === 0 ? TYPES[i + 1] : 'application/octet-stream';
}

/** The track's file, with byte ranges (Reply.file). */
export function trackFile(t: ipod.Track): net.Reply {
  return { status: 200, body: '', contentType: contentTypeOf(t.path), file: lib.mountpoint + '/' + t.path };
}

/** Where zinc:ipod keeps the backups (its backupRoot(): ZINC_IPOD_BACKUPS, else ZINC_HOME/ipod, else ~/.zinc/ipod). */
export function backupPlace(): string {
  const b = sys.env('ZINC_IPOD_BACKUPS');
  if (b !== '') return b;
  const h = sys.env('ZINC_HOME');
  return h !== '' ? `${h}/ipod` : `${sys.env('HOME')}/.zinc/ipod`;
}

/** The open iPod's folder of what is kept between runs (`sub`: a folder in it), made when missing. */
export function podDir(sub: string): string {
  const dir = `${backupPlace()}/cache/${lib.guid !== '' ? lib.guid : 'unknown'}${sub !== '' ? '/' + sub : ''}`;
  fs.mkdir(dir, true);
  return dir;
}

/** The iPod's database marker: its size and time ('' when it has none); a client's copy of the library made with another is stale. */
export function dbMarker(): string {
  for (const name of ['iTunesDB', 'iTunesCDB']) {
    const f = `${lib.mountpoint}/iPod_Control/iTunes/${name}`;
    try { if (lib.mountpoint !== '' && fs.exists(f)) { const st = fs.stat(f); return `${st.size}:${Math.floor(st.mtimeMs)}`; } } catch (e) { /* unknown */ }
  }
  return '';
}

/** A temporary folder of the open iPod (uploads on their way to it). */
export function cacheDir(): string {
  const dir = `${fs.tmpdir()}/ipod-web/${lib.serial !== '' ? lib.serial : 'ipod'}`;
  fs.mkdir(dir, true);
  return dir;
}

/** The track's cover as a PNG file of the cache, '' when it has none. */
export async function coverFile(trackId: string): Promise<string> {
  const t = lib.trackById.get(trackId);
  if (t === undefined || !(t as ipod.Track).artwork) return '';
  const file = `${podDir('covers')}/${trackId}.png`;
  if (fs.exists(file)) return file;
  return (await ipod.saveArtwork(trackId, file)) ? file : '';
}

export function pngReply(file: string): net.Reply {
  return { status: 200, body: '', contentType: 'image/png', file: file };
}
