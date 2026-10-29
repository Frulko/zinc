// The For you page's shelves in the app (services/forYou.ts works them out). Opening the page shows at once what was kept on disk for
// this iPod (<cache>/<GUID>/foryou.json), then, off the first frame and a step at a time, checks the history's version and the
// library's (and the deep analysis'): when one changed the shelves are worked out again and kept, but the daily mixes stay those of the day until the next day.
// Every draft card is a draft (drafts.ts: heard through the queue on the output chosen, saved to the iPod as a playlist); a draft played
// from the page is kept for Jump back in (<cache>/<GUID>/foryou-recent.json). IPOD_DEMO_NOW (Unix seconds or an ISO date) sets the clock.
import { createSignal } from 'zinc:ui/solid';
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import * as ipod from 'zinc:ipod';
import { library, albums, artists, Album, Artist, openAlbum, openArtist, openPlaylist, showPage } from './state';
import { PodLibrary } from './services/ipod';
import { History } from './services/history';
import { history, historyStarted, syncHistory, historyCounts } from './services/historyJobs';
import * as fy from './services/forYou';
import { Draft, keepDrafts, currentModel, play } from './drafts';
import { log } from './services/log';
import { deepKey, prepareNear } from './deep';
import * as cache from './services/cache';
import { PAGE_YEAR } from './constants';
import { loadConfig, saveConfig } from './services/config';

const FORMAT: i32 = 1;
const PREFIX = 'draft:foryou:';
const RECENT_MAX: i32 = 8;

export interface ForYouData {
  format: i32;
  guid: string;
  /** What the shelves come from: the history's version and the library's. */
  key: string;
  /** The day of the daily mixes. */
  day: string;
  /** Listens in the history, and those of songs found on this iPod. */
  listens: i32;
  matched: i32;
  shelves: fy.Shelf[];
  year: fy.YearReview;
}

/** The shelves shown (null until the first are read or worked out). */
export const [forYou, setForYou] = createSignal<ForYouData | null>(null);
/** True while they are checked or worked out. */
export const [working, setWorking] = createSignal<boolean>(false);
/** The drafts played from the page, newest first (Jump back in). */
export const [recent, setRecent] = createSignal<fy.Card[]>([]);
/** How the shelves scroll (Settings, saved in config.json). */
export const [shelfSnap, setShelfSnapShown] = createSignal<boolean>(loadConfig().shelfSnap);
export const [shelfScrollbar, setShelfScrollbarShown] = createSignal<boolean>(loadConfig().shelfScrollbar);
export function setShelfSnap(on: boolean): void { const c = loadConfig(); c.shelfSnap = on; saveConfig(c); setShelfSnapShown(on); }
export function setShelfScrollbar(on: boolean): void { const c = loadConfig(); c.shelfScrollbar = on; saveConfig(c); setShelfScrollbarShown(on); }

/** Now, in Unix seconds (IPOD_DEMO_NOW sets it). */
export function now(): number {
  const v = sys.env('IPOD_DEMO_NOW');
  if (v === '') return Date.now() / 1000;
  const n = Number(v);
  return isNaN(n) ? Date.parse(v) / 1000 : n;
}

function file(name: string): string { return `${cache.cacheDir()}/${name}`; }

function writeJson(name: string, text: string): void {
  const f = file(name);
  fs.writeText(`${f}.part`, text);
  fs.rename(`${f}.part`, f);
}

function readCache(guid: string): ForYouData | null {
  try {
    const f = file('foryou.json');
    if (!fs.exists(f)) return null;
    const d: ForYouData = JSON.parse(fs.readText(f));
    return d.format === FORMAT && d.guid === guid ? d : null;
  } catch (e) { return null; }   // damaged: worked out again
}

function readRecent(): fy.Card[] {
  try { const f = file('foryou-recent.json'); if (fs.exists(f)) { const list: fy.Card[] = JSON.parse(fs.readText(f)); return list; } } catch (e) { /* none */ }
  return [];
}

