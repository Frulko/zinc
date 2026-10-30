// Genius and the mixes in the app (services/genius.ts picks them): a draft is a list heard first, through the queue on the output
// chosen (this Mac or a Sonos group); Save to iPod writes it as a normal playlist (Allow changes; a remote iPod through its daemon),
// Refresh picks again. The model is built when first needed and again when the library or the listening history changed; with a
// Last.fm API key, the similar artists of the iPod's artists are fetched once in the background (a Transfers job, cached under the
// history folder), then the model is built again. When AudioMuse-AI analysed the iPod (deep.ts), its results are attached to the
// model (again when they change, without building it again) and Genius first asks it the songs closest to the seed. Every Genius list
// asked is kept per iPod (<cache>/<GUID>/genius.json, newest first): For you shows them on a shelf, the Playlists page lists them.
// "Path from here…" makes a draft "From A to B" (services/genius.ts pathBetween), listed there too for the rest of the run.
// The model and the picks live in the recommendation worker (services/recommend.ts, D181): this file sends it jobs (ask) and turns
// the ids it answers into the iPod's tracks; where there is no worker (QuickJS) the same handler runs here, a slice at a time.
import { createSignal } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import * as ipod from 'zinc:ipod';
import { Card } from './services/forYou';
import { library, openPlaylist } from './state';
import { PodLibrary, createPlaylistOf } from './services/ipod';
import { Worker, MessageEvent, ErrorEvent } from 'zinc:worker';
import { PodListen } from './services/history';
import { history, historyStarted, historyVersion, setHistoryVersion, syncHistory } from './services/historyJobs';
import { fetchSimilarArtists } from './services/historyImport';
import { RecJob, RecOut, MixOut, handle } from './services/recommend';
import { deepVersion, prepareNear } from './deep';
import { playList } from './services/player';
import { enqueue, runBeside, busy, Job } from './services/transfers';
import { allowed, refresh, setNotice } from './actions';
import { loadConfig } from './services/config';
import { backupPlace, log } from './services/log';
import { Budget, STALE } from './services/slice';
import * as cache from './services/cache';
import { count } from './format';

export const GENIUS_SIZES: i32[] = [25, 50, 100];
const GENIUS_PREFIX = 'draft:genius:';
const GENIUS_MAX: i32 = 12;
const MIX_PREFIX = 'draft:mix:';

/** A list not on the iPod: a Genius list or a mix. */
export class Draft {
  id: string = '';
  name: string = '';
  tracks: ipod.Track[] = [];
  /** Genius: the seed, the size asked and how many times Refresh was pressed. */
  seedId: string = '';
  size: i32 = 25;
  round: i32 = 0;
  /** Genius: why each song was picked, beside `tracks` (services/genius.ts reasons). */
  why: string[] = [];
}

/** The Genius list picked last (Refresh picks another one). */
let lastGenius: Draft | null = null;
const [geniusVersion, setGeniusVersion] = createSignal<i32>(0);
let geniusFile = '';
let geniusList: Card[] = [];

/** The Genius lists asked on the open iPod, newest first (draft cards: their id is the draft's). */
export function geniusCards(): Card[] {
  geniusVersion();
  const f = `${cache.cacheDir()}/genius.json`;
  if (f !== geniusFile) {   // another iPod: its own lists
    geniusFile = f; geniusList = []; lastGenius = null;
    try { if (fs.exists(f)) { const l: Card[] = JSON.parse(fs.readText(f)); geniusList = l; } } catch (e) { /* damaged: none kept */ }
  }
  return geniusList;
}

function keepGenius(d: Draft): void {
  const seed = d.tracks[0];
  const c: Card = { kind: 'draft', id: d.id, title: d.name, subtitle: `${count(d.tracks.length, 'song', 'songs')}${seed.artist !== '' ? ` · from ${seed.artist}` : ''}`,
    tracks: d.tracks.map((t: ipod.Track) => t.id), at: Date.now() / 1000, why: d.why };
  const list: Card[] = [c];
  for (const x of geniusCards()) if (x.id !== c.id && list.length < GENIUS_MAX) list.push(x);
  geniusList = list;
  try { fs.writeText(`${geniusFile}.part`, JSON.stringify(list)); fs.rename(`${geniusFile}.part`, geniusFile); } catch (e) { /* kept for this run only */ }
  setGeniusVersion(geniusVersion() + 1);
}

