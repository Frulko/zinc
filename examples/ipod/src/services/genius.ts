// Genius without Apple, tier 1 (docs/reports/ipod-genius.md, 0b and 4.4-4.5): how close two songs of an iPod are, from what is
// already on this computer, then "Genius from this song" and the taste clusters (the mixes). No UI here: the app
// (services/geniusDrafts.ts) and the iPod daemon call it the same way.
//   co-listening  the open stand-in for Genius' crowd: two songs heard in the same session (services/history.ts, SESSION_GAP_S)
//                 more often than chance. Normalised PMI over the sessions, each session weighted by its age (half-life), shrunk
//                 for songs heard together only once or twice.
//   artists       the same artist, or Last.fm's artist.getSimilar score when a Last.fm API key is set (fetched once per artist and
//                 kept in <history>/similar-artists.jsonl; nothing is sent without a key).
//   genre, decade the iPod's tags.
//   the song's own plays, rating and skips (the iPod's counters and the history), a bonus or a malus; 1-2 stars are never picked.
//   transitions   from one song to the next: tempo (the iPod's BPM field, octave folded) and year.
//   deep (tier 2) when AudioMuse-AI analysed both songs (services/audiomuse.ts, attachDeep): how close they sound, from its near list
//                 (similar_tracks, 1 / (1 + distance)) or the cosine of their sound vectors; pair = deep · sound + (1 - deep) · tier 1
//                 (0.65 / 0.35), a song it did not analyse keeps tier 1 alone; the path also pays deepStep for a jump in sound.
// The weights are one JSON file, <history>/genius.json (written with the defaults the first time). Loudness is not a term: no program
// can get the PCM of an iPod's AAC/ALAC file yet (only the plugin's native fingerprint pass decodes them), see the report.
import * as ipod from 'zinc:ipod';
import * as fs from 'zinc:fs';
import { History, SESSION_GAP_S, normArtist } from './history';
import { lastfm } from './historyImport';
import { fold } from '../search';
import { Deep, soundVectors } from './audiomuse';

export class Weights {
  colisten: number = 0.45;
  artist: number = 0.25;
  genre: number = 0.15;
  decade: number = 0.10;
  plays: number = 0.05;
  rating: number = 0.05;
  skips: number = 0.10;
  /** Taken off a song for its tempo step from the one before (per octave) and its year step (per 10 years). */
  tempoStep: number = 0.15;
  yearStep: number = 0.05;
  /** A session this many days older than the newest listen counts half. */
  halfLifeDays: number = 365;
  /** Co-listening is multiplied by n / (n + shrink), n the sessions shared. */
  shrink: number = 2;
  /** The same artist at most once in this many songs. */
  artistSpread: i32 = 4;
  /** Tier 2: the share of AudioMuse's sound in the closeness of two songs it analysed, and what a jump in sound costs the path. */
  deep: number = 0.65;
  deepStep: number = 0.15;
}

const WEIGHT_KEYS: string[] = ['colisten', 'artist', 'genre', 'decade', 'plays', 'rating', 'skips', 'tempoStep', 'yearStep', 'halfLifeDays', 'shrink', 'artistSpread', 'deep', 'deepStep'];

/** The weights of `<dir>/genius.json`; the file is written with the defaults when it is missing. Unknown keys are ignored. */
export function loadWeights(dir: string): Weights {
  const w = new Weights();
  const file = `${dir}/genius.json`;
  try {
    if (!fs.exists(file)) {
      fs.mkdir(dir, true);
      const o = JSON.parse('{}');
      o.colisten = w.colisten; o.artist = w.artist; o.genre = w.genre; o.decade = w.decade; o.plays = w.plays; o.rating = w.rating; o.skips = w.skips;
      o.tempoStep = w.tempoStep; o.yearStep = w.yearStep; o.halfLifeDays = w.halfLifeDays; o.shrink = w.shrink; o.artistSpread = w.artistSpread;
      o.deep = w.deep; o.deepStep = w.deepStep;
      fs.writeText(file, JSON.stringify(o, null, 2) + '\n');
      return w;
    }
    const o = JSON.parse(fs.readText(file));
    for (const k of WEIGHT_KEYS) {
      const v = o[k];
      if (v === undefined || typeof v !== 'number') continue;
      const n = v as number;
      if (k === 'colisten') w.colisten = n; else if (k === 'artist') w.artist = n; else if (k === 'genre') w.genre = n;
      else if (k === 'decade') w.decade = n; else if (k === 'plays') w.plays = n; else if (k === 'rating') w.rating = n;
      else if (k === 'skips') w.skips = n; else if (k === 'tempoStep') w.tempoStep = n; else if (k === 'yearStep') w.yearStep = n;
      else if (k === 'halfLifeDays') w.halfLifeDays = n; else if (k === 'shrink') w.shrink = n; else if (k === 'deep') w.deep = Math.min(1, Math.max(0, n));
      else if (k === 'deepStep') w.deepStep = n; else w.artistSpread = Math.max(1, Math.floor(n)) as i32;
    }
  } catch (e) { /* unreadable: the defaults */ }
  return w;
}

