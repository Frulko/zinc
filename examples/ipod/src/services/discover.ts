// Discoveries: the artists Last.fm calls similar to the ones you listen to (the graph services/genius.ts keeps in
// <history>/similar-artists.jsonl) that are not on the open iPod, ranked by how much you listen to the artists pointing at them:
// score(X) = sum over the artists A you heard of plays(A) * match(A, X). No UI here (pages/discover). An artist's top albums and songs come
// from Last.fm (artist.getTopAlbums, artist.getTopTracks, with the API key of the settings) and are kept 30 days in
// <history>/artist-top.jsonl, one JSON line per artist asked (a later line replaces an earlier one).
import * as fs from 'zinc:fs';
import { ArtistGraph } from './genius';
import { Ranked, normArtist } from './history';
import { lastfm } from './historyImport';

const TOP_FILE = 'artist-top.jsonl';
const TOP_TTL_S: number = 30 * 86400;
const BECAUSE_SHOWN: i32 = 3;

export class Discovery {
  /** The normalised name (the graph's key) and a name to show (the key title-cased until Last.fm gives the real one). */
  key: string = ''; name: string = '';
  score: number = 0;
  /** The artists you listen to that point at it, the strongest first (display names). */
  because: string[] = [];
}

/** "daft punk" -> "Daft Punk": how a graph key (normalised, lower case) is shown before Last.fm names it. */
export function titled(key: string): string {
  return key.split(' ').map((w: string): string => w === '' ? w : w[0].toUpperCase() + w.slice(1)).join(' ');
}

/** The discoveries for `heard` (artists with their plays: History.topArtists) from `graph`, leaving out what `onPod` holds (normalised
 *  names), best first, at most `max`. */
export function discoveries(graph: ArtistGraph, heard: Ranked[], onPod: Set<string>, max: i32): Discovery[] {
  const by = new Map<string, Discovery>();
  const parts = new Map<string, number[]>();   // a discovery's contributions, in the order of `because`
  for (const a of heard) {
    const near = graph.get(a.key !== '' ? a.key : normArtist(a.artist));
    if (near === undefined || a.plays <= 0) continue;
    (near as Map<string, number>).forEach((match: number, k: string) => {
      if (onPod.has(k)) return;
      let d = by.get(k);
      if (d === undefined) { const made = new Discovery(); made.key = k; made.name = titled(k); by.set(k, made); parts.set(k, []); d = made; }
      const w = a.plays * match;
      (d as Discovery).score += w;
      (d as Discovery).because.push(a.artist);
      (parts.get(k) as number[]).push(w);
    });
  }
  const out: Discovery[] = [];
  by.forEach((d: Discovery) => {
    const w = parts.get(d.key) as number[];
    const order: i32[] = [];
    for (let i = 0; i < w.length; i++) order.push(i as i32);
    order.sort((x: i32, y: i32) => w[y] - w[x]);
    const names: string[] = [];
    for (const i of order) if (names.length < BECAUSE_SHOWN && names.indexOf(d.because[i]) < 0) names.push(d.because[i]);
    d.because = names;
    out.push(d);
  });
  out.sort((x: Discovery, y: Discovery) => y.score !== x.score ? (y.score > x.score ? 1 : -1) : (x.key < y.key ? -1 : 1));
  return out.slice(0, max);
}

/** "because you listen to Air, Daft Punk and Justice". */
export function becauseLine(names: string[]): string {
  if (names.length === 0) return '';
  const list = names.length === 1 ? names[0] : `${names.slice(0, names.length - 1).join(', ')} and ${names[names.length - 1]}`;
  return `because you listen to ${list}`;
}

// ---- an artist's top albums and songs (Last.fm)

export interface Named { name: string; plays: number; }
/** What Last.fm says of an artist: its name as Last.fm writes it, its top albums and songs (interfaces: read back with JSON.parse). */
export interface ArtistTop { key: string; name: string; at: number; albums: Named[]; tracks: Named[]; }

function readTops(dir: string): Map<string, ArtistTop> {
  const by = new Map<string, ArtistTop>();
  const file = `${dir}/${TOP_FILE}`;
  try {
    if (fs.exists(file)) for (const line of fs.readText(file).split('\n')) {
      if (line === '') continue;
      try { const e: ArtistTop = JSON.parse(line); by.set(e.key, e); } catch (e) { /* a line cut short: asked again */ }
    }
  } catch (e) { /* unreadable: asked again */ }
  return by;
}

function list(v: any): any { return v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]; }

/** The top albums and songs of `name` (key: its normalised name): from the cache when asked in the last 30 days, else from Last.fm
 *  (kept). Throws Last.fm's message (no key, the network). */
export async function artistTop(dir: string, apiKey: string, key: string, name: string): Promise<ArtistTop> {
  const had = readTops(dir).get(key);
  const now = Math.floor(Date.now() / 1000);
  if (had !== undefined && now - (had as ArtistTop).at < TOP_TTL_S) return had as ArtistTop;
  if (apiKey.trim() === '') throw new Error('add a Last.fm API key in Settings to see their albums');
  const top: ArtistTop = { key: key, name: name, at: now, albums: [], tracks: [] };
  const a = await lastfm(`method=artist.gettopalbums&artist=${encodeURIComponent(name)}&autocorrect=1&limit=6`, apiKey);
  const albums = a.topalbums !== undefined ? a.topalbums : null;
  if (albums !== null) {
    if (albums['@attr'] !== undefined && albums['@attr'].artist !== undefined) top.name = '' + albums['@attr'].artist;
    for (const x of list(albums.album)) { const n: Named = { name: '' + x.name, plays: Number(x.playcount) }; if (n.name !== '' && n.name !== '(null)') top.albums.push(n); }
  }
  const t = await lastfm(`method=artist.gettoptracks&artist=${encodeURIComponent(name)}&autocorrect=1&limit=5`, apiKey);
  if (t.toptracks !== undefined) for (const x of list(t.toptracks.track)) top.tracks.push({ name: '' + x.name, plays: Number(x.playcount) });
  fs.mkdir(dir, true);
  fs.appendText(`${dir}/${TOP_FILE}`, JSON.stringify(top) + '\n');
  return top;
}

// ---- where to hear them

/** Bandcamp's search, MusicBrainz's artist search and the artist's Last.fm page. */
export function links(name: string): string[] {
  const q = encodeURIComponent(name);
  return [`https://bandcamp.com/search?q=${q}`, `https://musicbrainz.org/search?query=${q}&type=artist`, `https://www.last.fm/music/${q.split('%20').join('+')}`];
}
export const LINK_NAMES: string[] = ['Bandcamp', 'MusicBrainz', 'Last.fm'];
