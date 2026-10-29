// "For you", tier 1 (docs/reports/ipod-genius.md, 5.4-5.5): the shelves of the home page, worked out from the listening history
// (services/history.ts), the Genius model (services/genius.ts) and the iPod's own counters. No UI and no app state here: src/forYou.ts
// runs these steps off the first frame, keeps the result on disk per history version and turns the cards into drafts; the iPod daemon
// can call them the same way. Results are ids and names only (they are cached as JSON).
//   affinity       aff(t) = log1p(Σ plays·0.5^(age_days/90)) + 1.5·loved + 0.5·(stars - 3) - 1.5·skip rate, at least 0
//   Daily Mix 1..6 the taste clusters (genius.mixes); each 70% familiar songs sampled by affinity and 30% close songs heard at most
//                  once, seeded by the day (the same all day, others tomorrow), in Genius' path order
//   Jump back in   the albums and playlists of the last sessions (3 songs of one album, or of one playlist and half the session)
//   On Repeat      the last 30 days, a 7-day half-life, songs heard 3 times or more
//   Repeat Rewind  8 plays or more within 30 days, 6 to 24 months ago, none in the last 90 days; by peak × log(age)
//   Rediscover     songs heard at most once (or not for 18 months) closest to the 50 songs of highest affinity, 2 per artist
//   Time Capsule   the busiest year 2 to 12 years ago: its songs most heard, not heard for a year
//   Because you listened to X   the 3 most played songs of the last 30 days (different artists): Genius from each, and its albums
//   Top songs and artists of this month and year, and the year in review (Your year)
//   Sounds like X, Mood mixes   tier 2, only when AudioMuse-AI analysed the iPod (extraShelves)
import * as ipod from 'zinc:ipod';
import { History, SESSION_GAP_S } from './history';
import { Model, Mix, genius, mixes, path } from './genius';
import { Deep, DeepPath, moodsOf, pathOf } from './audiomuse';

const DAY_S: number = 86400;
export const MONTHS: string[] = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A card of a shelf. */
export interface Card {
  /** draft | album | playlist | artist | year */
  kind: string;
  /** Unique in the page: a draft's name in drafts.ts is 'draft:foryou:' + id. An album's key (state.ts), a playlist's id, an artist's name. */
  id: string;
  title: string;
  subtitle: string;
  /** A draft's songs in order; for the others, songs whose covers make the picture. */
  tracks: string[];
  /** When it was last heard (Unix seconds; Jump back in orders by it), 0 for the others. */
  at: number;
}
export interface Shelf { id: string; title: string; cards: Card[]; }
export interface Named { name: string; detail: string; count: i32; }
/** The year in review (Wrapped-like). */
export interface YearReview {
  year: i32; listens: i32;
  /** An estimate: songs matched count their length, the others the library's mean. */
  minutes: i32;
  artists: Named[]; songs: Named[]; genres: Named[];
  /** Listens per month, January first. */
  months: i32[];
}

function card(kind: string, id: string, title: string, subtitle: string, tracks: string[]): Card {
  return { kind: kind, id: id, title: title, subtitle: subtitle, tracks: tracks, at: 0 };
}

/** The key of an album, as state.ts builds the albums: its album artist (else artist) and title, lower case. */
export function albumKey(t: ipod.Track): string {
  const artist = t.albumArtist !== '' ? t.albumArtist : t.artist;
  return `${artist.toLowerCase()}\u001f${(t.album !== '' ? t.album : 'Unknown album').toLowerCase()}`;
}

// ---- time

/** Local midnight of the first day of the month of `t` (Unix seconds), `add` months later. */
export function monthStart(t: number, add: i32 = 0): number {
  const d = new Date(t * 1000);
  return new Date(d.getFullYear(), d.getMonth() + add, 1).getTime() / 1000;
}
/** Local midnight of 1 January of the year of `t`, `add` years later. */
export function yearStart(t: number, add: i32 = 0): number {
  return new Date(new Date(t * 1000).getFullYear() + add, 0, 1).getTime() / 1000;
}
/** The local day of `t`, as 2026-10-29. */
export function dayOf(t: number): string {
  const d = new Date(t * 1000);
  const m = d.getMonth() + 1, day = d.getDate();
  return `${d.getFullYear()}-${m < 10 ? '0' : ''}${m}-${day < 10 ? '0' : ''}${day}`;
}