/** The Genius lists kept, as drafts (songs no longer on the iPod left out). */
export function geniusDrafts(): Draft[] {
  const out: Draft[] = [];
  for (const c of geniusCards()) { const d = draftOf(c.id); if (d !== null) out.push(d as Draft); }
  return out;
}

function historyDir(): string { return `${backupPlace()}/history`; }

// ---- the recommendation worker

let worker: Worker<RecJob, RecOut> | null = null;
let inline = false;
let jobs: i32 = 0;
const waiting = new Map<i32, (o: RecOut) => void>();

function settle(o: RecOut): void {
  const f = waiting.get(o.id);
  if (f !== undefined) { waiting.delete(o.id); f(o); }
}

/** The worker, started once; null where there is none (QuickJS has no workers yet: the jobs run here). */
function recommender(): Worker<RecJob, RecOut> | null {
  if (worker !== null || inline) return worker;
  try {
    const w = new Worker<RecJob, RecOut>(new URL('./services/recommend.worker.ts', import.meta.url));
    w.onmessage = (e: MessageEvent<RecOut>) => { settle(e.data); };
    w.onerror = (e: ErrorEvent) => {   // its program ended: the jobs waiting fail, the next one starts a new worker (and model)
      log('Genius', e.message, false);
      worker = null; modelOf = null;
      const left: i32[] = [];
      waiting.forEach((f: (o: RecOut) => void, id: i32) => { left.push(id); });
      for (const id of left) settle({ id: id, kind: '', error: e.message });
    };
    worker = w;
  } catch (e) { inline = true; }
  return worker;
}

/** A job of `kind` for the iPod open (its deep results as they are now). */
export function job(kind: string): RecJob {
  jobs++;
  return { id: jobs, kind: kind, guid: cache.podKey(), deepDir: cache.cacheDir(), deepVersion: deepVersion() };
}

/** The answer to `j`, null when a newer job of its kind replaced it; throws when it failed. */
export function ask(j: RecJob): Promise<RecOut | null> {
  return new Promise<RecOut | null>((done: (o: RecOut | null) => void, fail: (e: Error) => void) => {
    waiting.set(j.id, (o: RecOut) => { if (o.error === STALE) done(null); else if (o.error !== '') fail(new Error(o.error)); else done(o); });
    const w = recommender();
    if (w !== null) (w as Worker<RecJob, RecOut>).postMessage(j);
    else handle(j, settle);
  });
}

let byIdOf: PodLibrary | null = null;
let byId = new Map<string, ipod.Track>();

/** The open iPod's tracks of `ids`, in that order (those no longer on it left out). */
export function tracksOf(ids: string[]): ipod.Track[] {
  const lib = library();
  if (lib === null) return [];
  if (byIdOf !== lib) { byId = new Map<string, ipod.Track>(); for (const t of (lib as PodLibrary).tracks) byId.set(t.id, t); byIdOf = lib; }
  const out: ipod.Track[] = [];
  for (const id of ids) { const t = byId.get(id); if (t !== undefined) out.push(t as ipod.Track); }
  return out;
}

// ---- the model

/** The library and history version the worker's model was built for, and how many models were built. */
let modelOf: PodLibrary | null = null;
let modelVersion: i32 = -1;
let models: i32 = 0;
let askedArtists = '';
let building: Promise<void> | null = null;
/** Bumped when a model was built: what read modelReady() runs again. */
const [modelTurn, setModelTurn] = createSignal<i32>(0);
/** True while the model is built (in the worker). */
export const [modelWorking, setModelWorking] = createSignal<boolean>(false);

