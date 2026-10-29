// Genius and the mixes in the app (services/genius.ts picks them): a draft is a list heard first, through the queue on the output
// chosen (this Mac or a Sonos group); Save to iPod writes it as a normal playlist (Allow changes, an iPod plugged into this computer),
// Refresh picks again. The model is built when first needed and again when the library or the listening history changed; with a
// Last.fm API key, the similar artists of the iPod's artists are fetched once in the background (a Transfers job, cached under the
// history folder), then the model is built again.
import { createSignal } from 'zinc:ui/solid';
import * as ipod from 'zinc:ipod';
import { library, openPlaylist } from './state';
import { PodLibrary } from './services/ipod';
import { History } from './services/history';
import { history, historyStarted, historyVersion, setHistoryVersion } from './services/historyJobs';
import { Model, Mix, buildModel, genius, mixes, loadWeights, readArtistGraph, fetchSimilarArtists, savePlaylist } from './services/genius';
import { playList } from './services/player';
import { enqueue, runBeside, busy } from './services/transfers';
import { allowed, localOnly, refresh } from './actions';
import { loadConfig } from './services/config';
import { backupPlace } from './services/log';
import * as cache from './services/cache';
import { count } from './format';

export const GENIUS_SIZES: i32[] = [25, 50, 100];
const GENIUS_ID = 'draft:genius';
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

export const [geniusDraft, setGeniusDraft] = createSignal<Draft | null>(null);

function historyDir(): string { return `${backupPlace()}/history`; }

let model: Model | null = null;
let modelOf: PodLibrary | null = null;
let modelVersion: i32 = -1;
let askedArtists = '';

/** The model of the open iPod: built again when its library or the history changed. */
function currentModel(): Model | null {
  const lib = library();
  const version = historyVersion();
  if (lib === null) return null;
  if (model !== null && modelOf === lib && modelVersion === version) return model as Model;
  let h: History | null = null;
  try { if (historyStarted()) h = history(); } catch (e) { /* no history: metadata and the iPod's counters */ }
  const dir = historyDir();
  model = buildModel(h, cache.podKey(), (lib as PodLibrary).tracks, readArtistGraph(dir), loadWeights(dir));
  modelOf = lib; modelVersion = version;
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
  runBeside('genius', 'Similar artists from Last.fm', async (): Promise<string> => {
    const n = await fetchSimilarArtists(historyDir(), key, names);
    if (stopped) return 'stopped';
    if (n > 0) { model = null; setHistoryVersion(historyVersion() + 1); }   // built again with them
    return n > 0 ? `${count(n, 'artist', 'artists')} fetched` : 'all known already';
  }, () => { stopped = true; });
}

/** "Genius from this song": a draft of `size` songs, the seed first, shown on the Playlists page and played now. */
export function geniusFrom(seed: ipod.Track, size: i32): void {
  const d = new Draft();
  d.id = GENIUS_ID; d.seedId = seed.id; d.size = size;
  d.name = `Genius · ${seed.title !== '' ? seed.title : 'Untitled'}`;
  if (!pick(d)) return;
  play(d);
  openPlaylist(GENIUS_ID);
}

/** Picks the draft's songs again (with the history as it is now); false when the seed cannot seed a list (not music). */
function pick(d: Draft): boolean {
  const m = currentModel();
  if (m === null) return false;
  d.tracks = genius(m as Model, d.seedId, d.size, d.round);
  if (d.tracks.length === 0) return false;
  setGeniusDraft(d);
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

/** The draft of `id` (a Genius list or a mix), null for an iPod playlist. */
export function draftOf(id: string): Draft | null {
  if (id === GENIUS_ID) return geniusDraft();
  if (id.startsWith(MIX_PREFIX)) for (const d of mixDrafts()) if (d.id === id) return d;
  return null;
}
export function isDraft(id: string): boolean { return id.startsWith('draft:'); }

/** Plays the draft from its first song. */
export function play(d: Draft): void {
  const lib = library();
  if (lib !== null && d.tracks.length > 0) playList(lib as PodLibrary, d.tracks, 0, d.name);
}

export function isGenius(d: Draft): boolean { return d.id === GENIUS_ID; }

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