// ---- the artist graph (Last.fm artist.getSimilar), cached

/** normalised artist -> normalised similar artist -> 0..1 */
export type ArtistGraph = Map<string, Map<string, number>>;

// One JSON line per artist asked, appended as it comes (rewriting the whole file every few artists stalled the frames: 80 ms at 1000
// artists); a later line of an artist replaces an earlier one. The first versions kept one JSON array, similar-artists.json: still read.
const SIMILAR_FILE = 'similar-artists.jsonl';
const SIMILAR_OLD = 'similar-artists.json';
const SIMILAR_TTL_S: number = 90 * 86400;

interface Similar { artist: string; match: number; }
/** One artist asked: when (Unix seconds) and its similar artists (normalised names). */
interface SimilarEntry { artist: string; at: number; similar: Similar[]; }

function readSimilar(dir: string): SimilarEntry[] {
  const by = new Map<string, SimilarEntry>();
  try {
    const old = `${dir}/${SIMILAR_OLD}`;
    if (fs.exists(old)) { const list: SimilarEntry[] = JSON.parse(fs.readText(old)); for (const e of list) by.set(e.artist, e); }
  } catch (e) { /* damaged: fetched again */ }
  try {
    const file = `${dir}/${SIMILAR_FILE}`;
    if (fs.exists(file)) for (const line of fs.readText(file).split('\n')) {
      if (line === '') continue;
      try { const e: SimilarEntry = JSON.parse(line); by.set(e.artist, e); } catch (e) { /* a line cut short by a crash: asked again */ }
    }
  } catch (e) { /* unreadable: fetched again */ }
  const out: SimilarEntry[] = [];
  by.forEach((e: SimilarEntry) => { out.push(e); });
  return out;
}

/** The similar artists kept in `<dir>/similar-artists.jsonl` (empty when none were fetched). */
export function readArtistGraph(dir: string): ArtistGraph {
  const g: ArtistGraph = new Map<string, Map<string, number>>();
  for (const e of readSimilar(dir)) {
    const m = new Map<string, number>();
    for (const p of e.similar) m.set(p.artist, p.match);
    g.set(e.artist, m);
  }
  return g;
}

/** Fetches Last.fm's similar artists of each of `artists` not fetched in the last 90 days (at most `max`, in the order given) into
 *  `<dir>/similar-artists.jsonl`; the number fetched. Nothing without a `key`. An artist Last.fm does not know is kept with no
 *  neighbours (not asked again); any other error stops the run (what was fetched is kept) and is thrown. `step` is told each artist
 *  before it is asked (done of total); false stops the run there. */
