// Lyrics from LRCLIB (lrclib.net: GET /api/get with the artist, title, album and duration): synced lyrics (LRC: "[mm:ss.xx] line") when it
// has them, plain ones otherwise. The iPod's database keeps no lyrics text, only a flag; what LRCLIB gives is kept per song in the iPod's
// cache folder (<cache>/lyrics/<track id>.json), a song it does not know too (asked again after 30 days). IPOD_LRCLIB_URL replaces the
// service (the tests' stub). No UI here (components/LyricsPanel.tsx).
import * as net from 'zinc:net';
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import * as ipod from 'zinc:ipod';
import * as cache from './cache';

const LRCLIB_URL = sys.env('IPOD_LRCLIB_URL') !== '' ? sys.env('IPOD_LRCLIB_URL') : 'https://lrclib.net/api';
const AGENT = 'ZincIPod/0.1 ( https://github.com/Frulko/zinc )';
const NONE_KEEP_S: number = 30 * 86400;

/** What LRCLIB has of a song: the LRC text ('' when not synced), the plain text, and when it was asked (Unix seconds). */
export interface Lyrics { synced: string; plain: string; at: number; }
/** One line of synced lyrics: when it starts (ms) and its words. */
export class Line { ms: number; text: string; constructor(ms: number, text: string) { this.ms = ms; this.text = text; } }

function file(trackId: string): string { return `${cache.cacheDir('lyrics')}/${trackId}.json`; }

/** The song's lyrics kept in the cache, null when it was never asked (or a "none" is older than 30 days). */
export function cached(trackId: string): Lyrics | null {
  try {
    if (!fs.exists(file(trackId))) return null;
    const l: Lyrics = JSON.parse(fs.readText(file(trackId)));
    if (l.synced === '' && l.plain === '' && Date.now() / 1000 - l.at > NONE_KEEP_S) return null;
    return l;
  } catch (e) { return null; }
}

/** The song's lyrics: from the cache, else asked of LRCLIB and kept (empty texts when it has none). Throws on a network error. */
export async function lyricsOf(t: ipod.Track): Promise<Lyrics> {
  const had = cached(t.id);
  if (had !== null) return had as Lyrics;
  const q = `artist_name=${encodeURIComponent(t.artist)}&track_name=${encodeURIComponent(t.title)}&album_name=${encodeURIComponent(t.album)}` +
    `&duration=${Math.round(t.durationMs / 1000)}`;
  const h = new net.Headers();
  h.set('User-Agent', AGENT);
  const r = await net.fetch(`${LRCLIB_URL}/get?${q}`, { headers: h, timeoutMs: 20000 });
  const body = await r.text();
  const l: Lyrics = { synced: '', plain: '', at: Math.floor(Date.now() / 1000) };
  if (r.status === 200) {
    const j: any = JSON.parse(body);
    if (j.syncedLyrics !== undefined && j.syncedLyrics !== null) l.synced = '' + j.syncedLyrics;
    if (j.plainLyrics !== undefined && j.plainLyrics !== null) l.plain = '' + j.plainLyrics;
  } else if (r.status !== 404) throw new Error(`LRCLIB: HTTP ${r.status}`);
  fs.writeText(file(t.id), JSON.stringify(l));
  return l;
}

/** The lines of an LRC text, in time order ("[01:02.50] words"; a line with several times is repeated; tags like [ar:...] are left out). */
export function parseLrc(text: string): Line[] {
  const out: Line[] = [];
  for (const raw of text.split('\n')) {
    let s = raw.trim();
    const times: number[] = [];
    while (s.startsWith('[')) {
      const end = s.indexOf(']');
      if (end < 0) break;
      const tag = s.slice(1, end), colon = tag.indexOf(':');
      const m = colon > 0 ? Number(tag.slice(0, colon)) : NaN, sec = colon > 0 ? Number(tag.slice(colon + 1)) : NaN;
      if (!isNaN(m) && !isNaN(sec)) times.push(Math.round((m * 60 + sec) * 1000));
      s = s.slice(end + 1);
    }
    for (const ms of times) out.push(new Line(ms, s.trim()));
  }
  out.sort((a: Line, b: Line) => a.ms - b.ms);
  return out;
}

/** The line sung at `ms` (the last one started), -1 before the first. */
export function lineAt(lines: Line[], ms: number): i32 {
  let at: i32 = -1;
  for (let i = 0; i < lines.length; i++) { if (lines[i].ms <= ms) at = i as i32; else break; }
  return at;
}