async function build(lib: PodLibrary, version: i32): Promise<void> {
  setModelWorking(true);
  try {
    if (historyStarted()) await syncHistory();   // the iPods' new listens first: a model built before them would be built again
    if (historyVersion() !== version || library() !== lib) return;   // modelNow builds the new one
    let listens: PodListen[] = [];
    try { if (historyStarted()) listens = await history().podListens(cache.podKey(), new Budget()); } catch (e) { /* no history: metadata and the iPod's counters */ }
    const j = job('model');
    j.tracks = lib.tracks; j.listens = listens; j.historyDir = historyDir();
    const o = await ask(j);
    if (o === null || library() !== lib) return;   // a newer build, or another iPod opened meanwhile
    modelOf = lib; modelVersion = version; models++;
    const key = loadConfig().lastfmKey;
    if (key !== '') fetchArtists(lib, key);
  } finally {
    building = null;
    setModelWorking(false);
    setModelTurn(modelTurn() + 1);
  }
}

/** True once the worker has the model of the open iPod, built again (in the worker) when its library or the history changed; false
 *  without an iPod. AudioMuse's results go with every job, so a sync needs no new model. */
export async function modelNow(): Promise<boolean> {
  for (;;) {
    const lib = library();
    if (lib === null) return false;
    const version = historyVersion();
    if (modelOf === lib && modelVersion === version) return true;
    if (building === null) building = build(lib as PodLibrary, version);
    await building;   // then again: the history or the iPod may have changed meanwhile
  }
}

/** True when the model of the open iPod is up to date, else false while it is built (modelWorking): for what shows it, which runs
 *  again when it is ready. */
export function modelReady(): boolean {
  modelTurn();
  const lib = library();
  if (lib === null) return false;
  if (modelOf === lib && modelVersion === historyVersion()) return true;
  setTimeout(() => { modelNow().catch((e: Error): boolean => { log('Genius', e.message, false); return false; }); }, 0);   // not from inside a computation
  return false;
}

/** Settings › Recommendations: the similar artists of the iPod's artists not fetched yet (in the last 90 days), now, even when they
 *  were asked since the app started. Nothing without an iPod or a Last.fm API key. */
export function fetchArtistsNow(): void {
  const lib = library(), key = loadConfig().lastfmKey;
  if (lib === null || key === '') return;
  askedArtists = '';
  fetchArtists(lib as PodLibrary, key);
}

/** With a Last.fm API key: the similar artists of the iPod's artists not fetched yet, once per library, in the background. */
function fetchArtists(lib: PodLibrary, key: string): void {
  const marker = `${cache.podKey()}:${lib.tracks.length}`;
  if (askedArtists === marker || busy('genius')) return;
  askedArtists = marker;
  const names: string[] = [];
  for (const t of lib.tracks) if (t.mediaType === 'audio' && t.artist !== '' && names.indexOf(t.artist) < 0) names.push(t.artist);
  let stopped = false;
  let job: Job | null = null;
  const step = (done: i32, total: i32, artist: string): boolean => {
    if (job === null || stopped) return !stopped;
    const j = job as Job;
    j.setDone(done); j.setTotal(total); j.setDetail(artist);
    if (done === 0) j.note(`${count(total, 'artist', 'artists')} to ask (the others were asked in the last 90 days)`);
    else if (done % 50 === 0) j.note(`${done}/${total} artists asked`);
    return true;
  };
  job = runBeside('genius', 'Similar artists from Last.fm', async (): Promise<string> => {
    await Promise.resolve();   // `job` is set: runBeside starts the work before it returns
    const n = await fetchSimilarArtists(historyDir(), key, names, names.length, step);   // all of them: Cancel keeps what was fetched
    if (n > 0) { modelOf = null; setHistoryVersion(historyVersion() + 1); }   // built again with them
    return `${n > 0 ? `${count(n, 'artist', 'artists')} fetched` : 'all known already'}${stopped ? ' (stopped)' : ''}`;
  }, () => { stopped = true; });
}

/** The Genius list being picked ("Picking 25 songs…"), '' when none: the Playlists page shows it while the model is built. */
export const [picking, setPicking] = createSignal<string>('');