export async function fetchSimilarArtists(dir: string, key: string, artists: string[], max: i32 = 200,
  step: (done: i32, total: i32, artist: string) => boolean = (done: i32, total: i32, artist: string): boolean => true): Promise<i32> {
  if (key.trim() === '') return 0;
  const file = `${dir}/${SIMILAR_FILE}`;
  const list = readSimilar(dir);
  const known = new Map<string, SimilarEntry>();
  for (const e of list) known.set(e.artist, e);
  const now = Math.floor(Date.now() / 1000);
  let n: i32 = 0;
  const seen = new Set<string>();
  const due = new Set<string>();   // the artists this run asks, for the progress
  for (const name of artists) {
    const k = normArtist(name), old = known.get(k);
    if (k !== '' && due.size < max && (old === undefined || now - (old as SimilarEntry).at >= SIMILAR_TTL_S)) due.add(k);
  }
  try {
    for (const name of artists) {
      const k = normArtist(name);
      if (k === '' || seen.has(k)) continue;
      seen.add(k);
      const old = known.get(k);
      if (old !== undefined && now - (old as SimilarEntry).at < SIMILAR_TTL_S) continue;
      if (n >= max || !step(n, due.size, name)) break;
      const entry: SimilarEntry = { artist: k, at: now, similar: [] };
      try {
        const j = await lastfm(`method=artist.getsimilar&artist=${encodeURIComponent(name)}&autocorrect=1&limit=100`, key);
        const got = j.similarartists !== undefined ? j.similarartists.artist : undefined;
        if (got !== undefined && got !== null) {
          const items = Array.isArray(got) ? got : [got];
          for (let i = 0; i < items.length; i++) {
            const p: Similar = { artist: normArtist('' + items[i].name), match: Math.min(1, Number(items[i].match)) };
            if (p.artist !== '' && p.artist !== k && p.match > 0) entry.similar.push(p);
          }
        }
      } catch (e) {
        if ((e as Error).message.indexOf('could not be found') < 0) throw e;   // error 6: an artist Last.fm does not know
      }
      if (n === 0) fs.mkdir(dir, true);
      fs.appendText(file, JSON.stringify(entry) + '\n');
      known.set(k, entry);
      n++;
    }
  } finally { /* every artist asked is already on disk */ }
  return n;
}

// ---- the model

function tempoGap(a: i32, b: i32): number {
  if (a <= 0 || b <= 0) return 0;
  let d = Math.abs(Math.log2(a / b));
  d = d - Math.floor(d);   // half and double tempo are the same pulse
  return Math.min(d, 1 - d);
}

/** Everything the picks need, built once per library and history (`buildModel`). */
export class Model {
  w: Weights;
  /** The songs that can be picked or seeded (music only). */
  tracks: ipod.Track[];
  index: Map<string, i32> = new Map<string, i32>();
  artist: string[] = []; genre: string[] = [];
  plays: number[] = []; skips: number[] = [];
  prior: number[] = [];
  /** Co-listening of i with its neighbours, 0..1. */
  co: Map<i32, number>[] = [];
  graph: ArtistGraph;
  /** Tier 2 (attachDeep): each song's sound vector ([] when AudioMuse did not analyse it) and the near lists AudioMuse gave. */
  sound: number[][] = [];
  near: Map<i32, Map<i32, number>> = new Map<i32, Map<i32, number>>();
  /** The deep results attached (null: tier 1 only). */
  deep: Deep | null = null;
  constructor(w: Weights, tracks: ipod.Track[], graph: ArtistGraph) { this.w = w; this.tracks = tracks; this.graph = graph; }

  /** How close two songs are (0..sum of the weights), whatever their order: tier 1, merged with the sound when both were analysed. */
  pair(i: i32, j: i32): number {
    const t1 = this.light(i, j);
    const d = this.sounds(i, j);
    if (d < 0) return t1;
    const w = this.w;
    return w.deep * d * (w.colisten + w.artist + w.genre + w.decade) + (1 - w.deep) * t1;
  }

  /** How alike two songs sound to AudioMuse, 0..1; -1 when it did not analyse both. */
  sounds(i: i32, j: i32): number {
    if (this.deep === null) return -1;
    const a = this.near.get(i);
    if (a !== undefined) { const v = (a as Map<i32, number>).get(j); if (v !== undefined) return v as number; }
    const b = this.near.get(j);
    if (b !== undefined) { const v = (b as Map<i32, number>).get(i); if (v !== undefined) return v as number; }
    const x = this.sound[i], y = this.sound[j];
    if (x.length === 0 || y.length === 0) return -1;
    let c = 0;
    for (let k = 0; k < x.length; k++) c += x[k] * y[k];
    return (c + 1) / 2;
  }

  /** Tier 1: how close two songs are from what is on this computer (0..sum of the weights). */
  light(i: i32, j: i32): number {
    const w = this.w;
    let s = 0;
    const c = this.co[i].get(j);
    if (c !== undefined) s += w.colisten * (c as number);
    if (this.artist[i] === this.artist[j] && this.artist[i] !== '') s += w.artist;
    else s += w.artist * this.artistSim(this.artist[i], this.artist[j]);
    if (this.genre[i] !== '' && this.genre[i] === this.genre[j]) s += w.genre;
    const ya = this.tracks[i].year, yb = this.tracks[j].year;
    if (ya > 0 && yb > 0) s += w.decade * Math.max(0, 1 - Math.abs(ya - yb) / 20);
    return s;
  }