/** A repeatable random series from a text (the day): 0 <= x < 1. */
class Rng {
  s: number;
  constructor(seed: string) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) { h = (h ^ seed.charCodeAt(i)) >>> 0; h = Math.imul(h, 16777619) >>> 0; }
    this.s = h % 2147483648;
  }
  next(): number { this.s = (this.s * 1103515245 + 12345) % 2147483648; return this.s / 2147483648; }
}

// ---- the signals

export class Signals {
  m: Model;
  now: number;
  /** Per track of the model: when it was heard (not skipped, up to now), oldest first. */
  times: number[][] = [];
  /** Every listen up to now, oldest first: when, and the track. */
  flatTs: number[] = []; flatAt: i32[] = [];
  aff: number[] = [];
  loved: boolean[] = [];
  /** Last heard (the history or the iPod's own date), 0 when never. */
  last: number[] = [];
  history: boolean = false;
  constructor(m: Model, now: number) { this.m = m; this.now = now; }

  /** The listens of track i between `from` and `to`. */
  count(i: i32, from: number, to: number): i32 {
    let n: i32 = 0;
    for (const t of this.times[i]) if (t >= from && t < to) n++;
    return n;
  }
}

/** The signals of the model `m`'s songs, from the history `h` (null: the iPod's counters only), at `now`. */
export function signals(h: History | null, guid: string, m: Model, now: number): Signals {
  const s = new Signals(m, now);
  const n = m.tracks.length;
  for (let i = 0; i < n; i++) { s.times.push([]); s.loved.push(false); s.last.push(m.tracks[i].lastPlayed); }
  if (h !== null) {
    for (const l of (h as History).podListens(guid)) {
      if (l.skipped || l.ts > now) continue;
      const at = m.index.get(l.trackId);
      if (at === undefined) continue;
      const i = at as i32;
      s.times[i].push(l.ts);
      s.flatTs.push(l.ts); s.flatAt.push(i);
      if (l.ts > s.last[i]) s.last[i] = l.ts;
    }
    for (const id of (h as History).lovedOn(guid)) { const at = m.index.get(id); if (at !== undefined) s.loved[at as i32] = true; }
  }
  s.history = s.flatTs.length > 0;
  for (let i: i32 = 0; i < n; i++) {
    const t = m.tracks[i];
    let decayed = 0;
    for (const ts of s.times[i]) decayed += Math.pow(0.5, (now - ts) / DAY_S / 90);
    if (s.times[i].length === 0 && t.playCount > 0 && t.lastPlayed > 0) decayed = t.playCount * Math.pow(0.5, Math.max(0, now - t.lastPlayed) / DAY_S / 90);
    const heard = m.plays[i] + m.skips[i];
    let a = Math.log(1 + decayed) + (s.loved[i] ? 1.5 : 0) + (t.rating > 0 ? 0.5 * (t.rating - 3) : 0) - (heard > 0 ? 1.5 * m.skips[i] / heard : 0);
    s.aff.push(Math.max(0, a));
  }
  return s;
}

function ids(s: Signals, list: i32[]): string[] { const out: string[] = []; for (const i of list) out.push(s.m.tracks[i].id); return out; }

/** The `n` songs of `list` with the highest `v`, highest first (ties: the id). */
function topBy(s: Signals, list: i32[], v: number[], n: i32): i32[] {
  const out = list.filter((i: i32) => v[i] > 0);
  out.sort((a: i32, b: i32) => v[b] - v[a] !== 0 ? v[b] - v[a] : s.m.tracks[a].id < s.m.tracks[b].id ? -1 : 1);
  return out.slice(0, n);
}
function all(s: Signals): i32[] { const out: i32[] = []; for (let i: i32 = 0; i < s.m.tracks.length; i++) out.push(i); return out; }
function zeros(n: i32): number[] { const out: number[] = []; for (let i = 0; i < n; i++) out.push(0); return out; }