/** "Genius from this song": a draft of `size` songs, the seed first, shown on the Playlists page (at once, as it is picked) and played. */
export async function geniusFrom(seed: ipod.Track, size: i32): Promise<void> {
  const d = new Draft();
  d.id = `${GENIUS_PREFIX}${seed.id}:${size}`; d.seedId = seed.id; d.size = size;
  d.name = `Genius · ${seed.title !== '' ? seed.title : 'Untitled'}`;
  if (!modelReady()) { setPicking(`Picking ${size} songs from “${seed.title !== '' ? seed.title : 'Untitled'}”…`); openPlaylist(d.id); }
  await prepareNear([seed.id]);   // returns at once without AudioMuse
  const ok = await pick(d);
  setPicking('');
  if (!ok) return;
  play(d);
  openPlaylist(d.id);
}

/** Picks the draft's songs again (with the history as it is now); false when the seed cannot seed a list (not music). */
async function pick(d: Draft): Promise<boolean> {
  if (!(await modelNow())) return false;
  const j = job('genius');
  j.seed = d.seedId; j.size = d.size; j.round = d.round;
  const o = await ask(j);
  if (o === null) return false;
  d.tracks = tracksOf(o.ids as string[]);
  if (d.tracks.length === 0) return false;
  d.why = o.why as string[];
  lastGenius = d;
  keepGenius(d);
  return true;
}

let mixesOf: i32 = -1;
let mixesLib: PodLibrary | null = null;
let mixList: Draft[] = [];
const [mixTurn, setMixTurn] = createSignal<i32>(0);
/** True while the mixes are worked out (in the worker). */
export const [mixesWorking, setMixesWorking] = createSignal<boolean>(false);

/** The mixes of the open iPod, as drafts: worked out when first shown and again when the model changed, off this call (the list
 *  follows when they are ready; until then the last ones, or none). */
export function mixDrafts(): Draft[] {
  mixTurn();
  if (modelReady() && models !== mixesOf && !mixesWorking()) setTimeout(() => { workOutMixes(); }, 0);   // not from inside a computation
  return mixesLib !== null && mixesLib === library() ? mixList : [];   // those of the model before, while the new ones are worked out
}

async function workOutMixes(): Promise<void> {
  const of = models;
  if (mixesWorking() || of === mixesOf) return;
  const lib = library();
  setMixesWorking(true);
  try {
    const o = await ask(job('mixes'));
    if (o !== null) {
      const ms = o.mixes as MixOut[];
      const out: Draft[] = [];
      for (let i = 0; i < ms.length; i++) {
        const d = new Draft();
        d.id = `${MIX_PREFIX}${i}`; d.name = ms[i].name; d.tracks = tracksOf(ms[i].ids);
        out.push(d);
      }
      mixesOf = of; mixesLib = lib; mixList = out;
    }
  } catch (e) { log('Mixes', (e as Error).message, false); }
  setMixesWorking(false);
  setMixTurn(mixTurn() + 1);
}

const PATH_PREFIX = 'draft:path:';
const PATH_MAX: i32 = 6;
const [pathVersion, setPathVersion] = createSignal<i32>(0);
let pathList: Draft[] = [];

/** The "From A to B" lists made in this run, newest first. */
export function pathDrafts(): Draft[] { pathVersion(); return pathList; }

/** "Path from here…": a draft from `a` to `b` (AudioMuse's smooth path when it analysed both, else the model's), shown on the
 *  Playlists page. Kept for this run only. */
export async function pathFrom(a: ipod.Track, b: ipod.Track): Promise<void> {
  await prepareNear([a.id, b.id], true);   // returns at once without AudioMuse
  if (!(await modelNow())) return;
  const j = job('path');
  j.seed = a.id; j.to = b.id;
  const o = await ask(j);
  if (o === null) return;
  const d = new Draft();
  d.id = `${PATH_PREFIX}${a.id}:${b.id}`;
  d.name = `From ${a.title !== '' ? a.title : 'Untitled'} to ${b.title !== '' ? b.title : 'Untitled'}`;
  d.tracks = tracksOf(o.ids as string[]);
  if (d.tracks.length < 2) { setNotice(`No path from “${a.title}” to “${b.title}”: both must be music on this iPod`); return; }
  const list: Draft[] = [d];
  for (const x of pathList) if (x.id !== d.id && list.length < PATH_MAX) list.push(x);
  pathList = list;
  setPathVersion(pathVersion() + 1);
  openPlaylist(d.id);
}