  artistSim(a: string, b: string): number {
    let s = 0;
    const x = this.graph.get(a); if (x !== undefined) { const v = (x as Map<string, number>).get(b); if (v !== undefined) s = v as number; }
    const y = this.graph.get(b); if (y !== undefined) { const v = (y as Map<string, number>).get(a); if (v !== undefined) s = Math.max(s, v as number); }
    return s;
  }

  /** What it costs to go from song i to song j. */
  step(i: i32, j: i32): number {
    const a = this.tracks[i], b = this.tracks[j];
    let s = this.w.tempoStep * tempoGap(a.bpm, b.bpm);
    if (a.year > 0 && b.year > 0) s += this.w.yearStep * Math.min(30, Math.abs(a.year - b.year)) / 10;
    const d = this.sounds(i, j);
    if (d >= 0) s += this.w.deepStep * (1 - d);
    return s;
  }

  /** May be picked: not 1 or 2 stars (the iPod's rating is in stars). */
  pickable(i: i32): boolean { const r = this.tracks[i].rating; return r === 0 || r >= 3; }
}

/** The model of the iPod `guid`'s `tracks` with the history `h` (null: none) and the artist graph. */
export function buildModel(h: History | null, guid: string, tracks: ipod.Track[], graph: ArtistGraph, w: Weights): Model {
  const music: ipod.Track[] = [];
  for (const t of tracks) if (t.mediaType === 'audio' || t.mediaType === '') music.push(t);
  const m = new Model(w, music, graph);
  for (let i: i32 = 0; i < music.length; i++) {
    const t = music[i];
    m.index.set(t.id, i);
    m.artist.push(normArtist(t.artist !== '' ? t.artist : t.albumArtist));
    m.genre.push(fold(t.genre).trim());
    m.plays.push(t.playCount); m.skips.push(t.skipCount);
    m.co.push(new Map<i32, number>());
  }
  if (h !== null) addHistory(m, h as History, guid);
  attachDeep(m, null);
  let most = 1;
  for (const p of m.plays) if (p > most) most = p;
  for (let i: i32 = 0; i < music.length; i++) {
    const r = music[i].rating;
    let p = w.plays * Math.log(1 + m.plays[i]) / Math.log(1 + most);
    if (r > 0) p += w.rating * (r - 3) / 2;
    if (m.skips[i] > 0) p -= w.skips * m.skips[i] / (m.plays[i] + m.skips[i]);
    m.prior.push(p);
  }
  return m;
}

/** Attaches AudioMuse's results `d` to the model (null: tier 1 only again): the sound vectors and the near lists. Cheap: called
 *  again when the cache changed, without building the model again. */
export function attachDeep(m: Model, d: Deep | null): void {
  m.deep = d; m.sound = []; m.near = new Map<i32, Map<i32, number>>();
  const none: number[] = [];
  if (d === null) { for (let i = 0; i < m.tracks.length; i++) m.sound.push(none); return; }
  const vectors = soundVectors(d as Deep);
  for (const t of m.tracks) { const v = vectors.get(t.id); m.sound.push(v !== undefined ? v as number[] : none); }
  for (const n of (d as Deep).near) {
    const at = m.index.get(n.id);
    if (at === undefined) continue;
    const row = new Map<i32, number>();
    for (let k = 0; k < n.ids.length; k++) { const j = m.index.get(n.ids[k]); if (j !== undefined) row.set(j as i32, 1 / (1 + Math.max(0, n.dist[k]))); }
    m.near.set(at as i32, row);
  }
}