/** Songs related to `anchors` at all (shared genre or artist, heard with one of them): the only ones worth scoring against them. */
function near(s: Signals, anchors: i32[]): Set<i32> {
  const m = s.m;
  const genres = new Set<string>(), artists = new Set<string>();
  const out = new Set<i32>();
  for (const a of anchors) {
    if (m.genre[a] !== '') genres.add(m.genre[a]);
    artists.add(m.artist[a]);
    m.co[a].forEach((v: number, j: i32) => { out.add(j); });
    const g = m.graph.get(m.artist[a]);
    if (g !== undefined) (g as Map<string, number>).forEach((v: number, b: string) => { artists.add(b); });
  }
  for (let i: i32 = 0; i < m.tracks.length; i++) if (genres.has(m.genre[i]) || artists.has(m.artist[i])) out.add(i);
  return out;
}

/** The mean closeness of song i to `anchors`. */
function closeness(s: Signals, i: i32, anchors: i32[]): number {
  let sum = 0;
  for (const a of anchors) sum += s.m.pair(a, i);
  return anchors.length > 0 ? sum / anchors.length : 0;
}

/** `list` in Genius' path order from its first song. */
function ordered(s: Signals, list: i32[]): i32[] {
  if (list.length < 3) return list;
  const m = s.m, score = zeros(m.tracks.length);
  for (const i of list) score[i] = m.pair(list[0], i) + m.prior[i];
  return path(m, list[0], list, score, list.length as i32);
}

// ---- the shelves

/** Daily Mix 1..6 for `day` (2026-10-29): the same songs all day, others the next. */
export function dailyMixes(s: Signals, day: string, size: i32 = 50): Card[] {
  const m = s.m;
  const out: Card[] = [];
  const ms: Mix[] = mixes(m, 6, size, 5);
  for (let k = 0; k < ms.length; k++) {
    const mix = ms[k];
    const r = new Rng(`${day}:${k}`);
    const member = new Set<i32>();
    for (const id of mix.members) member.add(m.index.get(id) as i32);
    const members: i32[] = [];
    member.forEach((i: i32) => { if (m.pickable(i)) members.push(i); });
    let familiar = members.filter((i: i32) => m.plays[i] > 0);
    if (familiar.length === 0) familiar = members;
    // 70% familiar, drawn by affinity (not the same top songs every day)
    const want = Math.min(familiar.length, Math.round(size * 0.7)) as i32;
    const fam: i32[] = [];
    const left = familiar.slice();
    left.sort((a: i32, b: i32) => m.tracks[a].id < m.tracks[b].id ? -1 : 1);
    while (fam.length < want && left.length > 0) {
      let total = 0;
      for (const i of left) total += s.aff[i] + 0.2;
      let x = r.next() * total, at = 0;
      for (; at < left.length - 1; at++) { x -= s.aff[left[at]] + 0.2; if (x < 0) break; }
      fam.push(left[at]); left.splice(at, 1);
    }
    // 30% discovery: heard at most once, closest to the cluster's 10 songs of highest affinity, drawn from the best 3 times as many
    const anchors = topBy(s, members, s.aff, 10);
    const anchorList = anchors.length > 0 ? anchors : members.slice(0, 10);
    const cands: i32[] = [];
    const score = zeros(m.tracks.length);
    near(s, anchorList).forEach((i: i32) => {
      if (member.has(i) || m.plays[i] > 1 || !m.pickable(i)) return;
      score[i] = closeness(s, i, anchorList);
      if (score[i] > 0) cands.push(i);
    });
    const pool = topBy(s, cands, score, (size - fam.length) * 3);
    const disc: i32[] = [];
    while (disc.length < size - fam.length && pool.length > 0) { const at = Math.floor(r.next() * pool.length) as i32; disc.push(pool[at]); pool.splice(at, 1); }
    if (fam.length === 0) continue;
    let first = fam[0];
    for (const i of fam) if (s.aff[i] > s.aff[first]) first = i;
    const list = [first].concat(fam.filter((i: i32) => i !== first)).concat(disc);
    out.push(card('draft', `daily:${k}`, `Daily Mix ${k + 1}`, mix.name, ids(s, ordered(s, list))));
  }
  return out;
}

