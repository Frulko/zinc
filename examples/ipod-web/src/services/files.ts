// Files sent as they are: a track's file on the iPod and the covers, written once as PNG files into a cache folder.
import * as ipod from 'zinc:ipod';
import * as fs from 'zinc:fs';
import * as net from 'zinc:net';
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

/** The cache folder of the open iPod (covers, uploads on their way to the iPod). */
export function cacheDir(): string {
  const dir = `${fs.tmpdir()}/ipod-web/${lib.serial !== '' ? lib.serial : 'ipod'}`;
  fs.mkdir(dir, true);
  return dir;
}

/** The track's cover as a PNG file of the cache, '' when it has none. */
export async function coverFile(trackId: string): Promise<string> {
  const t = lib.trackById.get(trackId);
  if (t === undefined || !(t as ipod.Track).artwork) return '';
  const file = `${cacheDir()}/${trackId}.png`;
  if (fs.exists(file)) return file;
  return (await ipod.saveArtwork(trackId, file)) ? file : '';
}

export function pngReply(file: string): net.Reply {
  return { status: 200, body: '', contentType: 'image/png', file: file };
}
