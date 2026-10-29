// zinc:ipod smart playlists in TypeScript: evaluateSmart() fills a smart playlist from Track records the way libgpod's itdb_spl_update
// does on the iPod's database (the same rules, limits and sorts), so an app can preview rules without writing, and the sim stand-in
// answers like the native side. describeSmart() says the rules in one line.
import type { Track, Playlist, SmartRules, SmartRule } from './native/ipod.spec';

/** The fields a rule can test (ipod.spec.ts SmartRule). The evaluator knows those Track has; grouping, kind, tvShow, season,
 *  compilation, modified and videoKind are evaluated only by the native side (a rule on them never matches here). */
export type SmartField = 'title' | 'album' | 'artist' | 'albumArtist' | 'composer' | 'genre' | 'comment' | 'grouping' | 'kind' | 'tvShow' |
  'bitrate' | 'sampleRate' | 'year' | 'trackNr' | 'cdNr' | 'size' | 'durationMs' | 'playCount' | 'skipCount' | 'rating' | 'bpm' | 'season' |
  'added' | 'modified' | 'lastPlayed' | 'lastSkipped' | 'compilation' | 'playlist' | 'videoKind';
export type SmartAction = 'is' | 'isNot' | 'contains' | 'doesNotContain' | 'startsWith' | 'doesNotStartWith' | 'endsWith' | 'doesNotEndWith' |
  'greaterThan' | 'notGreaterThan' | 'lessThan' | 'notLessThan' | 'inRange' | 'notInRange' | 'inTheLast' | 'notInTheLast';
export type SmartLimitType = 'none' | 'songs' | 'minutes' | 'hours' | 'MB' | 'GB';
export type SmartSort = 'random' | 'title' | 'album' | 'artist' | 'genre' | 'mostRecentlyAdded' | 'leastRecentlyAdded' | 'mostOftenPlayed' |
  'leastOftenPlayed' | 'mostRecentlyPlayed' | 'leastRecentlyPlayed' | 'highestRating' | 'lowestRating';

/** Every SmartField, for an editor's menu and for checking a rule before writing it. */
export const SMART_FIELDS: string[] = ['title', 'album', 'artist', 'albumArtist', 'composer', 'genre', 'comment', 'grouping', 'kind', 'tvShow',
  'bitrate', 'sampleRate', 'year', 'trackNr', 'cdNr', 'size', 'durationMs', 'playCount', 'skipCount', 'rating', 'bpm', 'season',
  'added', 'modified', 'lastPlayed', 'lastSkipped', 'compilation', 'playlist', 'videoKind'];
const UNITS: string[] = ['minutes', 'hours', 'days', 'weeks', 'months', 'years', 'seconds'];
const UNIT_SECONDS: number[] = [60, 3600, 86400, 604800, 2628000, 31536000, 1];
const TEXT: string[] = ['title', 'album', 'artist', 'albumArtist', 'composer', 'genre', 'comment'];
const DATES: string[] = ['added', 'lastPlayed', 'lastSkipped'];

/** Rules with nothing set: match all, no rule (every track), no limit, live. */
export function emptyRules(): SmartRules {
  return { match: 'all', rules: [], limit: { type: 'none', value: 0, sort: '' }, liveUpdate: true, checkedOnly: false, refreshable: true };
}

function text(t: Track, f: string): string {
  if (f === 'title') return t.title;
  if (f === 'album') return t.album;
  if (f === 'artist') return t.artist;
  if (f === 'albumArtist') return t.albumArtist;
  if (f === 'composer') return t.composer;
  if (f === 'genre') return t.genre;
  return t.comment;
}
function num(t: Track, f: string): number {
  if (f === 'bitrate') return t.bitrate;
  if (f === 'sampleRate') return t.sampleRate;
  if (f === 'year') return t.year;
  if (f === 'trackNr') return t.trackNr;
  if (f === 'cdNr') return t.cdNr;
  if (f === 'size') return t.size;
  if (f === 'durationMs') return t.durationMs;
  if (f === 'playCount') return t.playCount;
  if (f === 'skipCount') return t.skipCount;
  if (f === 'rating') return t.rating;
  if (f === 'bpm') return t.bpm;
  if (f === 'added') return t.added;
  if (f === 'lastPlayed') return t.lastPlayed;
  if (f === 'lastSkipped') return t.lastSkipped;
  return -1;
}

