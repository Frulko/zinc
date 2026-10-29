// AudioMuse-AI in the app (services/audiomuse.ts talks to it): the results kept for the iPod open (<cache>/<GUID>/deep.v1.json), the
// Settings card's actions (Test connection, Analyse now and Sync results as Transfers jobs beside the iPod's queue), and the near lists
// Genius and For you ask before they pick. Without AudioMuse, or while it does not answer, the cached results are used as they are
// ("Deep analysis offline") and the songs it never analysed fall back to tier 1. While the app runs, AudioMuse's last task is asked
// every minute (watchMuse): an analysis that ended since the last sync, whoever started it, is synced by itself.
import { createSignal, batch } from 'zinc:ui/solid';
import * as sys from 'zinc:sys';
import * as ipod from 'zinc:ipod';
import * as muse from './services/audiomuse';
import { loadConfig } from './services/config';
import { library } from './state';
import { PodLibrary } from './services/ipod';
import { runBeside, busy } from './services/transfers';
import { log } from './services/log';
import * as cache from './services/cache';
import { count } from './format';

/** Moves when the results kept change (a sync, near lists): the model attaches them again. */
export const [deepVersion, setDeepVersion] = createSignal<i32>(0);
/** What the last call to AudioMuse said: '' (none yet), 'online', 'offline' or the reason it failed. */
export const [museState, setMuseState] = createSignal<string>('');
/** Songs it analysed, from the last Test connection (-1 unknown). */
export const [museAnalysed, setMuseAnalysed] = createSignal<i32>(-1);

let kept: muse.Deep | null = null;
let keptFor = '';

function conn(): muse.Muse { const c = loadConfig(); return new muse.Muse(c.museUrl, c.museToken); }
function tracks(): ipod.Track[] { const l = library(); return l !== null ? (l as PodLibrary).tracks : []; }

/** The deep results of the iPod open, null when it was never synced. */
export function currentDeep(): muse.Deep | null {
  const g = cache.podKey();
  if (g === '') return null;
  if (keptFor !== g) { kept = muse.readDeep(cache.cacheDir(), g); keptFor = g; }
  return kept;
}

/** What the shelves come from, for their cache key: the sync and its size. */
export function deepKey(): string { const d = currentDeep(); return d === null ? 'none' : `${(d as muse.Deep).syncedAt}:${(d as muse.Deep).tracks.length}`; }

/** The music of the iPod that AudioMuse has not analysed. */
export function notAnalysed(): i32 {
  const d = currentDeep();
  if (d === null) return 0;
  const known = new Set<string>();
  for (const t of (d as muse.Deep).tracks) known.add(t.id);
  let n: i32 = 0;
  for (const t of tracks()) if ((t.mediaType === 'audio' || t.mediaType === '') && !known.has(t.id)) n++;
  return n;
}

function day(t: number): string { return new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' '); }

/** One line on the deep analysis: offline, the songs not analysed yet, or when it was synced; '' when never synced. */
export function deepNote(): string {
  deepVersion();
  const d = currentDeep();
  if (d === null) return '';
  const at = day((d as muse.Deep).syncedAt);
  if (museState() === 'offline') return `Deep analysis offline · results of ${at}`;
  const left = notAnalysed();
  return left > 0 ? `Deep analysis of ${at} · ${count(left, 'song', 'songs')} not analysed yet` : `Deep analysis of ${at}`;
}

function failed(e: Error): void {
  setMuseState(muse.isOffline(e) ? 'offline' : e.message);
  if (!muse.isOffline(e)) log('AudioMuse', e.message, false);
}

/** Test connection: reachable, how many songs it analysed. */
export async function testMuse(): Promise<void> {
  try {
    const r = await muse.reach(conn());
    batch(() => { setMuseAnalysed(r.analysed); setMuseState('online'); });
  } catch (e) { failed(e as Error); }
}