/** Jump back in: the albums and playlists of the last sessions, newest first (at most `max`). */
export function jumpBackIn(s: Signals, playlists: ipod.Playlist[], max: i32 = 8): Card[] {
  const m = s.m;
  const inLists = new Map<string, string[]>();
  const names = new Map<string, string>();
  for (const p of playlists) {
    if (p.master || p.podcasts) continue;
    names.set(p.id, p.name);
    for (const id of p.trackIds) { const l = inLists.get(id); if (l === undefined) inLists.set(id, [p.id]); else (l as string[]).push(p.id); }
  }
  const out: Card[] = [];
  const seen = new Set<string>();
  let end = s.flatTs.length;
  let sessions = 0;
  while (end > 0 && out.length < max && sessions < 500) {
    let start = end - 1;
    while (start > 0 && s.flatTs[start] - s.flatTs[start - 1] <= SESSION_GAP_S) start--;
    sessions++;
    const albums = new Map<string, i32>(), lists = new Map<string, i32>();
    const firstOf = new Map<string, i32>();
    for (let k = start; k < end; k++) {
      const t = m.tracks[s.flatAt[k]];
      const a = albumKey(t);
      albums.set(a, (albums.has(a) ? albums.get(a) as i32 : 0) + 1);
      if (!firstOf.has(a)) firstOf.set(a, s.flatAt[k]);
      const l = inLists.get(t.id);
      if (l !== undefined) for (const p of l as string[]) lists.set(p, (lists.has(p) ? lists.get(p) as i32 : 0) + 1);
    }
    let best = '', bestN: i32 = 0;
    albums.forEach((n: i32, a: string) => { if (n > bestN || (n === bestN && a < best)) { best = a; bestN = n; } });
    const at = s.flatTs[end - 1];
    if (bestN >= 3) {
      if (!seen.has(`a:${best}`)) {
        seen.add(`a:${best}`);
        const t = m.tracks[firstOf.get(best) as i32];
        const c = card('album', best, t.album !== '' ? t.album : 'Unknown album', t.albumArtist !== '' ? t.albumArtist : t.artist, [t.id]);
        c.at = at;
        out.push(c);
      }
    } else {
      let bestList = '', listN: i32 = 0;
      lists.forEach((n: i32, p: string) => { if (n > listN || (n === listN && p < bestList)) { bestList = p; listN = n; } });
      if (listN >= 3 && listN * 2 >= end - start && !seen.has(`p:${bestList}`)) {
        seen.add(`p:${bestList}`);
        const c = card('playlist', bestList, names.get(bestList) as string, 'Playlist', []);
        for (let k = start; k < end && c.tracks.length < 4; k++) c.tracks.push(m.tracks[s.flatAt[k]].id);
        c.at = at;
        out.push(c);
      }
    }
    end = start;
  }
  return out;
}

/** On Repeat: what was heard most the last 30 days (a 7-day half-life), 3 times or more. */
export function onRepeat(s: Signals, max: i32 = 30): Card[] {
  const v = zeros(s.m.tracks.length), from = s.now - 30 * DAY_S;
  for (let i = 0; i < v.length; i++) {
    let n = 0, w = 0;
    for (const t of s.times[i]) if (t >= from) { n++; w += Math.pow(0.5, (s.now - t) / DAY_S / 7); }
    if (n >= 3) v[i] = w;
  }
  const list = topBy(s, all(s), v, max);
  return list.length > 0 ? [card('draft', 'on-repeat', 'On Repeat', 'Songs you can’t stop playing', ids(s, list))] : [];
}

