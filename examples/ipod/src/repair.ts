// Repair my library: what is wrong with the open iPod's music and how to fix it, each fix shown before it is written.
//   covers     albums without a cover: the front cover of the release MusicBrainz finds (the Cover Art Archive)
//   tags       albums whose songs lack a year or a genre: the release group's first year and most voted genre (MusicBrainz)
//   spellings  artist names that are one name written differently (case, accents, a leading "The"): the spelling most songs use, or
//              Last.fm's (artist.getCorrection) when a Last.fm API key is set
//   duplicates the same song twice (zinc:ipod's analyze: tags with durations within 2 s, identical files, the same sound), merged as the
//              Optimise page merges them (it asks first: copies are removed)
// Looking only reads (the iPod, MusicBrainz, Last.fm: a Transfers job beside the queue); a fix, or Fix all of a group, waits for Allow
// changes and is one Transfers job with one save of the iPod (services/ipod.ts updateMany).
import { createSignal, createMemo, batch } from 'zinc:ui/solid';
import * as ipod from 'zinc:ipod';
import * as fs from 'zinc:fs';
import { library, albums, Album } from './state';
import { PodLibrary, Change, updateMany } from './services/ipod';
import { enqueue, runBeside, busy, Job } from './services/transfers';
import { lookUp, frontCover, known, ReleaseInfo } from './services/musicbrainz';
import { lastfm } from './services/historyImport';
import { loadConfig } from './services/config';
import * as cache from './services/cache';
import { dropCovers } from './services/covers';
import { allowed, refresh, remoteOpen } from './actions';
import { analyse, duplicates, DuplicateRow, mergeRows, tracksById, songName } from './optimise';
import { fold } from './search';
import { count } from './format';

export const COVERS = 'covers', TAGS = 'tags', SPELLINGS = 'spellings', DUPLICATES = 'duplicates';

/** One thing to repair: what is wrong (title, sub), what the fix writes (preview, cover) and its changes ([] until it is known). */
export class Finding {
  kind: string; key: string; title: string; sub: string;
  /** 'ask' (not looked up yet), 'ready', 'none' (nothing found to fix it with). */
  state: string = 'ready';
  preview: string = '';
  cover: string = '';
  changes: Change[] = [];
  dup: DuplicateRow | null = null;
  constructor(kind: string, key: string, title: string, sub: string) { this.kind = kind; this.key = key; this.title = title; this.sub = sub; }
  /** The songs the fix writes. */
  songs(): i32 { const s = new Set<string>(); for (const c of this.changes) for (const id of c.ids) s.add(id); return s.size as i32; }
}

/** What MusicBrainz said of each album asked (by album key), the covers downloaded (by release), Last.fm's spellings (by spelling key). */
// The maps change in place; `learnt` moves on after each change, for what reads them.
const releaseMap = known();
const coverMap = new Map<string, string>();
const correctionMap = new Map<string, string>();
const [learnt, setLearnt] = createSignal<i32>(0);
function releases(): Map<string, ReleaseInfo> { learnt(); return releaseMap; }
function covers(): Map<string, string> { learnt(); return coverMap; }
function corrections(): Map<string, string> { learnt(); return correctionMap; }
function moved(): void { setLearnt(learnt() + 1); }
/** The last look's error ('' when it went well). */
export const [lookError, setLookError] = createSignal<string>('');

function lookable(a: Album): boolean { return a.title !== 'Unknown album' && a.artist !== 'Unknown artist'; }

/** An artist name as one name: folded (case, accents), spaces collapsed, without a leading "the ". */
export function spellingKey(name: string): string {
  let s = fold(name).trim().split(' ').filter((w: string) => w !== '').join(' ');
  if (s.startsWith('the ')) s = s.slice(4);
  return s;
}

function capitals(s: string): i32 { let n = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c >= 65 && c <= 90) n++; } return n as i32; }

function coverFindings(list: Album[], rel: Map<string, ReleaseInfo>, files: Map<string, string>): Finding[] {
  const out: Finding[] = [];
  for (const a of list) {
    if (a.coverTrack !== '' || !lookable(a)) continue;
    const f = new Finding(COVERS, a.key, a.title, `${a.artist} · ${count(a.tracks.length, 'song', 'songs')}`);
    const r = rel.get(a.key);
    if (r === undefined) f.state = 'ask';
    else {
      const file = (r as ReleaseInfo).release !== '' ? files.get((r as ReleaseInfo).release) : undefined;
      if (file === undefined || file === '') { f.state = (r as ReleaseInfo).release !== '' && file === undefined ? 'ask' : 'none'; }
      else {
        f.cover = file as string;
        f.preview = 'the front cover of the release on MusicBrainz';
        const ids: string[] = [];
        for (const t of a.tracks) ids.push(t.id);
        f.changes.push({ ids: ids, patch: { file: '', artworkFile: f.cover } });
      }
    }
    out.push(f);
  }
  return out;
}