/** One rule against one track, as itdb_splr_eval: text without case (a song without the tag never matches, "is not" included), ranges
 *  in either order, "in the last" against `now` (Unix seconds). */
export function ruleMatches(r: SmartRule, t: Track, playlists: Playlist[], now: number): boolean {
  const a = r.action;
  if (TEXT.indexOf(r.field) >= 0) {
    const v = text(t, r.field).toLowerCase(), w = r.text.toLowerCase();
    if (v === '') return false;   // libgpod: a song without the tag matches no text rule, "is not" included
    if (a === 'is') return v === w;
    if (a === 'isNot') return v !== w;
    if (a === 'contains') return v.indexOf(w) >= 0;
    if (a === 'doesNotContain') return v.indexOf(w) < 0;
    if (a === 'startsWith') return v.startsWith(w);
    if (a === 'doesNotStartWith') return !v.startsWith(w);
    if (a === 'endsWith') return v.endsWith(w);
    if (a === 'doesNotEndWith') return !v.endsWith(w);
    return false;
  }
  if (r.field === 'playlist') {
    for (const p of playlists) if (p.id === r.text) { const has = p.trackIds.indexOf(t.id) >= 0; return a === 'is' ? has : a === 'isNot' ? !has : false; }
    return false;   // libgpod: an unknown playlist matches nothing
  }
  const v = num(t, r.field);
  if (v < 0) return false;   // a field the evaluator does not know
  const date = DATES.indexOf(r.field) >= 0;
  if (a === 'is') return v === r.value;
  if (a === 'isNot') return v !== r.value;
  if (a === 'greaterThan') return v > r.value;
  if (a === 'lessThan') return v < r.value;
  if (a === 'inRange') return (v <= r.value && v >= r.value2) || (v >= r.value && v <= r.value2);
  if (a === 'notInRange') return (v < r.value && v < r.value2) || (v > r.value && v > r.value2);
  if (!date) return false;   // libgpod answers false to the date-only actions on a number
  if (a === 'notGreaterThan') return v <= r.value;
  if (a === 'notLessThan') return v >= r.value;
  const k = UNITS.indexOf(r.units);
  const since = now - r.value * (k >= 0 ? UNIT_SECONDS[k] : 0);
  if (a === 'inTheLast') return v > since;
  if (a === 'notInTheLast') return v <= since;
  return false;
}