/** Repeat Rewind: played 8 times or more within 30 days, 6 to 24 months ago, and not in the last 90 days. */
export function repeatRewind(s: Signals, max: i32 = 30): Card[] {
  const v = zeros(s.m.tracks.length);
  const lo = s.now - 730 * DAY_S, hi = s.now - 180 * DAY_S, quiet = s.now - 90 * DAY_S;
  for (let i = 0; i < v.length; i++) {
    const ts = s.times[i];
    if (ts.length < 8 || ts[ts.length - 1] >= quiet) continue;
    let peak = 0, peakAt = 0, a = 0;
    for (let b = 0; b < ts.length; b++) {
      if (ts[b] < lo || ts[b] >= hi) continue;
      while (ts[a] < lo || ts[b] - ts[a] > 30 * DAY_S) a++;
      if (b - a + 1 > peak) { peak = b - a + 1; peakAt = ts[b]; }
    }
    if (peak >= 8) v[i] = peak * Math.log((s.now - peakAt) / DAY_S);
  }
  const list = topBy(s, all(s), v, max);
  return list.length >= 5 ? [card('draft', 'repeat-rewind', 'Repeat Rewind', 'Songs you played on repeat, then left', ids(s, ordered(s, list)))] : [];
}

/** Rediscover: songs of the iPod heard at most once (or not for 18 months), closest to the 50 of highest affinity; 2 per artist. */
export function rediscover(s: Signals, max: i32 = 30): Card[] {
  const m = s.m;
  const anchors = topBy(s, all(s), s.aff, 50);
  if (anchors.length === 0) return [];
  const isAnchor = new Set<i32>();
  for (const a of anchors) isAnchor.add(a);
  const old = s.now - 548 * DAY_S;
  const v = zeros(m.tracks.length), cands: i32[] = [];
  near(s, anchors).forEach((i: i32) => {
    if (isAnchor.has(i) || !m.pickable(i) || !(m.plays[i] <= 1 || (s.last[i] > 0 && s.last[i] < old))) return;
    v[i] = closeness(s, i, anchors) + m.prior[i];
    if (v[i] > 0) cands.push(i);
  });
  const perArtist = new Map<string, i32>();
  const list: i32[] = [];
  for (const i of topBy(s, cands, v, cands.length as i32)) {
    const n = perArtist.has(m.artist[i]) ? perArtist.get(m.artist[i]) as i32 : 0;
    if (n >= 2) continue;
    perArtist.set(m.artist[i], n + 1);
    list.push(i);
    if (list.length >= max) break;
  }
  return list.length >= 5 ? [card('draft', 'rediscover', 'Rediscover', 'On your iPod, close to what you love, rarely played', ids(s, ordered(s, list)))] : [];
}

/** Time Capsule: the year 2 to 12 years ago with the most listens, its songs most heard and not heard for a year. */
export function timeCapsule(s: Signals, max: i32 = 30): Card[] {
  const from = yearStart(s.now, -12), to = s.now - 730 * DAY_S;
  const perYear = new Map<i32, i32>();
  for (const t of s.flatTs) if (t >= from && t < to) { const y = new Date(t * 1000).getFullYear() as i32; perYear.set(y, (perYear.has(y) ? perYear.get(y) as i32 : 0) + 1); }
  let year: i32 = 0, most: i32 = 0;
  perYear.forEach((n: i32, y: i32) => { if (n > most || (n === most && y > year)) { year = y; most = n; } });
  if (year === 0) return [];
  const a = new Date(year, 0, 1).getTime() / 1000, b = new Date(year + 1, 0, 1).getTime() / 1000, recent = s.now - 365 * DAY_S;
  const v = zeros(s.m.tracks.length);
  for (let i = 0; i < v.length; i++) if (s.last[i] < recent) v[i] = s.count(i as i32, a, b);
  const list = topBy(s, all(s), v, max);
  return list.length >= 5 ? [card('draft', 'time-capsule', 'Time Capsule', `Songs you loved in ${year}`, ids(s, ordered(s, list)))] : [];
}