/** The history's plays and skips per track (the larger of them and the iPod's own counters: they overlap), and co-listening. */
function addHistory(m: Model, h: History, guid: string): void {
  const listens = h.podListens(guid);
  if (listens.length === 0) return;
  const plays: number[] = [], skips: number[] = [];
  for (let i = 0; i < m.tracks.length; i++) { plays.push(0); skips.push(0); }
  const newest = listens[listens.length - 1].ts;
  const halfLife = Math.max(1, m.w.halfLifeDays) * 86400;
  // the sessions: their tracks (each once) and their weight
  const occ = new Map<i32, number>();   // track -> weighted sessions it is in
  const shared = new Map<number, number>();   // i * n + j (i < j) -> weighted sessions shared
  const together = new Map<number, i32>();    // the same, counted
  const n = m.tracks.length;
  let total = 0, last = -1e18;
  let cur: i32[] = [];
  let curTs = 0;
  const close = (): void => {
    if (cur.length === 0) return;
    const wt = Math.pow(0.5, (newest - curTs) / halfLife);
    total += wt;
    cur.sort((a: i32, b: i32) => a - b);
    // ponytail: every pair of a session; a session of 300 different songs (a party left playing) costs 45k pairs, fine for a history
    for (let a = 0; a < cur.length; a++) {
      const i = cur[a];
      const o = occ.get(i); occ.set(i, (o !== undefined ? o as number : 0) + wt);
      for (let b = a + 1; b < cur.length; b++) {
        const k = i * n + cur[b];
        const s = shared.get(k); shared.set(k, (s !== undefined ? s as number : 0) + wt);
        const c = together.get(k); together.set(k, (c !== undefined ? c as i32 : 0) + 1);
      }
    }
    cur = [];
  };
  for (const l of listens) {
    const at = m.index.get(l.trackId);
    if (at === undefined) continue;
    const i = at as i32;
    if (l.skipped) { skips[i] += 1; continue; }
    plays[i] += 1;
    if (l.ts - last > SESSION_GAP_S) { close(); curTs = l.ts; }
    last = l.ts;
    if (cur.indexOf(i) < 0) cur.push(i);
  }
  close();
  for (let i = 0; i < n; i++) { if (plays[i] > m.plays[i]) m.plays[i] = plays[i]; if (skips[i] > m.skips[i]) m.skips[i] = skips[i]; }
  shared.forEach((s: number, k: number) => {
    const i = Math.floor(k / n) as i32, j = (k - i * n) as i32;
    const p = s / total;
    if (p >= 1) return;   // in every session: says nothing
    const pmi = Math.log(s * total / ((occ.get(i) as number) * (occ.get(j) as number)));
    const npmi = pmi / -Math.log(p);
    if (npmi <= 0) return;
    const c = together.get(k) as i32;
    const v = Math.min(1, npmi) * c / (c + m.w.shrink);
    m.co[i].set(j, v); m.co[j].set(i, v);
  });
}

// ---- Genius

/** A small, fixed jitter per song and round: Refresh gives another list, the same one each time for that round. */
function jitter(id: string, round: i32): number {
  if (round === 0) return 0;
  let h = 2166136261 + round * 16777619;
  for (let i = 0; i < id.length; i++) { h = (h ^ id.charCodeAt(i)) >>> 0; h = Math.imul(h, 16777619) >>> 0; }
  return (h % 1000) / 1000;
}

/** Orders `pool` (scored, best first) into a list after `first`: each next song is the best by `score` minus the step from the one
 *  before, its artist not among the last artistSpread - 1 songs (when no song passes, the one whose artist was heard longest ago). */
export function path(m: Model, first: i32, pool: i32[], score: number[], n: i32): i32[] {
  const out: i32[] = [first];
  const used = new Set<i32>(); used.add(first);
  const spread = m.w.artistSpread;
  while (out.length < n) {
    const prev = out[out.length - 1];
    let best: i32 = -1, bestV = -1e18, bestGap: i32 = -1;
    for (const c of pool) {
      if (used.has(c)) continue;
      let gap: i32 = spread;   // songs since its artist was last in the list
      for (let k = out.length - 1; k >= 0 && k >= out.length - spread + 1; k--) if (m.artist[out[k]] === m.artist[c]) { gap = (out.length - 1 - k) as i32; break; }
      const v = score[c] - m.step(prev, c);
      const ok = gap >= spread - 1;
      const bestOk = bestGap >= spread - 1;
      if (best < 0 || (ok && !bestOk) || (ok === bestOk && (ok ? v > bestV : gap > bestGap || (gap === bestGap && v > bestV)))) { best = c; bestV = v; bestGap = gap; }
    }
    if (best < 0) break;
    out.push(best); used.add(best);
  }
  return out;
}

