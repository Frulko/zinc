// The listening history of the person (not of one iPod: Last.fm and ListenBrainz cover every device), in one SQLite database
// (zinc:sqlite) beside the backups: <backups>/history/history.sqlite (~/.zinc/ipod/history/ by default). No UI and no app state here:
// the importers (services/historyImport.ts) and the app (services/historyJobs.ts) call it; the For you page reads it through the
// queries at the end.
//   listens   one row per listen: when, artist, title, album, MBIDs, duration, source (lastfm | listenbrainz | local:<GUID>), skipped.
//             `uid` makes a re-import idempotent; a listen of another source within a minute of one already kept is the same listen
//             (the app scrobbles what it plays to Last.fm: the local line and the Last.fm row are one listen) and is not added twice.
//   loved     the loved tracks; top: the services' own top tracks and artists per period (a first impression before the history).
//   matches   each distinct (artist, title) to a track of each iPod (by GUID): the track's id, the score and how it was found;
//             unmatched pairs are kept too (track_id '') so that they are not searched again until that iPod's library changes.
//   meta      the importers' checkpoints and how far each iPod's history.jsonl was read.
import { Database, Row } from 'zinc:sqlite';
import * as fs from 'zinc:fs';
import { SESSION_GAP_S, normArtist, normTitle, trackKey, artistVariants } from './norm';
import { Budget } from './slice';

const SAME_LISTEN_S: number = 60;

export class Listen {
  /** Unix seconds, when it started. */
  ts: number = 0;
  artist: string = ''; title: string = ''; album: string = '';
  artistMbid: string = ''; albumMbid: string = ''; trackMbid: string = '';
  durationMs: number = 0;
  /** lastfm | listenbrainz | local:<GUID> */
  source: string = '';
  skipped: boolean = false;
  /** Set for a local listen (its listen id): a later line for it replaces the row. '' builds one from the source, time and track. */
  uid: string = '';
}

/** A track of an iPod, as the matcher sees it. */
export interface LibTrack { id: string; artist: string; albumArtist: string; title: string; album: string; mbid: string; }

// ---- fuzzy

function jaro(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am: boolean[] = [], bm: boolean[] = [];
  for (let i = 0; i < a.length; i++) am.push(false);
  for (let i = 0; i < b.length; i++) bm.push(false);
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - range), hi = Math.min(b.length - 1, i + range);
    for (let j = lo; j <= hi; j++) if (!bm[j] && a[i] === b[j]) { am[i] = true; bm[j] = true; m++; break; }
  }
  if (m === 0) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  return (m / a.length + m / b.length + (m - t / 2) / m) / 3;
}

/** Jaro-Winkler on the words sorted (word order does not count). */
export function similarity(a: string, b: string): number {
  const x = a.split(' ').sort().join(' '), y = b.split(' ').sort().join(' ');
  const j = jaro(x, y);
  let p = 0;
  while (p < 4 && p < x.length && p < y.length && x[p] === y[p]) p++;
  return j + p * 0.1 * (1 - j);
}

const FUZZY_MIN = 0.90, FUZZY_MARGIN = 0.03;

// ---- the store

export class Counts { listens: i32 = 0; matchedListens: i32 = 0; songs: i32 = 0; unmatchedSongs: i32 = 0; unmatchedListens: i32 = 0; }
export class Ranked { key: string = ''; artist: string = ''; title: string = ''; plays: i32 = 0; skips: i32 = 0; last: number = 0; }
export class PodPlays { trackId: string = ''; plays: i32 = 0; skips: i32 = 0; last: number = 0; }
export class Session { start: number = 0; end: number = 0; listens: i32 = 0; }
export class MatchResult { trackId: string = ''; score: number = 0; method: string = ''; }
/** A listen of a track of an iPod (podListens): crosses to the recommendation worker, so an interface (data, no class). */
export interface PodListen { ts: number; trackId: string; skipped: boolean; }

function str(r: Row, name: string): string { return r.isNull(name) ? '' : r.text(name); }

export class History {
  db: Database;