/** Because you listened to X: the 3 songs heard most in the last 30 days (else 90), of different artists; for each a Genius list and
 *  the albums it goes through. Shelves `because:0..2`. */
export function becauseYouListened(s: Signals, shelves: i32 = 3): Shelf[] {
  const m = s.m;
  const seeds: i32[] = [];
  const artists = new Set<string>();
  for (const days of [30, 90]) {   // the last 30 days first, then the 90 for the shelves left
    const v = zeros(m.tracks.length);
    for (let i = 0; i < v.length; i++) { const n = s.count(i as i32, s.now - days * DAY_S, s.now + 1); if (n >= 2 && m.pickable(i as i32)) v[i] = n + s.aff[i] / 100; }
    for (const i of topBy(s, all(s), v, m.tracks.length as i32)) {
      if (seeds.length >= shelves) break;
      if (artists.has(m.artist[i])) continue;
      artists.add(m.artist[i]); seeds.push(i);
    }
  }
  const out: Shelf[] = [];
  for (let k = 0; k < seeds.length; k++) {
    const seed = m.tracks[seeds[k]];
    const list = genius(m, seed.id, 25);
    if (list.length < 5) continue;
    const listIds: string[] = [];
    for (const t of list) listIds.push(t.id);
    const name = seed.artist !== '' ? seed.artist : seed.title;
    const cards: Card[] = [card('draft', `because:${k}`, `More like ${seed.title}`, `${seed.artist} and similar songs`, listIds)];
    const seen = new Set<string>();
    seen.add(albumKey(seed));
    for (const t of list) {
      const a = albumKey(t);
      if (seen.has(a)) continue;
      seen.add(a);
      cards.push(card('album', a, t.album !== '' ? t.album : 'Unknown album', t.albumArtist !== '' ? t.albumArtist : t.artist, [t.id]));
      if (cards.length >= 9) break;
    }
    out.push({ id: `because:${k}`, title: `Because you listened to ${name}`, cards: cards });
  }
  return out;
}

/** The songs of the iPod heard most between `from` and `to`, as a draft `id`. */
export function topSongs(s: Signals, id: string, title: string, subtitle: string, from: number, to: number, max: i32): Card[] {
  const v = zeros(s.m.tracks.length);
  for (let i = 0; i < v.length; i++) v[i] = s.count(i as i32, from, to);
  const list = topBy(s, all(s), v, max);
  return list.length > 0 ? [card('draft', id, title, subtitle, ids(s, list))] : [];
}

/** The artists heard most between `from` and `to` (every listen, on the iPod or not), as artist cards: the name, the plays. */
export function topArtists(h: History | null, from: number, to: number, max: i32): Card[] {
  const out: Card[] = [];
  if (h === null) return out;
  for (const r of (h as History).topArtists(from, to, max)) if (r.plays > 0) out.push(card('artist', r.artist, r.artist, `${r.plays} play${r.plays === 1 ? '' : 's'}`, []));
  return out;
}