/** "Genius from this song": `n` songs, the seed first, then its closest songs as a smooth path with the artists spread; `round` > 0
 *  (Refresh) shakes the order of the close ones. [] when the seed is not a music track of the model. Deterministic. */
export function genius(m: Model, seedId: string, n: i32, round: i32 = 0): ipod.Track[] {
  const at = m.index.get(seedId);
  if (at === undefined) return [];
  const seed = at as i32;
  const score: number[] = [];
  const pool: i32[] = [];
  for (let i: i32 = 0; i < m.tracks.length; i++) {
    score.push(i === seed ? 0 : m.pair(seed, i) + m.prior[i] + 0.1 * jitter(m.tracks[i].id, round));
    if (i !== seed && m.pickable(i)) pool.push(i);
  }
  pool.sort((a: i32, b: i32) => score[b] - score[a] !== 0 ? score[b] - score[a] : m.tracks[a].id < m.tracks[b].id ? -1 : 1);
  const top = pool.slice(0, Math.max(4 * n, 200));
  const out: ipod.Track[] = [];
  for (const i of path(m, seed, top, score, n)) out.push(m.tracks[i]);
  return out;
}

// ---- taste clusters (the mixes)

export class Mix {
  /** "Radiohead, Muse · Alternative" */
  name: string = '';
  /** The songs of the cluster as a list, the most played first. */
  tracks: ipod.Track[] = [];
  /** All the cluster's songs (by id). */
  members: string[] = [];
  plays: number = 0;
}

function addEdge(adj: Map<i32, number>[], i: i32, j: i32, v: number): void {
  if (i === j || v <= 0) return;
  const a = adj[i].get(j); if (a === undefined || (a as number) < v) adj[i].set(j, v);
  const b = adj[j].get(i); if (b === undefined || (b as number) < v) adj[j].set(i, v);
}

/** The taste clusters: the songs heard, joined by co-listening, by artist (each song to its artist's most played one, and those of
 *  similar artists together) and by genre, grouped by label propagation in a fixed order (the most played first); when nothing was
 *  heard, the genres. The `max` largest clusters by plays, with at least `minSize` songs, each a list of up to `size` songs. */