  /** Opens (creating it) the database `file`. */
  constructor(file: string) {
    const slash = file.lastIndexOf('/');
    if (slash > 0) fs.mkdir(file.slice(0, slash), true);
    this.db = new Database(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS listens (uid TEXT PRIMARY KEY, ts INTEGER NOT NULL, artist TEXT NOT NULL, title TEXT NOT NULL, album TEXT,
        artist_mbid TEXT, album_mbid TEXT, track_mbid TEXT, duration_ms INTEGER, source TEXT NOT NULL, skipped INTEGER NOT NULL,
        artist_key TEXT NOT NULL, track_key TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS listens_ts ON listens (ts);
      CREATE INDEX IF NOT EXISTS listens_artist ON listens (artist_key, ts);
      CREATE INDEX IF NOT EXISTS listens_track ON listens (track_key, ts);
      CREATE TABLE IF NOT EXISTS loved (track_key TEXT PRIMARY KEY, artist TEXT, title TEXT, track_mbid TEXT, ts INTEGER, source TEXT);
      CREATE TABLE IF NOT EXISTS top (source TEXT, kind TEXT, period TEXT, rank INTEGER, artist TEXT, title TEXT, plays INTEGER,
        PRIMARY KEY (source, kind, period, rank));
      CREATE TABLE IF NOT EXISTS matches (guid TEXT, track_key TEXT, track_id TEXT, score REAL, method TEXT, PRIMARY KEY (guid, track_key));
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);`);
  }

  close(): void { this.db.close(); }

  get(k: string): string { const r = this.db.prepare('SELECT v FROM meta WHERE k = ?').get([k]); return r !== null ? str(r as Row, 'v') : ''; }
  getNumber(k: string): number { const v = this.get(k); return v !== '' ? Number(v) : 0; }
  set(k: string, v: string): void { this.db.prepare('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)').run([k, v]); }

  /** Adds a listen; false when it was there already (same uid, or the same listen from another source). Call it in a transaction
   *  for a batch: one commit per listen is slow. */
  add(l: Listen): boolean {
    if (l.artist === '' || l.title === '' || !(l.ts > 0)) return false;
    const key = trackKey(l.artist, l.title);
    const ts = Math.floor(l.ts);
    if (!l.skipped && this.db.prepare('SELECT 1 FROM listens WHERE track_key = ? AND ts BETWEEN ? AND ? AND source <> ? AND skipped = 0 AND uid <> ? LIMIT 1')
      .get([key, ts - SAME_LISTEN_S, ts + SAME_LISTEN_S, l.source, l.uid]) !== null) return false;
    const uid = l.uid !== '' ? l.uid : `${l.source}:${ts}:${key}`;
    const verb = l.uid !== '' ? 'INSERT OR REPLACE' : 'INSERT OR IGNORE';
    return this.db.prepare(`${verb} INTO listens (uid, ts, artist, title, album, artist_mbid, album_mbid, track_mbid, duration_ms, source, skipped, artist_key, track_key) ` +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run([uid, ts, l.artist, l.title, l.album, l.artistMbid, l.albumMbid, l.trackMbid, Math.floor(l.durationMs), l.source, l.skipped ? 1 : 0, normArtist(l.artist), key]).changes > 0;
  }

  /** Marks a song loved (by its names, or `trackMbid` alone: its names are then taken from a listen with that MBID). */
  love(artist: string, title: string, trackMbid: string, ts: number, source: string): void {
    let a = artist, t = title;
    if ((a === '' || t === '') && trackMbid !== '') {
      const r = this.db.prepare('SELECT artist, title FROM listens WHERE track_mbid = ? LIMIT 1').get([trackMbid]);
      if (r === null) return;
      a = str(r as Row, 'artist'); t = str(r as Row, 'title');
    }
    if (a === '' || t === '') return;
    this.db.prepare('INSERT OR REPLACE INTO loved (track_key, artist, title, track_mbid, ts, source) VALUES (?, ?, ?, ?, ?, ?)')
      .run([trackKey(a, t), a, t, trackMbid, Math.floor(ts), source]);
  }

  /** Replaces a service's top list of `kind` (tracks | artists) for `period` (overall, 12month, 6month, 3month, 1month, 7day). */
  setTop(source: string, kind: string, period: string, rows: Ranked[]): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM top WHERE source = ? AND kind = ? AND period = ?').run([source, kind, period]);
      const ins = this.db.prepare('INSERT INTO top (source, kind, period, rank, artist, title, plays) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (let i = 0; i < rows.length; i++) ins.run([source, kind, period, i + 1, rows[i].artist, rows[i].title, rows[i].plays]);
    });
  }

  /** Imports what an iPod's history.jsonl (services/listening.ts) gained since the last call; the number of lines read. */
  importLocal(guid: string, file: string): i32 {
    if (!fs.exists(file)) return 0;
    const text = fs.readText(file);
    const k = `local.${guid}.offset`;
    let from = this.getNumber(k);
    if (from > text.length) from = 0;   // a new file
    const end = text.lastIndexOf('\n') + 1;   // a line being written is read next time
    if (end <= from) return 0;
    let n: i32 = 0;
    this.db.transaction(() => {
      for (const line of text.slice(from, end).split('\n')) {
        if (line.trim() === '') continue;
        try {
          const h = JSON.parse(line);
          const l = new Listen();
          l.ts = Math.floor(Date.parse('' + h.startedAt) / 1000);
          l.artist = '' + h.artist; l.title = '' + h.title; l.album = h.album !== undefined ? '' + h.album : '';
          l.durationMs = h.durationMs !== undefined ? Number(h.durationMs) : 0;
          l.source = `local:${guid}`;
          l.skipped = h.skipped === true;
          l.uid = `local:${guid}:${h.listen}`;
          this.add(l);
          n++;
        } catch (e) { /* a damaged line: skipped */ }
      }
      this.set(k, `${end}`);
    });
    return n;
  }

  // ---- matching

  /** Matches every song of the history not matched yet on the iPod `guid` to its `tracks`; all again when `signature` (the library's
   *  marker) changed. Returns the songs looked at. */
  match(guid: string, tracks: LibTrack[], signature: string): i32 {
    const sigKey = `match.${guid}.signature`;
    if (this.get(sigKey) !== signature) {
      this.db.transaction(() => { this.db.prepare('DELETE FROM matches WHERE guid = ?').run([guid]); this.set(sigKey, signature); });
    }
    const pending = this.db.prepare('SELECT track_key, artist, title, album, track_mbid FROM listens WHERE track_key NOT IN ' +
      '(SELECT track_key FROM matches WHERE guid = ?) GROUP BY track_key').all([guid]);
    if (pending.length === 0) return 0;
    // the library's indexes: by MBID, by exact key (artist, album artist and their first names), by the artist's first 3 letters
    const byMbid = new Map<string, LibTrack>();
    const byKey = new Map<string, LibTrack[]>();
    const byBlock = new Map<string, LibTrack[]>();
    const push = (m: Map<string, LibTrack[]>, k: string, t: LibTrack): void => {
      const l = m.get(k);
      if (l === undefined) m.set(k, [t]); else if ((l as LibTrack[]).indexOf(t) < 0) (l as LibTrack[]).push(t);
    };
    for (const t of tracks) {
      if (t.mbid !== '') byMbid.set(t.mbid, t);
      const title = normTitle(t.title);
      const names = artistVariants(t.artist);
      if (t.albumArtist !== '') for (const v of artistVariants(t.albumArtist)) if (names.indexOf(v) < 0) names.push(v);
      for (const a of names) { push(byKey, `${a}|${title}`, t); push(byBlock, a.slice(0, 3), t); }
    }
    const ins = this.db.prepare('INSERT OR REPLACE INTO matches (guid, track_key, track_id, score, method) VALUES (?, ?, ?, ?, ?)');
    this.db.transaction(() => {
      for (const r of pending) {
        const m = matchOne(str(r, 'artist'), str(r, 'title'), str(r, 'album'), str(r, 'track_mbid'), byMbid, byKey, byBlock);
        ins.run([guid, str(r, 'track_key'), m.trackId, m.score, m.method]);
      }
    });
    return pending.length;
  }

  /** The match of the song (artist, title) on the iPod `guid`; method '' when it was not looked at yet. */
  matchOf(guid: string, artist: string, title: string): MatchResult {
    const m = new MatchResult();
    const r = this.db.prepare('SELECT track_id, score, method FROM matches WHERE guid = ? AND track_key = ?').get([guid, trackKey(artist, title)]);
    if (r !== null) { m.trackId = str(r as Row, 'track_id'); m.score = (r as Row).number('score'); m.method = str(r as Row, 'method'); }
    return m;
  }

  // ---- queries (the For you page)

  /** The listens (not skipped), and how many of them and of the songs are matched on the iPod `guid`. */
  counts(guid: string): Counts {
    const c = new Counts();
    const one = (sql: string, p: unknown[]): i32 => { const r = this.db.prepare(sql).get(p); return r !== null ? (r as Row).number('n') as i32 : 0; };
    c.listens = one('SELECT count(*) AS n FROM listens WHERE skipped = 0', []);
    c.songs = one('SELECT count(DISTINCT track_key) AS n FROM listens WHERE skipped = 0', []);
    c.matchedListens = one("SELECT count(*) AS n FROM listens l JOIN matches m ON m.guid = ? AND m.track_key = l.track_key AND m.track_id <> '' WHERE l.skipped = 0", [guid]);
    c.unmatchedSongs = one("SELECT count(DISTINCT l.track_key) AS n FROM listens l JOIN matches m ON m.guid = ? AND m.track_key = l.track_key AND m.track_id = '' WHERE l.skipped = 0", [guid]);
    c.unmatchedListens = one("SELECT count(*) AS n FROM listens l JOIN matches m ON m.guid = ? AND m.track_key = l.track_key AND m.track_id = '' WHERE l.skipped = 0", [guid]);
    return c;
  }

  private ranked(sql: string, p: unknown[]): Ranked[] {
    const out: Ranked[] = [];
    for (const r of this.db.prepare(sql).all(p)) {
      const x = new Ranked();
      x.key = str(r, 'k'); x.artist = str(r, 'artist'); x.title = str(r, 'title');
      x.plays = r.number('plays') as i32; x.skips = r.number('skips') as i32; x.last = r.number('last');
      out.push(x);
    }
    return out;
  }

  /** The songs most played between `from` and `to` (Unix seconds, `to` excluded), with their skips and last listen. */
  topTracks(from: number, to: number, limit: i32): Ranked[] {
    return this.ranked('SELECT track_key AS k, artist, title, sum(1 - skipped) AS plays, sum(skipped) AS skips, max(ts) AS last FROM listens ' +
      'WHERE ts >= ? AND ts < ? GROUP BY track_key ORDER BY plays DESC, last DESC LIMIT ?', [from, to, limit]);
  }

  /** The artists most played between `from` and `to`. */
  topArtists(from: number, to: number, limit: i32): Ranked[] {
    return this.ranked("SELECT artist_key AS k, artist, '' AS title, sum(1 - skipped) AS plays, sum(skipped) AS skips, max(ts) AS last FROM listens " +
      'WHERE ts >= ? AND ts < ? GROUP BY artist_key ORDER BY plays DESC, last DESC LIMIT ?', [from, to, limit]);
  }

  /** The songs never matched on the iPod `guid`, most played first (what the iPod is missing). */
  unmatchedTracks(guid: string, limit: i32): Ranked[] {
    return this.ranked("SELECT l.track_key AS k, l.artist, l.title, count(*) AS plays, 0 AS skips, max(l.ts) AS last FROM listens l JOIN matches m ON m.guid = ? " +
      "AND m.track_key = l.track_key AND m.track_id = '' WHERE l.skipped = 0 GROUP BY l.track_key ORDER BY plays DESC, last DESC LIMIT ?", [guid, limit]);
  }

  /** The artists of the unmatched songs, most played first. */
  unmatchedArtists(guid: string, limit: i32): Ranked[] {
    return this.ranked("SELECT l.artist_key AS k, l.artist, '' AS title, count(*) AS plays, 0 AS skips, max(l.ts) AS last FROM listens l JOIN matches m ON m.guid = ? " +
      "AND m.track_key = l.track_key AND m.track_id = '' WHERE l.skipped = 0 GROUP BY l.artist_key ORDER BY plays DESC, last DESC LIMIT ?", [guid, limit]);
  }

  /** The plays, skips and last listen of each track of the iPod `guid` between `from` and `to` (tracks never heard are left out). */
  podPlays(guid: string, from: number, to: number): PodPlays[] {
    const out: PodPlays[] = [];
    for (const r of this.db.prepare('SELECT m.track_id AS id, sum(1 - l.skipped) AS plays, sum(l.skipped) AS skips, max(l.ts) AS last FROM listens l ' +
      "JOIN matches m ON m.guid = ? AND m.track_key = l.track_key AND m.track_id <> '' WHERE l.ts >= ? AND l.ts < ? GROUP BY m.track_id ORDER BY plays DESC").all([guid, from, to])) {
      const p = new PodPlays();
      p.trackId = str(r, 'id'); p.plays = r.number('plays') as i32; p.skips = r.number('skips') as i32; p.last = r.number('last');
      out.push(p);
    }
    return out;
  }

  /** Every listen of a track matched on the iPod `guid`, oldest first (services/genius.ts reads the sessions from it), read a batch at
   *  a time within the budget `b` (100,000 listens take most of a second). */
  async podListens(guid: string, b: Budget = new Budget()): Promise<PodListen[]> {
    const out: PodListen[] = [];
    // CROSS JOIN: the listens in the order of their time index, each looked up in the matches, so each batch reads only its rows
    // (the planner's order, matches first, sorted all of them before the first row: a third of a second for 100,000)
    const cur = this.db.prepare('SELECT l.ts AS ts, m.track_id AS id, l.skipped AS skipped FROM listens l ' +
      "CROSS JOIN matches m ON m.guid = ? AND m.track_key = l.track_key AND m.track_id <> '' ORDER BY l.ts, l.rowid").cursor([guid]);
    while (!cur.done) {
      for (const r of cur.next(500)) {
        const id = r[1];
        out.push({ ts: r[0] as number, trackId: typeof id === 'string' ? id as string : typeof id === 'number' ? `${id as number}` : '', skipped: (r[2] as number) !== 0 });
      }
      await b.check();
    }
    return out;
  }

  /** When the song was last heard (not skipped), 0 when never. */
  lastPlayed(artist: string, title: string): number {
    const r = this.db.prepare('SELECT max(ts) AS t FROM listens WHERE track_key = ? AND skipped = 0').get([trackKey(artist, title)]);
    return r !== null && !(r as Row).isNull('t') ? (r as Row).number('t') : 0;
  }

  /** The listening sessions between `from` and `to`: a listen that starts more than SESSION_GAP_S after the previous one ended
   *  (its start plus its length when known) begins a new one. */
  sessions(from: number, to: number): Session[] {
    const out: Session[] = [];
    let s: Session | null = null;
    for (const r of this.db.prepare('SELECT ts, duration_ms FROM listens WHERE ts >= ? AND ts < ? AND skipped = 0 ORDER BY ts').all([from, to])) {
      const ts = r.number('ts');
      const end = ts + (r.isNull('duration_ms') ? 0 : r.number('duration_ms') / 1000);
      if (s === null || ts - (s as Session).end > SESSION_GAP_S) { s = new Session(); (s as Session).start = ts; (s as Session).end = end; out.push(s as Session); }
      const cur = s as Session;
      cur.listens++;
      if (end > cur.end) cur.end = end;
    }
    return out;
  }

  /** The loved songs: [artist, title] pairs, newest first. */
  loved(limit: i32): Ranked[] {
    return this.ranked('SELECT track_key AS k, artist, title, 0 AS plays, 0 AS skips, ts AS last FROM loved ORDER BY ts DESC LIMIT ?', [limit]);
  }

  /** The iPod `guid`'s tracks whose song is loved (their ids). */
  lovedOn(guid: string): string[] {
    const out: string[] = [];
    for (const r of this.db.prepare("SELECT DISTINCT m.track_id AS id FROM loved v JOIN matches m ON m.guid = ? AND m.track_key = v.track_key AND m.track_id <> ''").all([guid])) out.push(str(r, 'id'));
    return out;
  }

  /** When each listen (not skipped) between `from` and `to` started, oldest first. */
  times(from: number, to: number): number[] {
    const out: number[] = [];
    for (const r of this.db.prepare('SELECT ts FROM listens WHERE ts >= ? AND ts < ? AND skipped = 0 ORDER BY ts').all([from, to])) out.push(r.number('ts'));
    return out;
  }

  /** Changes whenever a listen, a love or a match of the iPod `guid` is added or removed (the For you page keeps its shelves under it). */
  version(guid: string): string {
    const a = this.db.prepare('SELECT count(*) AS n, max(ts) AS t FROM listens').get([]) as Row;
    const b = this.db.prepare('SELECT count(*) AS n FROM loved').get([]) as Row;
    const c = this.db.prepare("SELECT count(*) AS n FROM matches WHERE guid = ? AND track_id <> ''").get([guid]) as Row;
    return `${a.number('n')}:${a.isNull('t') ? 0 : a.number('t')}:${b.number('n')}:${c.number('n')}:${this.get(`match.${guid}.signature`)}`;
  }

  /** A service's top list as it gave it. */
  top(source: string, kind: string, period: string): Ranked[] {
    return this.ranked("SELECT '' AS k, artist, title, plays, 0 AS skips, 0 AS last FROM top WHERE source = ? AND kind = ? AND period = ? ORDER BY rank", [source, kind, period]);
  }
}

function matchOne(artist: string, title: string, album: string, mbid: string, byMbid: Map<string, LibTrack>, byKey: Map<string, LibTrack[]>,
                  byBlock: Map<string, LibTrack[]>): MatchResult {
  const m = new MatchResult();
  if (mbid !== '') {
    const t = byMbid.get(mbid);
    if (t !== undefined) { m.trackId = (t as LibTrack).id; m.score = 1; m.method = 'mbid'; return m; }
  }
  const nt = normTitle(title), na = normAlbum(album);
  const variants = artistVariants(artist);
  for (const a of variants) {
    const found = byKey.get(`${a}|${nt}`);
    if (found === undefined) continue;
    let best = (found as LibTrack[])[0];   // the same song on two albums: the one of the album heard
    for (const t of found as LibTrack[]) if (na !== '' && normAlbum(t.album) === na) best = t;
    m.trackId = best.id; m.score = 1; m.method = 'exact';
    return m;
  }
  // fuzzy, among the tracks whose artist starts with the same 3 letters; the second best song must be clearly behind
  const cands = byBlock.get(variants[0].slice(0, 3));
  m.method = 'none';
  if (cands === undefined) return m;
  let best = 0, second = 0, bestKey = '';
  let bestTrack: LibTrack | null = null;
  for (const t of cands as LibTrack[]) {
    const ts = similarity(nt, normTitle(t.title));
    let as = similarity(variants[0], normArtist(t.artist));
    if (t.albumArtist !== '') as = Math.max(as, similarity(variants[0], normArtist(t.albumArtist)));
    const score = na !== '' && t.album !== '' ? 0.55 * ts + 0.35 * as + 0.10 * similarity(na, normAlbum(t.album)) : (0.55 * ts + 0.35 * as) / 0.9;
    const key = `${normArtist(t.artist)}|${normTitle(t.title)}`;
    if (score > best) { if (key !== bestKey) second = best; best = score; bestKey = key; bestTrack = t; }
    else if (key !== bestKey && score > second) second = score;
  }
  if (bestTrack !== null && best >= FUZZY_MIN && best - second >= FUZZY_MARGIN) { m.trackId = (bestTrack as LibTrack).id; m.score = best; m.method = 'fuzzy'; }
  else m.score = best;
  return m;
}

function normAlbum(album: string): string { return normTitle(album); }

/** The listen history.jsonl and the library.json of each iPod in `cacheDir` (services/cache.ts: one folder per GUID): the new lines
 *  imported, then the songs matched to that iPod's library. The lines read and songs looked at (0: nothing changed). */
export function syncPods(h: History, cacheDir: string): i32 {
  let n: i32 = 0;
  if (!fs.exists(cacheDir)) return n;
  for (const e of fs.readDir(cacheDir)) {
    if (!e.isDirectory) continue;
    const dir = `${cacheDir}/${e.name}`;
    try { n += h.importLocal(e.name, `${dir}/history.jsonl`); } catch (x) { console.error(`history: ${dir}/history.jsonl: ${(x as Error).message}`); }
    try {
      if (!fs.exists(`${dir}/library.json`)) continue;
      const snap = JSON.parse(fs.readText(`${dir}/library.json`));
      const tracks: LibTrack[] = [];
      const list = snap.tracks;
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        tracks.push({ id: '' + t.id, artist: '' + t.artist, albumArtist: t.albumArtist !== undefined ? '' + t.albumArtist : '', title: '' + t.title,
          album: t.album !== undefined ? '' + t.album : '', mbid: t.mbid !== undefined ? '' + t.mbid : '' });
      }
      n += h.match(e.name, tracks, '' + snap.marker);
    } catch (x) { console.error(`history: ${dir}/library.json: ${(x as Error).message}`); }
  }
  return n;
}
