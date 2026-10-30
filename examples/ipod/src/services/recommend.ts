// The recommendation worker's work (D181): Genius' model and everything that reads it (Genius lists and their reasons, "From A to B",
// the mixes, the radio's next songs, the mood mixer, For you's shelves) and the caches they parse (the similar artists, the weights,
// AudioMuse's deep.v1.json). services/recommend.worker.ts runs handle() on its own thread, so the app's frames never wait for it;
// drafts.ts sends the jobs (ask) and, where there is no worker (QuickJS), calls handle() itself. What crosses is data: the iPod's
// tracks and listens once per model, then ids, names and cards; the model (maps of maps) stays here. A job of a kind supersedes the
// older one of that kind still running: the older one stops at its next turn (slice.ts STALE). No UI and no SQL here.
import type { Track, Playlist } from 'zinc:ipod';
import { PodListen } from './history';
import { Model, buildModel, attachDeep, genius, reasons, mixes, pathBetween, loadWeights, readArtistGraph } from './genius';
import { readDeep } from './audiomuse';
import * as fy from './forYou';
import { Radio, extend } from './radio';
import { moodOf, moodMix } from './moods';
import { Budget } from './slice';

/** A job for the worker. `kind`: model | genius | path | mixes | radio | mood | foryou | extra; the optional fields are its own. */
export interface RecJob {
  id: i32;
  kind: string;
  /** The iPod, where its deep results are kept (deep.v1.json) and their version (deep.ts deepVersion): read again when it moves. */
  guid: string;
  deepDir: string;
  deepVersion: i32;
  /** model: the iPod's tracks, its listens (History.podListens) and the history folder (genius.json, similar-artists.jsonl). */
  tracks?: Track[];
  listens?: PodListen[];
  historyDir?: string;
  /** genius (seed, size, round), path (seed to `to`), radio (radio, queued, size), mood (mood, energy, tempo). */
  seed?: string;
  to?: string;
  size?: i32;
  round?: i32;
  radio?: Radio;
  queued?: string[];
  mood?: string;
  energy?: number;
  tempo?: number;
  /** foryou: the time and day, the day's mixes when they are kept (else worked out), and what the app read from SQL. */
  now?: number;
  day?: string;
  daily?: fy.Card[];
  loved?: string[];
  playlists?: Playlist[];
  year?: fy.YearReview;
  artistsMonth?: fy.Card[];
  artistsYear?: fy.Card[];
}

export interface MixOut { name: string; ids: string[]; }

/** The answer to a job (same id and kind). */
export interface RecOut {
  id: i32;
  kind: string;
  /** '' when it went well, slice.ts STALE when a newer job of its kind replaced it, else why it failed. */
  error: string;
  ids?: string[];
  why?: string[];
  mixes?: MixOut[];
  radio?: Radio;
  /** mood: AudioMuse's analysis made it; foryou: the model has deep results (the app asks the seeds' near lists, then `extra`). */
  deep?: boolean;
  shelves?: fy.Shelf[];
  year?: fy.YearReview;
  seeds?: string[];
}

let model: Model | null = null;
let listens: PodListen[] = [];
/** The model the deep results were attached to, and their version. */
let deepOn: Model | null = null;
let deepAt = '';
/** For you's signals, kept for its `extra` job. */
let kept: fy.Signals | null = null;
const latest = new Map<string, i32>();

function ids(ts: Track[]): string[] { return ts.map((t: Track) => t.id); }

/** AudioMuse's results attached to `m` as the job has them (read again when their version or the iPod changed). */
function withDeep(m: Model, job: RecJob): void {
  const at = `${job.deepDir}|${job.guid}|${job.deepVersion}`;
  if (deepOn === m && deepAt === at) return;
  attachDeep(m, readDeep(job.deepDir, job.guid));
  deepOn = m; deepAt = at;
}

function current(job: RecJob): Model {
  if (model === null) throw new Error('Genius has no model yet');
  const m = model as Model;
  withDeep(m, job);
  return m;
}

/** Works `job` out and gives its answer to `reply` (once, whatever happens). */
export async function handle(job: RecJob, reply: (o: RecOut) => void): Promise<void> {
  latest.set(job.kind, job.id);
  const b = new Budget();
  b.stop = (): boolean => latest.get(job.kind) !== job.id;
  const o: RecOut = { id: job.id, kind: job.kind, error: '' };
  try { await work(job, o, b); } catch (e) { o.error = (e as Error).message; }
  reply(o);
}