/** The library's part of the key: what the shelves read of it (its songs, plays, ratings, skips). */
function libKey(lib: PodLibrary): string {
  let plays = 0, stars = 0, skips = 0;
  for (const t of lib.tracks) { plays += t.playCount; stars += t.rating; skips += t.skipCount; }
  return `${lib.tracks.length}:${plays}:${stars}:${skips}`;
}

function draftOfCard(c: fy.Card, byId: Map<string, ipod.Track>): Draft {
  const d = new Draft();
  d.id = PREFIX + c.id; d.name = c.title;
  for (const id of c.tracks) { const t = byId.get(id); if (t !== undefined) d.tracks.push(t as ipod.Track); }
  return d;
}

/** Shows `data`: its draft cards (and those played lately) become drafts. */
function show(data: ForYouData, rec: fy.Card[], lib: PodLibrary): void {
  const byId = new Map<string, ipod.Track>();
  for (const t of lib.tracks) byId.set(t.id, t);
  const list: Draft[] = [];
  for (const sh of data.shelves) for (const c of sh.cards) if (c.kind === 'draft') list.push(draftOfCard(c, byId));
  for (const c of rec) list.push(draftOfCard(c, byId));
  keepDrafts(PREFIX, list);
  setRecent(rec);
  setForYou(data);
}

function tick(): Promise<void> { return new Promise<void>((done: () => void) => { setTimeout(() => { done(); }, 0); }); }

let running = false, again = false;

/** Shows the shelves kept for the iPod open, then works them out again if the history or the library changed (or the day, for the
 *  daily mixes). Called when the page shows and when the history changes. */
export async function refreshForYou(): Promise<void> {
  if (running) { again = true; return; }
  const lib = library();
  if (lib === null) return;
  running = true;
  setWorking(true);
  try { await work(lib as PodLibrary); } catch (e) { log('For you', (e as Error).message, false); }
  running = false;
  setWorking(false);
  if (again) { again = false; refreshForYou(); }
}

async function work(lib: PodLibrary): Promise<void> {
  const guid = cache.podKey();
  let page = forYou();
  if (page === null || (page as ForYouData).guid !== guid) {
    page = readCache(guid);
    if (page !== null) show(page as ForYouData, readRecent(), lib);
    else { setForYou(null); setRecent(readRecent()); }
  }
  await tick();   // the page is drawn first
  syncHistory();
  const h: History | null = historyStarted() ? history() : null;
  const t = now(), today = fy.dayOf(t);
  const key = `${h !== null ? (h as History).version(guid) : 'none'}|${libKey(lib)}|${deepKey()}`;
  const old = page;
  if (old !== null && (old as ForYouData).key === key && (old as ForYouData).day === today) return;
  const m = currentModel();
  if (m === null || library() !== lib) return;
  await tick();
  const s = fy.signals(h, guid, m, t);
  await tick();
  let daily: fy.Card[] = [];
  if (old !== null && (old as ForYouData).day === today) { for (const sh of (old as ForYouData).shelves) if (sh.id === 'daily') daily = sh.cards; }
  else daily = fy.dailyMixes(s, today);
  await tick();
  const made = fy.onRepeat(s).concat(fy.repeatRewind(s)).concat(fy.rediscover(s)).concat(fy.timeCapsule(s));
  await tick();
  const because = fy.becauseYouListened(s);
  await tick();
  const d = new Date(t * 1000);
  const year = fy.yearReview(h, s, t);
  const month = fy.MONTHS[d.getMonth()];
  const tops = fy.topSongs(s, 'top-month', `Top songs · ${month}`, 'Your most played this month', fy.monthStart(t), t + 1, 50)
    .concat(fy.topSongs(s, 'top-year', `Top songs · ${year.year}`, 'Your most played this year', fy.yearStart(t), t + 1, 100));
  if (year.listens > 0) {
    const covers: string[] = [];
    for (const c of tops) if (c.id === 'top-year') for (const id of c.tracks.slice(0, 4)) covers.push(id);
    tops.push({ kind: 'year', id: 'year', title: `Your ${year.year}`, subtitle: `${year.listens} listens · about ${year.minutes} minutes`, tracks: covers, at: 0 });
  }
  const shelves: fy.Shelf[] = [
    { id: 'jump', title: 'Jump back in', cards: fy.jumpBackIn(s, lib.playlists) },
    { id: 'daily', title: 'Your daily mixes', cards: daily },
    { id: 'made', title: 'Made for you', cards: made },
  ];
  for (const b of because) shelves.push(b);
  shelves.push({ id: 'top', title: 'Your top songs', cards: tops });
  shelves.push({ id: 'artists-month', title: `Top artists · ${month}`, cards: fy.topArtists(h, fy.monthStart(t), t + 1, 12) });
  shelves.push({ id: 'artists-year', title: `Top artists · ${year.year}`, cards: fy.topArtists(h, fy.yearStart(t), t + 1, 12) });
  if (s.m.deep !== null) {   // tier 2: AudioMuse's near lists of the seeds, then the model with them
    await prepareNear(fy.soundsLikeSeeds(s), true);
    if (library() !== lib) return;
    currentModel();   // attaches them to the same model
  }
  for (const x of fy.extraShelves(s)) shelves.push(x);
  const counts = historyCounts();
  const data: ForYouData = { format: FORMAT, guid: guid, key: key, day: today, listens: counts.listens, matched: counts.matchedListens, shelves: shelves, year: year };
  if (library() !== lib) return;   // another iPod opened meanwhile
  try { writeJson('foryou.json', JSON.stringify(data)); } catch (e) { /* a read-only home: worked out again next time */ }
  show(data, recent(), lib);
}