/** The year of `now` in review. */
export function yearReview(h: History | null, s: Signals, now: number): YearReview {
  const from = yearStart(now), to = Math.min(yearStart(now, 1), now + 1);
  const y: YearReview = { year: new Date(now * 1000).getFullYear() as i32, listens: 0, minutes: 0, artists: [], songs: [], genres: [], months: [] };
  for (let k = 0; k < 12; k++) y.months.push(0);
  if (h === null) return y;
  const hh = h as History;
  const times = hh.times(from, to);
  y.listens = times.length as i32;
  for (const t of times) y.months[new Date(t * 1000).getMonth()] += 1;
  for (const r of hh.topArtists(from, to, 5)) y.artists.push({ name: r.artist, detail: '', count: r.plays });
  for (const r of hh.topTracks(from, to, 5)) if (r.plays > 0) y.songs.push({ name: r.title, detail: r.artist, count: r.plays });
  // minutes and genres: the songs matched on the iPod count their own; the others the mean length of the iPod's songs
  const m = s.m;
  let ms = 0, matched = 0, lib = 0;
  for (const t of m.tracks) lib += t.durationMs;
  const mean = m.tracks.length > 0 ? lib / m.tracks.length : 210000;
  const genres = new Map<string, i32>(), shown = new Map<string, string>();
  for (let k = 0; k < s.flatTs.length; k++) {
    if (s.flatTs[k] < from || s.flatTs[k] >= to) continue;
    const i = s.flatAt[k], t = m.tracks[i];
    matched++;
    ms += t.durationMs > 0 ? t.durationMs : mean;
    if (m.genre[i] !== '') { genres.set(m.genre[i], (genres.has(m.genre[i]) ? genres.get(m.genre[i]) as i32 : 0) + 1); if (!shown.has(m.genre[i])) shown.set(m.genre[i], t.genre); }
  }
  ms += Math.max(0, y.listens - matched) * mean;
  y.minutes = Math.round(ms / 60000) as i32;
  const g: Named[] = [];
  genres.forEach((n: i32, k: string) => { g.push({ name: shown.get(k) as string, detail: '', count: n }); });
  g.sort((a: Named, b: Named) => b.count - a.count !== 0 ? b.count - a.count : a.name < b.name ? -1 : 1);
  y.genres = g.slice(0, 5);
  return y;
}

// ---- tier 2: AudioMuse-AI's deep analysis (services/audiomuse.ts, attached to the model by genius.attachDeep)

/** The seeds of "Sounds like X": the songs heard most lately (30 days, then 90, then by affinity), of different artists, that
 *  AudioMuse analysed. The app asks AudioMuse their near lists (and the path between the first two) before extraShelves. */
export function soundsLikeSeeds(s: Signals, max: i32 = 2): string[] {
  const m = s.m;
  const v = zeros(m.tracks.length);
  for (let i = 0; i < v.length; i++) {
    if (m.sound.length <= i || m.sound[i].length === 0 || !m.pickable(i as i32)) continue;
    v[i] = s.count(i as i32, s.now - 30 * DAY_S, s.now + 1) + s.count(i as i32, s.now - 90 * DAY_S, s.now + 1) / 10 + s.aff[i] / 100;
  }
  const out: string[] = [];
  const artists = new Set<string>();
  for (const i of topBy(s, all(s), v, m.tracks.length as i32)) {
    if (out.length >= max) break;
    if (artists.has(m.artist[i])) continue;
    artists.add(m.artist[i]); out.push(m.tracks[i].id);
  }
  return out;
}

/** Up to `n` songs that sound like `seed` (its near list first, then the sound vectors), the seed first, in Genius' path order. */
function soundsLike(s: Signals, seed: i32, n: i32): i32[] {
  const m = s.m;
  const score = zeros(m.tracks.length), pool: i32[] = [];
  for (let i: i32 = 0; i < m.tracks.length; i++) {
    if (i === seed || !m.pickable(i)) continue;
    const d = m.sounds(seed, i);
    if (d > 0.5) { score[i] = d; pool.push(i); }   // above 0.5: closer than the library's average song
  }
  return path(m, seed, topBy(s, pool, score, 4 * n), score, n);
}

const MOOD_MIN: i32 = 5;

/** Mood mixes: each analysed song goes to the mood it has most above the library's mean (AudioMuse's danceable, aggressive, happy,
 *  party, relaxed, sad); the moods with at least 5 songs, the largest first (at most `max`), each its songs most in that mood. */