async function work(job: RecJob, o: RecOut, b: Budget): Promise<void> {
  const k = job.kind;
  if (k === 'model') {
    const dir = job.historyDir as string, heard = job.listens as PodListen[];
    const m = await buildModel(heard, job.tracks as Track[], await readArtistGraph(dir, b), loadWeights(dir), b);
    model = m; listens = heard; kept = null;
    withDeep(m, job);
  } else if (k === 'genius') {
    const m = current(job), seed = job.seed as string;
    const ts = genius(m, seed, job.size as i32, job.round as i32);
    o.ids = ids(ts); o.why = reasons(m, seed, ts);
  } else if (k === 'path') {
    o.ids = ids(pathBetween(current(job), job.seed as string, job.to as string));
  } else if (k === 'mixes') {
    const out: MixOut[] = [];
    for (const x of await mixes(current(job), 6, 50, 5, b)) out.push({ name: x.name, ids: ids(x.tracks) });
    o.mixes = out;
  } else if (k === 'radio') {
    const r = job.radio as Radio;
    o.ids = ids(extend(current(job), r, job.queued as string[], job.size as i32));
    o.radio = r;
  } else if (k === 'mood') {
    const mx = moodMix(current(job), moodOf(job.mood as string), job.energy as number, job.tempo as number);
    o.ids = ids(mx.tracks); o.deep = mx.deep;
  } else if (k === 'foryou') await forYou(current(job), job, o, b);
  else if (k === 'extra') {
    if (kept === null) throw new Error('For you has no signals yet');
    const s = kept as fy.Signals;
    withDeep(s.m, job);   // the near lists the app asked since
    o.shelves = fy.extraShelves(s);
  } else throw new Error(`no job ${k}`);
}

/** For you's shelves but the tier 2 ones (`extra`, once the app asked AudioMuse the seeds' near lists). */
async function forYou(m: Model, job: RecJob, o: RecOut, b: Budget): Promise<void> {
  const t = job.now as number, today = job.day as string;
  const s = await fy.signals(listens, job.loved as string[], m, t, b);
  kept = s;
  const daily = job.daily !== undefined ? job.daily as fy.Card[] : await fy.dailyMixes(s, today, 50, b);
  const made = fy.onRepeat(s).concat(fy.repeatRewind(s));
  await b.check();
  for (const c of await fy.rediscover(s, 30, b)) made.push(c);
  await b.check();
  for (const c of await fy.timeCapsule(s, 30, b)) made.push(c);
  await b.check();
  const because = await fy.becauseYouListened(s, 3, b);
  const d = new Date(t * 1000);
  const year = await fy.yearReview(job.year as fy.YearReview, s, t, b);
  await b.check();
  const month = fy.MONTHS[d.getMonth()];
  const tops = fy.topSongs(s, 'top-month', `Top songs · ${month}`, 'Your most played this month', fy.monthStart(t), t + 1, 50);
  await b.check();
  for (const c of fy.topSongs(s, 'top-year', `Top songs · ${year.year}`, 'Your most played this year', fy.yearStart(t), t + 1, 100)) tops.push(c);
  await b.check();
  if (year.listens > 0) {
    const covers: string[] = [];
    for (const c of tops) if (c.id === 'top-year') for (const id of c.tracks.slice(0, 4)) covers.push(id);
    tops.push({ kind: 'year', id: 'year', title: `Your ${year.year}`, subtitle: `${year.listens} listens · about ${year.minutes} minutes`, tracks: covers, at: 0 });
  }
  const shelves: fy.Shelf[] = [
    { id: 'jump', title: 'Jump back in', cards: fy.jumpBackIn(s, job.playlists as Playlist[]) },
    { id: 'daily', title: 'Your daily mixes', cards: daily },
    { id: 'made', title: 'Made for you', cards: made },
  ];
  for (const sh of because) shelves.push(sh);
  shelves.push({ id: 'top', title: 'Your top songs', cards: tops });
  shelves.push({ id: 'artists-month', title: `Top artists · ${month}`, cards: job.artistsMonth as fy.Card[] });
  shelves.push({ id: 'artists-year', title: `Top artists · ${year.year}`, cards: job.artistsYear as fy.Card[] });
  o.shelves = shelves; o.year = year;
  o.deep = m.deep !== null;
  o.seeds = m.deep !== null ? fy.soundsLikeSeeds(s) : [];
}