function cmpText(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function sorter(sort: string): ((a: Track, b: Track) => number) | null {
  if (sort === 'title') return (a: Track, b: Track) => cmpText(a.title, b.title);
  if (sort === 'album') return (a: Track, b: Track) => cmpText(a.album, b.album);
  if (sort === 'artist') return (a: Track, b: Track) => cmpText(a.artist, b.artist);
  if (sort === 'genre') return (a: Track, b: Track) => cmpText(a.genre, b.genre);
  if (sort === 'mostRecentlyAdded') return (a: Track, b: Track) => b.added - a.added;
  if (sort === 'leastRecentlyAdded') return (a: Track, b: Track) => a.added - b.added;
  if (sort === 'mostOftenPlayed') return (a: Track, b: Track) => b.playCount - a.playCount;
  if (sort === 'leastOftenPlayed') return (a: Track, b: Track) => a.playCount - b.playCount;
  if (sort === 'mostRecentlyPlayed') return (a: Track, b: Track) => b.lastPlayed - a.lastPlayed;
  if (sort === 'leastRecentlyPlayed') return (a: Track, b: Track) => a.lastPlayed - b.lastPlayed;
  if (sort === 'highestRating') return (a: Track, b: Track) => b.rating - a.rating;
  if (sort === 'lowestRating') return (a: Track, b: Track) => a.rating - b.rating;
  return null;
}

/** The ids of the tracks a smart playlist holds, in order, as itdb_spl_update fills it: tracks in the database's order that match all
 *  (or any) rules; with a limit, sorted (stable) and taken while the running total stays within it (a track that would go over is
 *  skipped and the next ones are still tried, as libgpod does). `playlists` serves the playlist rules; `now` (Unix seconds, 0 = now)
 *  the "in the last" ones. checkedOnly is ignored: Track does not say whether a song is checked. A random limit shuffles. */
export function evaluateSmart(rules: SmartRules, tracks: Track[], playlists: Playlist[] = [], now: number = 0): string[] {
  const at = now > 0 ? now : Math.floor(Date.now() / 1000);
  let sel: Track[] = [];
  for (const t of tracks) {
    let ok = rules.match !== 'any' || rules.rules.length === 0;
    for (const r of rules.rules) {
      const m = ruleMatches(r, t, playlists, at);
      if (rules.match === 'any') { if (m) { ok = true; break; } } else if (!m) { ok = false; break; }
    }
    if (ok) sel.push(t);
  }
  const lim = rules.limit;
  if (lim.type !== 'none' && lim.type !== '') {
    const cmp = sorter(lim.sort);
    if (cmp !== null) sel.sort(cmp);
    else if (lim.sort === 'random') for (let i = sel.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const x = sel[i]; sel[i] = sel[j]; sel[j] = x; }
    const kept: Track[] = [];
    let total = 0;
    for (const t of sel) {
      if (total >= lim.value) break;
      const v = lim.type === 'songs' ? 1 : lim.type === 'minutes' ? t.durationMs / 60000 : lim.type === 'hours' ? t.durationMs / 3600000
        : lim.type === 'MB' ? t.size / 1048576 : lim.type === 'GB' ? t.size / 1073741824 : 0;
      if (total + v <= lim.value) { total += v; kept.push(t); }
    }
    sel = kept;
  }
  return sel.map((t: Track) => t.id);
}

const SAY: string[] = ['is', 'is', 'isNot', 'is not', 'contains', 'contains', 'doesNotContain', 'does not contain', 'startsWith', 'starts with',
  'doesNotStartWith', 'does not start with', 'endsWith', 'ends with', 'doesNotEndWith', 'does not end with', 'greaterThan', 'is greater than',
  'notGreaterThan', 'is not after', 'lessThan', 'is less than', 'notLessThan', 'is not before', 'inRange', 'is in the range',
  'notInRange', 'is not in the range', 'inTheLast', 'is in the last', 'notInTheLast', 'is not in the last'];
function say(a: string): string { for (let i = 0; i < SAY.length; i += 2) if (SAY[i] === a) return SAY[i + 1]; return a; }
function day(s: number): string { return new Date(s * 1000).toISOString().slice(0, 10); }

/** One rule in words: "playCount is 0", "bpm is in the range 120 to 130", "lastPlayed is in the last 2 weeks". */
export function describeRule(r: SmartRule, playlists: Playlist[] = []): string {
  const head = r.field + ' ' + say(r.action);
  if (TEXT.indexOf(r.field) >= 0 || ['grouping', 'kind', 'tvShow'].indexOf(r.field) >= 0) return `${head} “${r.text}”`;
  if (r.field === 'playlist') { for (const p of playlists) if (p.id === r.text) return `${head} “${p.name}”`; return `${head} ${r.text}`; }
  if (r.field === 'compilation') return head;
  if (r.action === 'inTheLast' || r.action === 'notInTheLast') return `${head} ${r.value} ${r.units}`;
  const date = r.field === 'added' || r.field === 'modified' || r.field === 'lastPlayed' || r.field === 'lastSkipped';
  const v = (n: number): string => date ? day(n) : r.field === 'rating' ? `${n}★` : '' + n;
  return r.action === 'inRange' || r.action === 'notInRange' ? `${head} ${v(r.value)} to ${v(r.value2)}` : `${head} ${v(r.value)}`;
}

/** The whole set in one line: "Match all: playCount is 0; bpm is in the range 120 to 130 · limit 10 songs by mostRecentlyAdded · live". */
export function describeSmart(rules: SmartRules, playlists: Playlist[] = []): string {
  const parts: string[] = [];
  parts.push(rules.rules.length === 0 ? 'Every song' : `Match ${rules.match}: ${rules.rules.map((r: SmartRule) => describeRule(r, playlists)).join('; ')}`);
  if (rules.limit.type !== 'none' && rules.limit.type !== '') parts.push(`limit ${rules.limit.value} ${rules.limit.type} by ${rules.limit.sort}`);
  if (rules.checkedOnly) parts.push('checked songs only');
  if (rules.liveUpdate) parts.push('live');
  return parts.join(' · ');
}
