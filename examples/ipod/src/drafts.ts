// Genius and the mixes in the app (services/genius.ts picks them): a draft is a list heard first, through the queue on the output
// chosen (this Mac or a Sonos group); Save to iPod writes it as a normal playlist (Allow changes; a remote iPod through its daemon),
// Refresh picks again. The model is built when first needed and again when the library or the listening history changed; with a
// Last.fm API key, the similar artists of the iPod's artists are fetched once in the background (a Transfers job, cached under the
// history folder), then the model is built again. When AudioMuse-AI analysed the iPod (deep.ts), its results are attached to the
// model (again when they change, without building it again) and Genius first asks it the songs closest to the seed. Every Genius list
// asked is kept per iPod (<cache>/<GUID>/genius.json, newest first): For you shows them on a shelf, the Playlists page lists them.
// "Path from here…" makes a draft "From A to B" (services/genius.ts pathBetween), listed there too for the rest of the run.
import { createSignal } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import * as ipod from 'zinc:ipod';
import { Card } from './services/forYou';
import { library, openPlaylist } from './state';
import { PodLibrary, createPlaylistOf } from './services/ipod';
import { History } from './services/history';
import { history, historyStarted, historyVersion, setHistoryVersion } from './services/historyJobs';
import { Model, Mix, buildModel, attachDeep, genius, reasons, mixes, loadWeights, readArtistGraph, fetchSimilarArtists, pathBetween } from './services/genius';
import { currentDeep, deepVersion, prepareNear } from './deep';
import { playList } from './services/player';
import { enqueue, runBeside, busy, Job } from './services/transfers';
import { allowed, refresh, setNotice } from './actions';
import { loadConfig } from './services/config';
import { backupPlace, log } from './services/log';
import { Budget } from './services/slice';
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

let model: Model | null = null;
let modelOf: PodLibrary | null = null;
let modelVersion: i32 = -1;
let modelDeep: i32 = -1;
let askedArtists = '';
let building: Promise<void> | null = null;
/** Bumped when a model was built: what read currentModel() runs again. */
const [modelTurn, setModelTurn] = createSignal<i32>(0);
/** True while the model is built (a slice at a time: services/slice.ts). */
export const [modelWorking, setModelWorking] = createSignal<boolean>(false);

/** The model when it is up to date for `lib` and the history's `version` (AudioMuse's results attached again when they changed). */
function upToDate(lib: PodLibrary, version: i32): Model | null {
  if (model === null || modelOf !== lib || modelVersion !== version) return null;
  const deepNow = deepVersion();
  if (modelDeep !== deepNow || (model as Model).deep !== currentDeep()) { attachDeep(model as Model, currentDeep()); modelDeep = deepNow; }
  return model;
}

async function build(lib: PodLibrary, version: i32): Promise<void> {
  setModelWorking(true);
  try {
    let h: History | null = null;
    try { if (historyStarted()) h = history(); } catch (e) { /* no history: metadata and the iPod's counters */ }
    const dir = historyDir(), b = new Budget();
    const m = await buildModel(h, cache.podKey(), lib.tracks, await readArtistGraph(dir, b), loadWeights(dir), b);
    if (library() !== lib) return;   // another iPod opened meanwhile
    attachDeep(m, currentDeep());
    model = m; modelOf = lib; modelVersion = version; modelDeep = deepVersion();
    const key = loadConfig().lastfmKey;
    if (key !== '') fetchArtists(lib, key);
  } finally {
    building = null;
    setModelWorking(false);
    setModelTurn(modelTurn() + 1);
  }
}

/** The model of the open iPod, built again (a slice at a time) when its library or the history changed; null without an iPod. */
export async function modelNow(): Promise<Model | null> {
  for (;;) {
    const lib = library();
    if (lib === null) return null;
    const version = historyVersion();
    const m = upToDate(lib as PodLibrary, version);
    if (m !== null) return m;
    if (building === null) building = build(lib as PodLibrary, version);
    await building;   // then again: the history or the iPod may have changed meanwhile
  }
}

/** The model of the open iPod when it is up to date, else null while it is built (modelWorking): for what shows it, which runs again
 *  when it is ready. */
export function currentModel(): Model | null {
  modelTurn();
  const lib = library();
  if (lib === null) return null;
  const m = upToDate(lib as PodLibrary, historyVersion());
  if (m === null) setTimeout(() => { modelNow().catch((e: Error): Model | null => { log('Genius', e.message, false); return null; }); }, 0);   // not from inside a computation
  return m;
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
    if (n > 0) { model = null; setHistoryVersion(historyVersion() + 1); }   // built again with them
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
  if (currentModel() === null) { setPicking(`Picking ${size} songs from “${seed.title !== '' ? seed.title : 'Untitled'}”…`); openPlaylist(d.id); }
  await prepareNear([seed.id]);   // returns at once without AudioMuse
  const ok = await pick(d);
  setPicking('');
  if (!ok) return;
  play(d);
  openPlaylist(d.id);
}

/** Picks the draft's songs again (with the history as it is now); false when the seed cannot seed a list (not music). */
async function pick(d: Draft): Promise<boolean> {
  const m = await modelNow();
  if (m === null) return false;
  d.tracks = genius(m as Model, d.seedId, d.size, d.round);
  if (d.tracks.length === 0) return false;
  d.why = reasons(m as Model, d.seedId, d.tracks);
  lastGenius = d;
  keepGenius(d);
  return true;
}

let mixesOf: Model | null = null;
let mixesLib: PodLibrary | null = null;
let mixList: Draft[] = [];
const [mixTurn, setMixTurn] = createSignal<i32>(0);
/** True while the mixes are worked out (a slice at a time). */
export const [mixesWorking, setMixesWorking] = createSignal<boolean>(false);

/** The mixes of the open iPod, as drafts: worked out when first shown and again when the model changed, off this call (the list
 *  follows when they are ready; until then the last ones, or none). */
export function mixDrafts(): Draft[] {
  mixTurn();
  const m = currentModel();
  if (m !== null && m !== mixesOf && !mixesWorking()) setTimeout(() => { workOutMixes(m as Model); }, 0);   // not from inside a computation
  return mixesLib !== null && mixesLib === library() ? mixList : [];   // those of the model before, while the new ones are worked out
}

async function workOutMixes(m: Model): Promise<void> {
  if (mixesWorking() || m === mixesOf) return;
  const lib = library();
  setMixesWorking(true);
  try {
    const ms = await mixes(m, 6, 50, 5, new Budget());
    const out: Draft[] = [];
    for (let i = 0; i < ms.length; i++) {
      const d = new Draft();
      d.id = `${MIX_PREFIX}${i}`; d.name = (ms[i] as Mix).name; d.tracks = (ms[i] as Mix).tracks;
      out.push(d);
    }
    mixesOf = m; mixesLib = lib; mixList = out;
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
  const m = await modelNow();
  if (m === null) return;
  const d = new Draft();
  d.id = `${PATH_PREFIX}${a.id}:${b.id}`;
  d.name = `From ${a.title !== '' ? a.title : 'Untitled'} to ${b.title !== '' ? b.title : 'Untitled'}`;
  d.tracks = pathBetween(m as Model, a.id, b.id);
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
  model = null;
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