function moodMixes(s: Signals, d: Deep, max: i32 = 6, size: i32 = 50): Card[] {
  const m = s.m;
  const moods: Map<string, number>[] = [];
  const mean = new Map<string, number>();
  const at: i32[] = [];
  for (const t of d.tracks) {
    const i = m.index.get(t.id);
    if (i === undefined || !m.pickable(i as i32)) continue;
    const x = moodsOf(t);
    x.forEach((v: number, k: string) => { mean.set(k, (mean.has(k) ? mean.get(k) as number : 0) + v); });
    moods.push(x); at.push(i as i32);
  }
  mean.forEach((v: number, k: string) => { mean.set(k, v / moods.length); });
  const groups = new Map<string, i32[]>();
  const lift = zeros(m.tracks.length);
  for (let k = 0; k < moods.length; k++) {
    let best = '', bestV = 0;
    moods[k].forEach((v: number, name: string) => { const l = v - (mean.get(name) as number); if (l > bestV || (l === bestV && best !== '' && name < best)) { best = name; bestV = l; } });
    if (best === '') continue;
    lift[at[k]] = bestV + 1e-6;
    const g = groups.get(best); if (g === undefined) groups.set(best, [at[k]]); else (g as i32[]).push(at[k]);
  }
  const names: string[] = [];
  groups.forEach((g: i32[], name: string) => { if (g.length >= MOOD_MIN) names.push(name); });
  names.sort((a: string, b: string) => (groups.get(b) as i32[]).length - (groups.get(a) as i32[]).length !== 0 ? (groups.get(b) as i32[]).length - (groups.get(a) as i32[]).length : a < b ? -1 : 1);
  const out: Card[] = [];
  for (const name of names.slice(0, max)) {
    const list = topBy(s, groups.get(name) as i32[], lift, size);
    const shown = name.charAt(0).toUpperCase() + name.slice(1);
    out.push(card('draft', `mood:${name}`, shown, `${list.length} songs that feel ${name}`, ids(s, ordered(s, list))));
  }
  return out;
}

/** Tier 2 shelves, when AudioMuse analysed this iPod: "Sounds like X" for the two seeds of soundsLikeSeeds (X's list, then lists from
 *  three of its closest songs by other artists; the first shelf also has AudioMuse's smooth path from one seed to the other when the
 *  app fetched it), and the Mood mixes. [] without deep results. */
export function extraShelves(s: Signals): Shelf[] {
  const m = s.m;
  if (m.deep === null) return [];
  const d = m.deep as Deep;
  const out: Shelf[] = [];
  const seeds = soundsLikeSeeds(s);
  for (let k = 0; k < seeds.length; k++) {
    const seed = m.index.get(seeds[k]) as i32, t = m.tracks[seed];
    const list = soundsLike(s, seed, 25);
    if (list.length < 5) continue;
    const cards: Card[] = [card('draft', `sounds:${k}`, `Sounds like ${t.title}`, `${t.artist} · close in sound (deep analysis)`, ids(s, list))];
    const used = new Set<string>();
    used.add(m.artist[seed]);
    for (const i of list) {
      if (cards.length >= 4) break;
      if (used.has(m.artist[i])) continue;
      used.add(m.artist[i]);
      const more = soundsLike(s, i, 25);
      if (more.length >= 5) cards.push(card('draft', `sounds:${k}:${cards.length}`, `Sounds like ${m.tracks[i].title}`, `${m.tracks[i].artist} · close in sound`, ids(s, more)));
    }
    if (k === 0 && seeds.length >= 2) {
      const p = pathOf(d, seeds[0], seeds[1]);
      if (p !== null && (p as DeepPath).ids.length >= 3) {
        const to = m.index.get(seeds[1]);
        const name = to !== undefined ? m.tracks[to as i32].title : '';
        cards.push(card('draft', 'sounds:path', `From ${t.title} to ${name}`, 'A smooth path in sound (deep analysis)', (p as DeepPath).ids.filter((id: string) => m.index.has(id))));
      }
    }
    out.push({ id: `sounds:${k}`, title: `Sounds like ${t.title}`, cards: cards });
  }
  const moods = moodMixes(s, d);
  if (moods.length > 0) out.push({ id: 'moods', title: 'Mood mixes', cards: moods });
  return out;
}
