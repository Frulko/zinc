// Genius and the mixes in the app (services/genius.ts picks them): a draft is a list heard first, through the queue on the output
// chosen (this Mac or a Sonos group); Save to iPod writes it as a normal playlist (Allow changes, an iPod plugged into this computer),
// Refresh picks again. The model is built when first needed and again when the library or the listening history changed; with a
// Last.fm API key, the similar artists of the iPod's artists are fetched once in the background (a Transfers job, cached under the
// history folder), then the model is built again. When AudioMuse-AI analysed the iPod (deep.ts), its results are attached to the
// model (again when they change, without building it again) and Genius first asks it the songs closest to the seed. Every Genius list
// asked is kept per iPod (<cache>/<GUID>/genius.json, newest first): For you shows them on a shelf, the Playlists page lists them.
import { createSignal } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import * as ipod from 'zinc:ipod';
import { Card } from './services/forYou';
import { library, openPlaylist } from './state';
import { PodLibrary } from './services/ipod';
import { History } from './services/history';
import { history, historyStarted, historyVersion, setHistoryVersion } from './services/historyJobs';
import { Model, Mix, buildModel, attachDeep, genius, mixes, loadWeights, readArtistGraph, fetchSimilarArtists, savePlaylist } from './services/genius';
import { currentDeep, deepVersion, prepareNear } from './deep';
import { playList } from './services/player';
import { enqueue, runBeside, busy, Job } from './services/transfers';
import { allowed, localOnly, refresh } from './actions';
import { loadConfig } from './services/config';
import { backupPlace } from './services/log';
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
    tracks: d.tracks.map((t: ipod.Track) => t.id), at: Date.now() / 1000 };
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

/** The model of the open iPod: built again when its library or the history changed. */
export function currentModel(): Model | null {
  const lib = library();
  const version = historyVersion();
  if (lib === null) return null;
  const deepNow = deepVersion();
  if (model !== null && modelOf === lib && modelVersion === version) {
    if (modelDeep !== deepNow || (model as Model).deep !== currentDeep()) { attachDeep(model as Model, currentDeep()); modelDeep = deepNow; }
    return model as Model;
  }
  let h: History | null = null;
  try { if (historyStarted()) h = history(); } catch (e) { /* no history: metadata and the iPod's counters */ }
  const dir = historyDir();
  model = buildModel(h, cache.podKey(), (lib as PodLibrary).tracks, readArtistGraph(dir), loadWeights(dir));
  attachDeep(model as Model, currentDeep());
  modelOf = lib; modelVersion = version; modelDeep = deepNow;
  const key = loadConfig().lastfmKey;
  if (key !== '') setTimeout(() => fetchArtists(lib as PodLibrary, key), 0);   // not from inside a computation: it starts a job
  return model as Model;
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

/** "Genius from this song": a draft of `size` songs, the seed first, shown on the Playlists page and played now. */
export function geniusFrom(seed: ipod.Track, size: i32): void {
  const d = new Draft();
  d.id = `${GENIUS_PREFIX}${seed.id}:${size}`; d.seedId = seed.id; d.size = size;
  d.name = `Genius · ${seed.title !== '' ? seed.title : 'Untitled'}`;
  prepareNear([seed.id]).then(() => {   // returns at once without AudioMuse
    if (!pick(d)) return;
    play(d);
    openPlaylist(d.id);
  });
}

/** Picks the draft's songs again (with the history as it is now); false when the seed cannot seed a list (not music). */
function pick(d: Draft): boolean {
  const m = currentModel();
  if (m === null) return false;
  d.tracks = genius(m as Model, d.seedId, d.size, d.round);
  if (d.tracks.length === 0) return false;
  lastGenius = d;
  keepGenius(d);
  return true;
}

let mixesOf: Model | null = null;
let mixList: Draft[] = [];

/** The mixes of the open iPod, as drafts (worked out when first shown, again when the model changed). */
export function mixDrafts(): Draft[] {
  const m = currentModel();
  if (m === mixesOf) return mixList;
  mixesOf = m;
  const out: Draft[] = [];
  mixList = out;
  if (m === null) return out;
  const ms = mixes(m as Model);
  for (let i = 0; i < ms.length; i++) {
    const d = new Draft();
    d.id = `${MIX_PREFIX}${i}`; d.name = (ms[i] as Mix).name; d.tracks = (ms[i] as Mix).tracks;
    out.push(d);
  }
  return out;
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
      for (const tid of c.tracks) { const t = byId.get(tid); if (t !== undefined) d.tracks.push(t as ipod.Track); }
      return d.tracks.length > 0 ? d : null;
    }
    return null;
  }
  if (id.startsWith(MIX_PREFIX)) for (const d of mixDrafts()) if (d.id === id) return d;
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
  if (pick(next)) play(next);
}

/** Save to iPod: the draft as a new normal playlist (Allow changes; an iPod plugged into this computer). */
export function saveDraft(d: Draft): void {
  const lib = library();
  if (lib === null || d.tracks.length === 0 || !localOnly('Save to iPod') || !allowed('Save to iPod')) return;
  const tracks = d.tracks.slice(), name = d.name;
  enqueue('playlist', `Save “${name}” to the iPod`, async (): Promise<string> => {
    await savePlaylist(name, tracks);
    await refresh();
    return `${count(tracks.length, 'song', 'songs')} in the playlist “${name}”`;
  });
}