/** Drafts made elsewhere (the For you page's cards, forYou.ts), by id. */
const others = new Map<string, Draft>();

/** The draft of `id` (a Genius list, a mix or a For you card), null for an iPod playlist. */
export function draftOf(id: string): Draft | null {
  if (id.startsWith(GENIUS_PREFIX)) {
    const lib = library();
    if (lastGenius !== null && (lastGenius as Draft).id === id) return lastGenius;
    for (const c of geniusCards()) if (c.id === id && lib !== null) {
      const d = new Draft();
      const k = id.lastIndexOf(':');
      d.id = id; d.name = c.title; d.seedId = id.substring(GENIUS_PREFIX.length, k); d.size = parseInt(id.substring(k + 1));
      const byId = new Map<string, ipod.Track>();
      for (const t of (lib as PodLibrary).tracks) byId.set(t.id, t);
      const why = c.why !== undefined ? c.why as string[] : [];
      for (let x = 0; x < c.tracks.length; x++) {
        const t = byId.get(c.tracks[x]);
        if (t !== undefined) { d.tracks.push(t as ipod.Track); d.why.push(x < why.length ? why[x] : ''); }
      }
      return d.tracks.length > 0 ? d : null;
    }
    return null;
  }
  if (id.startsWith(MIX_PREFIX)) for (const d of mixDrafts()) if (d.id === id) return d;
  if (id.startsWith(PATH_PREFIX)) for (const d of pathDrafts()) if (d.id === id) return d;
  const kept = others.get(id);
  return kept !== undefined ? kept as Draft : null;
}

/** Replaces the drafts whose id starts with `prefix` by `list`. */
export function keepDrafts(prefix: string, list: Draft[]): void {
  const old: string[] = [];
  others.forEach((d: Draft, id: string) => { if (id.startsWith(prefix)) old.push(id); });
  for (const id of old) others.delete(id);
  for (const d of list) others.set(d.id, d);
}
export function isDraft(id: string): boolean { return id.startsWith('draft:'); }

/** Plays the draft from its first song. */
export function play(d: Draft): void {
  const lib = library();
  if (lib !== null && d.tracks.length > 0) playList(lib as PodLibrary, d.tracks, 0, d.name);
}

export function isGenius(d: Draft): boolean { return d.id.startsWith(GENIUS_PREFIX); }

/** Refresh: Genius picks another list from the same song, with the history as it is now, and plays it. */
export function refreshDraft(d: Draft): void {
  const next = new Draft();
  next.id = d.id; next.name = d.name; next.seedId = d.seedId; next.size = d.size; next.round = d.round + 1;
  modelOf = null;   // with the history as it is now
  setPicking(`Picking ${d.size} songs again…`);
  pick(next).then((ok: boolean) => { setPicking(''); if (ok) play(next); });
}

/** Save to iPod: the draft as a new normal playlist (Allow changes; a remote iPod through its daemon, which may refuse it). */
export function saveDraft(d: Draft): void {
  const lib = library();
  if (lib === null || d.tracks.length === 0 || !allowed('Save to iPod')) return;
  const tracks = d.tracks.slice(), name = d.name;
  enqueue('playlist', `Save “${name}” to the iPod`, async (): Promise<string> => {
    try { await createPlaylistOf(name, tracks.map((t: ipod.Track) => t.id)); }
    catch (e) { setNotice((e as Error).message); throw e; }   // the daemon's sentence (read only) on the page too
    await refresh();
    return `${count(tracks.length, 'song', 'songs')} in the playlist “${name}”`;
  });
}