/** Jump back in: the albums and playlists of the last sessions and the drafts played from the page, newest first. */
export function jumpCards(data: ForYouData): fy.Card[] {
  let list: fy.Card[] = recent().slice();
  for (const sh of data.shelves) if (sh.id === 'jump') list = list.concat(sh.cards);
  list.sort((a: fy.Card, b: fy.Card) => b.at - a.at);
  return list.slice(0, RECENT_MAX);
}

// ---- what a card does

export function albumOf(key: string): Album | null { for (const a of albums()) if (a.key === key) return a; return null; }
export function artistOf(name: string): Artist | null {
  const k = name.toLowerCase();
  for (const a of artists()) if (a.name.toLowerCase() === k) return a;
  return null;
}

/** A click on a card: a draft opens on the Playlists page, an album, a playlist or an artist on theirs, the year its view. */
export function openCard(c: fy.Card): void {
  if (c.kind === 'draft') openPlaylist(PREFIX + c.id);
  else if (c.kind === 'album') { const a = albumOf(c.id); if (a !== null) openAlbum(a as Album); }
  else if (c.kind === 'playlist') openPlaylist(c.id);
  else if (c.kind === 'artist') { const a = artistOf(c.id); if (a !== null) openArtist((a as Artist).name); }
  else if (c.kind === 'year') showPage(PAGE_YEAR);
}

/** The play button of a draft card: plays it on the output chosen and keeps it for Jump back in. */
export function playCard(c: fy.Card): void {
  const kept = c.id.startsWith('recent:') ? c.id : `recent:${c.id}`;
  const lib = library();
  if (lib === null) return;
  const byId = new Map<string, ipod.Track>();
  for (const t of (lib as PodLibrary).tracks) byId.set(t.id, t);
  const full = draftOfCard(c, byId);
  if (full.tracks.length === 0) return;
  play(full);
  const r: fy.Card = { kind: 'draft', id: kept, title: c.title, subtitle: c.subtitle, tracks: c.tracks, at: now() };
  const list: fy.Card[] = [r];
  for (const x of recent()) if (x.id !== kept && list.length < RECENT_MAX) list.push(x);
  try { writeJson('foryou-recent.json', JSON.stringify(list)); } catch (e) { /* kept for this run only */ }
  const data = forYou();
  if (data !== null) show(data as ForYouData, list, lib as PodLibrary); else setRecent(list);
}