/** Sync results: every song AudioMuse analysed into the iPod's cache, as a Transfers job. */
export function syncMuse(): void {
  const lib = library();
  if (lib === null || busy('deep')) return;
  const guid = cache.podKey(), dir = cache.cacheDir(), list = (lib as PodLibrary).tracks;
  const job = runBeside('deep', 'Sync the deep analysis (AudioMuse)', async (): Promise<string> => {
    try {
      const c = conn();
      const last = await muse.lastTask(c);   // the analysis these results come from: a later one is synced by itself
      const d = await muse.sync(c, dir, guid, list, (done: i32, total: i32) => { batch(() => { job.setDone(done); job.setTotal(total); job.setDetail('songs'); }); },
        muse.analysisDone(last) ? last.id : '');
      if (cache.podKey() === guid) { kept = d; keptFor = guid; }
      batch(() => { setMuseState('online'); setMuseAnalysed(d.tracks.length as i32); setDeepVersion(deepVersion() + 1); });
      return `${count(d.tracks.length, 'song', 'songs')} of this iPod analysed${d.unknown > 0 ? ` · ${d.unknown} not on it` : ''}${notAnalysed() > 0 ? ` · ${notAnalysed()} not analysed yet` : ''}`;
    } catch (e) { failed(e as Error); throw e; }
  }, () => { /* a sync takes seconds: it ends */ });
}

/** Analyse now: AudioMuse analyses the songs it does not know (progress "Albums 120/1900"); Cancel in Transfers cancels its task.
 *  When it ends well the results are synced. */
export function analyseMuse(): void {
  if (busy('deep')) return;
  let stopped = false;
  const job = runBeside('deep', 'Deep analysis (AudioMuse)', async (): Promise<string> => {
    try {
      const line = await muse.analyse(conn(), (s: muse.TaskState) => { batch(() => { job.setDone(s.progress); job.setTotal(100); job.setDetail(s.message); }); },
        (): boolean => stopped);
      setMuseState('online');
      if (!stopped) setTimeout(() => { syncMuse(); }, 0);
      return line;
    } catch (e) { failed(e as Error); throw e; }
  }, () => { stopped = true; });
}

/** Asks AudioMuse the near lists of `ids` (and the path from the first to the second when `pathToo`) that are not kept yet; nothing
 *  when the iPod was never synced or AudioMuse is offline. Never throws. */
export async function prepareNear(ids: string[], pathToo: boolean = false): Promise<void> {
  const d = currentDeep();
  if (d === null || ids.length === 0) return;
  const guid = cache.podKey(), dir = cache.cacheDir();
  try {
    const asked = await muse.fetchNear(conn(), dir, d as muse.Deep, tracks(), ids);
    if (pathToo && ids.length >= 2 && muse.pathOf(d as muse.Deep, ids[0], ids[1]) === null) await muse.fetchPath(conn(), dir, d as muse.Deep, tracks(), ids[0], ids[1]);
    if (museState() !== 'online') setMuseState('online');
    if (asked > 0 && cache.podKey() === guid) setDeepVersion(deepVersion() + 1);
  } catch (e) { failed(e as Error); }
}

const POLL_MS: number = sys.env('IPOD_MUSE_POLL_MS') !== '' ? Number(sys.env('IPOD_MUSE_POLL_MS')) : 60000;
let watching = false;

/** Asks AudioMuse its last task now, then every minute while the app runs: an analysis that ended since the last sync is synced. */
export function watchMuse(): void {
  if (watching) return;
  watching = true;
  const tick = (): void => { checkMuse().then((noPod: boolean) => { setTimeout(tick, noPod ? 2000 : POLL_MS); }); };
  tick();
}

/** AudioMuse was set up: a token, or results synced before (the default address alone is not asked: it may be another program). */
export function museSetUp(): boolean { return loadConfig().museToken !== '' || currentDeep() !== null; }

/** One look at AudioMuse's last task; true when no iPod is open yet (looked at again soon). Never throws. */
async function checkMuse(): Promise<boolean> {
  if (library() === null) return true;
  const st = museState();
  // not after it was offline or refused (Test connection, a sync or Genius reaching it again starts the looks again)
  if (!museSetUp() || (st !== '' && st !== 'online') || busy('deep')) return false;
  try {
    const t = await muse.lastTask(conn());
    if (st !== 'online') setMuseState('online');
    const d = currentDeep();
    if (muse.analysisDone(t) && (d === null || (d as muse.Deep).task !== t.id)) syncMuse();
  } catch (e) { failed(e as Error); }
  return false;
}