function tagFindings(list: Album[], rel: Map<string, ReleaseInfo>): Finding[] {
  const out: Finding[] = [];
  for (const a of list) {
    const noYear: string[] = [], noGenre: string[] = [];
    for (const t of a.tracks) { if (t.year === 0) noYear.push(t.id); if (t.genre === '') noGenre.push(t.id); }
    if ((noYear.length === 0 && noGenre.length === 0) || !lookable(a)) continue;
    const lacks = [noYear.length > 0 ? 'year' : '', noGenre.length > 0 ? 'genre' : ''].filter((s: string) => s !== '').join(' and ');
    const f = new Finding(TAGS, a.key, a.title, `${a.artist} · no ${lacks} on ${count(Math.max(noYear.length, noGenre.length), 'song', 'songs')}`);
    const r = rel.get(a.key);
    if (r === undefined) f.state = 'ask';
    else {
      const info = r as ReleaseInfo, says: string[] = [];
      if (noYear.length > 0 && info.year > 0) { f.changes.push({ ids: noYear, patch: { file: '', year: info.year } }); says.push(`Year ${info.year}`); }
      if (noGenre.length > 0 && info.genre !== '') { f.changes.push({ ids: noGenre, patch: { file: '', genre: info.genre } }); says.push(`Genre ${info.genre}`); }
      if (f.changes.length === 0) f.state = 'none'; else f.preview = says.join(' · ');
    }
    out.push(f);
  }
  return out;
}

function spellingFindings(tracks: ipod.Track[], fixes: Map<string, string>): Finding[] {
  // per spelling key: each spelling and its songs (as artist or album artist)
  const groups = new Map<string, Map<string, i32>>();
  const add = (name: string): void => {
    if (name === '') return;
    const k = spellingKey(name);
    let g = groups.get(k);
    if (g === undefined) { const made = new Map<string, i32>(); groups.set(k, made); g = made; }
    const m = g as Map<string, i32>;
    m.set(name, (m.get(name) ?? 0) + 1);
  };
  for (const t of tracks) if (t.mediaType === 'audio') { add(t.artist); add(t.albumArtist); }
  const out: Finding[] = [];
  groups.forEach((g: Map<string, i32>, k: string) => {
    if (g.size < 2) return;
    const names: string[] = [];
    g.forEach((n: i32, name: string) => { names.push(name); });
    names.sort((x: string, y: string) => { const d = (g.get(y) as i32) - (g.get(x) as i32); return d !== 0 ? d : capitals(y) - capitals(x) !== 0 ? capitals(y) - capitals(x) : (x < y ? -1 : 1); });
    const lf = fixes.get(k);
    const best = lf !== undefined && spellingKey(lf as string) === k ? lf as string : names[0];
    const f = new Finding(SPELLINGS, k, best, names.map((n: string) => `${n} (${g.get(n)})`).join(', '));
    const artistIds: string[] = [], albumArtistIds: string[] = [];
    for (const t of tracks) {
      if (t.mediaType !== 'audio') continue;
      if (t.artist !== '' && t.artist !== best && spellingKey(t.artist) === k) artistIds.push(t.id);
      if (t.albumArtist !== '' && t.albumArtist !== best && spellingKey(t.albumArtist) === k) albumArtistIds.push(t.id);
    }
    if (artistIds.length > 0) f.changes.push({ ids: artistIds, patch: { file: '', artist: best } });
    if (albumArtistIds.length > 0) f.changes.push({ ids: albumArtistIds, patch: { file: '', albumArtist: best } });
    f.preview = `${names.filter((n: string) => n !== best).join(', ')} → ${best}${lf !== undefined ? ' (Last.fm)' : ''}`;
    out.push(f);
  });
  out.sort((a: Finding, b: Finding) => a.key < b.key ? -1 : 1);
  return out;
}

function duplicateFindings(rows: DuplicateRow[]): Finding[] {
  const out: Finding[] = [];
  const byId = tracksById();
  for (const r of rows) {
    const f = new Finding(DUPLICATES, r.group.trackIds.join(','), songName(r.group.trackIds[0], byId), `${count(r.group.trackIds.length, 'copy', 'copies')} · same ${r.group.reasons.join(', ')}`);
    f.dup = r;
    f.preview = `keep ${r.group.quality.length > 0 ? r.group.quality[0] : 'the best copy'}, remove the other${r.group.trackIds.length > 2 ? 's' : ''}`;
    out.push(f);
  }
  return out;
}