export function mixes(m: Model, max: i32 = 6, size: i32 = 50, minSize: i32 = 5): Mix[] {
  const nodes: i32[] = [];
  let heard = false;
  for (let i: i32 = 0; i < m.tracks.length; i++) if (m.plays[i] > 0) { heard = true; break; }
  for (let i: i32 = 0; i < m.tracks.length; i++) if (!heard || m.plays[i] > 0) nodes.push(i);
  nodes.sort((a: i32, b: i32) => m.plays[b] - m.plays[a] !== 0 ? m.plays[b] - m.plays[a] : m.tracks[a].id < m.tracks[b].id ? -1 : 1);
  const label = new Map<i32, i32>();
  if (!heard) {   // nothing heard: the mixes are the genres
    const genres: string[] = [];
    for (const i of nodes) if (m.genre[i] !== '') { if (genres.indexOf(m.genre[i]) < 0) genres.push(m.genre[i]); label.set(i, genres.indexOf(m.genre[i]) as i32); }
  } else {
    const adj: Map<i32, number>[] = [];
    for (let i = 0; i < m.tracks.length; i++) adj.push(new Map<i32, number>());
    const isNode = new Set<i32>();
    for (const i of nodes) isNode.add(i);
    const artistStar = new Map<string, i32>(), genreStar = new Map<string, i32>();
    for (const i of nodes) {   // the most played song of each artist and genre: the first met
      if (!artistStar.has(m.artist[i])) artistStar.set(m.artist[i], i);
      if (m.genre[i] !== '' && !genreStar.has(m.genre[i])) genreStar.set(m.genre[i], i);
    }
    for (const i of nodes) {
      m.co[i].forEach((v: number, j: i32) => { if (isNode.has(j)) addEdge(adj, i, j, m.pair(i, j)); });
      const s = artistStar.get(m.artist[i]) as i32;
      addEdge(adj, i, s, m.pair(i, s));
      if (m.genre[i] !== '') addEdge(adj, i, genreStar.get(m.genre[i]) as i32, m.w.genre);
    }
    artistStar.forEach((i: i32, a: string) => {
      const g = m.graph.get(a);
      if (g === undefined) return;
      (g as Map<string, number>).forEach((v: number, b: string) => { const j = artistStar.get(b); if (j !== undefined) addEdge(adj, i, j as i32, m.w.artist * v); });
    });
    // label propagation: each song takes the label its neighbours weigh most (ties: its own, else the first in the order)
    for (let k: i32 = 0; k < nodes.length; k++) label.set(nodes[k], k);
    for (let round = 0; round < 30; round++) {
      let moved = false;
      for (const i of nodes) {
        const sum = new Map<i32, number>();
        adj[i].forEach((v: number, j: i32) => { const l = label.get(j) as i32; const s = sum.get(l); sum.set(l, (s !== undefined ? s as number : 0) + v); });
        const own = label.get(i) as i32;
        let best = own, bestV = sum.has(own) ? sum.get(own) as number : 0;
        sum.forEach((v: number, l: i32) => { if (v > bestV + 1e-12 || (Math.abs(v - bestV) <= 1e-12 && best !== own && l < best)) { best = l; bestV = v; } });
        if (best !== own) { label.set(i, best); moved = true; }
      }
      if (!moved) break;
    }
  }
  const groups = new Map<i32, i32[]>();
  for (const i of nodes) { if (!label.has(i)) continue; const l = label.get(i) as i32; const g = groups.get(l); if (g === undefined) groups.set(l, [i]); else (g as i32[]).push(i); }
  const out: Mix[] = [];
  groups.forEach((members: i32[], l: i32) => {
    if (members.length < minSize) return;
    const mix = new Mix();
    const byArtist = new Map<string, number>(), byGenre = new Map<string, number>();
    const shownArtist = new Map<string, string>(), shownGenre = new Map<string, string>();
    for (const i of members) {
      const t = m.tracks[i];
      mix.plays += m.plays[i];
      mix.members.push(t.id);
      const a = byArtist.get(m.artist[i]); byArtist.set(m.artist[i], (a !== undefined ? a as number : 0) + m.plays[i] + 1);
      if (!shownArtist.has(m.artist[i])) shownArtist.set(m.artist[i], t.artist !== '' ? t.artist : t.albumArtist);
      if (m.genre[i] !== '') { const g = byGenre.get(m.genre[i]); byGenre.set(m.genre[i], (g !== undefined ? g as number : 0) + 1); if (!shownGenre.has(m.genre[i])) shownGenre.set(m.genre[i], t.genre); }
    }
    const artists: string[] = [];
    byArtist.forEach((v: number, k: string) => { artists.push(k); });
    artists.sort((a: string, b: string) => (byArtist.get(b) as number) - (byArtist.get(a) as number) !== 0 ? (byArtist.get(b) as number) - (byArtist.get(a) as number) : a < b ? -1 : 1);
    let genre = '', genreN = 0;
    byGenre.forEach((v: number, k: string) => { if (v > genreN || (v === genreN && k < genre)) { genre = k; genreN = v; } });
    const names: string[] = [];
    for (const a of artists.slice(0, 2)) names.push(shownArtist.get(a) as string);
    mix.name = names.join(', ') + (genre !== '' ? ` · ${shownGenre.get(genre) as string}` : '');
    // the list: from the most played song, the path through the cluster as Genius orders it
    const score: number[] = [];
    for (let i: i32 = 0; i < m.tracks.length; i++) score.push(0);
    const pool: i32[] = [];
    for (const i of members) { score[i] = m.pair(members[0], i) + m.prior[i]; if (i !== members[0] && m.pickable(i)) pool.push(i); }
    for (const i of path(m, members[0], pool, score, size)) mix.tracks.push(m.tracks[i]);
    out.push(mix);
  });
  out.sort((a: Mix, b: Mix) => b.plays - a.plays !== 0 ? b.plays - a.plays : a.name < b.name ? -1 : 1);
  return out.slice(0, max);
}

// ---- saving

/** Writes `tracks` to the open iPod as a new normal playlist `name` and saves the database; the playlist's id. */
export async function savePlaylist(name: string, tracks: ipod.Track[]): Promise<string> {
  const ids: string[] = [];
  for (const t of tracks) ids.push(t.id);
  const id = await ipod.createPlaylist(name);
  await ipod.setPlaylistTracks(id, ids);
  await ipod.save();
  return id;
}