/** Every finding of the open iPod, by kind. */
export const findings = createMemo<Finding[]>(() => {
  const lib = library();
  if (lib === null) return [];
  const list = albums();
  const out: Finding[] = [];
  for (const f of coverFindings(list, releases(), covers())) out.push(f);
  for (const f of tagFindings(list, releases())) out.push(f);
  for (const f of spellingFindings((lib as PodLibrary).tracks, corrections())) out.push(f);
  for (const f of duplicateFindings(duplicates())) out.push(f);
  return out;
}, []);

export function ofKind(kind: string): Finding[] { return findings().filter((f: Finding) => f.kind === kind); }

/** True while a look runs. */
export function looking(): boolean { return busy('lookup'); }

/** Looks for what to fix: duplicates (an analysis of the iPod plugged in), then MusicBrainz for the albums not asked yet and their covers,
 *  and Last.fm's spelling of the names written differently (with an API key). Reads only. */
export function lookForProblems(): void {
  if (library() === null || looking()) return;
  if (!remoteOpen()) analyse();
  setLookError('');
  const todo: Album[] = [];
  for (const f of findings()) if (f.state === 'ask' && (f.kind === COVERS || f.kind === TAGS)) for (const a of albums()) if (a.key === f.key && todo.indexOf(a) < 0) todo.push(a);
  const spell: Finding[] = ofKind(SPELLINGS).filter((f: Finding) => corrections().get(f.key) === undefined);
  const key = loadConfig().lastfmKey;
  let stopped = false;
  let job: Job | null = null;
  job = runBeside('lookup', 'Look for problems on MusicBrainz', async (): Promise<string> => {
    await Promise.resolve();   // `job` is set: runBeside starts the work before it returns
    const j = job as Job;
    j.setTotal(todo.length + (key !== '' ? spell.length : 0));
    let done = 0, found = 0;
    try {
      for (const a of todo) {
        if (stopped) break;
        j.setDetail(a.title);
        let info = releases().get(a.key);
        if (info === undefined) {
          info = await lookUp(a.key, a.title, a.artist);
          releaseMap.set(a.key, info as ReleaseInfo); moved();
        }
        const rel = (info as ReleaseInfo).release;
        if (rel !== '' && a.coverTrack === '' && covers().get(rel) === undefined) {
          const file = await frontCover(rel);
          coverMap.set(rel, file); moved();
        }
        if (rel !== '') found++;
        j.setDone(++done);
      }
      if (key !== '') for (const f of spell) {
        if (stopped) break;
        const r = await lastfm(`method=artist.getcorrection&artist=${encodeURIComponent(f.title)}`, key);
        const c = r.corrections !== undefined && r.corrections.correction !== undefined ? r.corrections.correction : null;
        const name = c !== null && c.artist !== undefined ? '' + c.artist.name : f.title;
        correctionMap.set(f.key, name); moved();
        j.setDone(++done);
      }
    } catch (e) { setLookError((e as Error).message); throw e; }
    return `${count(todo.length, 'album', 'albums')} asked, ${found} found${stopped ? ' (stopped)' : ''}`;
  }, () => { stopped = true; });
}

/** Writes the fixes ready among `list` as one job and one save (duplicates are merged, after the question of a merge). */
export function fix(list: Finding[], label: string): void {
  if (library() === null || !allowed('Repair the library')) return;
  const rows: DuplicateRow[] = [];
  const changes: Change[] = [];
  let n = 0, coverIds: string[] = [];
  for (const f of list) {
    if (f.dup !== null) { rows.push(f.dup as DuplicateRow); continue; }
    if (f.changes.length === 0) continue;
    n++;
    for (const c of f.changes) { changes.push(c); if (c.patch.artworkFile !== undefined) coverIds = coverIds.concat(c.ids); }
  }
  if (rows.length > 0) mergeRows(rows);
  if (changes.length === 0) return;
  const songs = new Set<string>();
  for (const c of changes) for (const id of c.ids) songs.add(id);
  enqueue('repair', label, async (): Promise<string> => {
    await updateMany(changes);
    if (coverIds.length > 0) { for (const id of coverIds) { const f = cache.coverFile(id); if (fs.exists(f)) fs.remove(f, false); } dropCovers(); }
    await refresh();
    return `${count(n, 'fix', 'fixes')} written to ${count(songs.size, 'song', 'songs')}`;
  });
}
