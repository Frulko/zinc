// The listening history in the app: one database for the person (services/history.ts, in <backups>/history/), the imports of
// services/historyImport.ts run as Transfers jobs beside the iPod's queue (an import of years of scrobbles does not hold up a copy),
// with their pages as progress and Cancel to stop them (Import again resumes), and each iPod's own listens (history.jsonl) brought in
// and matched to its library whenever the Settings page shows or an import ends.
import { batch, createSignal } from 'zinc:ui/solid';
import * as dialog from 'zinc:system/dialog';
import { History, Counts, Ranked, syncPods } from './history';
import { ImportRun, importLastfmRetrying, importListenbrainz, importListenbrainzFile, lastfmUnfinished, listenbrainzUnfinished } from './historyImport';
import { runBeside, busy } from './transfers';
import { log, backupPlace } from './log';
import { loadConfig, saveConfig } from './config';
import * as cache from './cache';
import * as fs from 'zinc:fs';

let store: History | null = null;
/** Moves on each time the history changed: what shows it reads it again. */
export const [historyVersion, setHistoryVersion] = createSignal<i32>(0);

/** The history database, opened at the first call. @throws when it cannot be opened */
export function history(): History {
  if (store === null) store = new History(`${backupPlace()}/history/history.sqlite`);
  return store as History;
}

/** A history was started (by the Settings page or an import): the pages that only read it leave it alone until then. */
export function historyStarted(): boolean { return store !== null || fs.exists(`${backupPlace()}/history/history.sqlite`); }

let syncing: Promise<void> | null = null;

/** Brings in the iPods' new local listens and matches what is not matched yet, a slice at a time (cheap when nothing changed: what
 *  shows the history is told only of a change). A call during a sync shares it. */
export function syncHistory(): Promise<void> {
  if (syncing === null) syncing = (async (): Promise<void> => {
    let n: i32 = 0;
    try { n = await syncPods(history(), `${backupPlace()}/cache`); } catch (e) { log('Listening history', (e as Error).message, false); }
    syncing = null;
    if (n > 0) setHistoryVersion(historyVersion() + 1);
  })();
  return syncing as Promise<void>;
}

/** True while an import runs. */
export function importing(): boolean { return busy('history'); }

function start(label: string, work: (run: ImportRun) => Promise<string>): void {
  if (importing()) return;
  const run = new ImportRun();
  const job = runBeside('history', label, async (): Promise<string> => { const line = await work(run); await syncHistory(); setHistoryVersion(historyVersion() + 1); return line; }, () => { run.stopped = true; });
  run.progress = (done: i32, total: i32, added: i32) => {
    batch(() => { job.setDone(done); job.setTotal(total); job.setDetail(`pages · ${added} new listen${added === 1 ? '' : 's'}`); });
  };
  run.note = (line: string) => job.note(line);
}

/** Imports (or resumes importing) `user`'s Last.fm history with the API `key` of the Last.fm card (kept: signing in is not needed to
 *  read a public history). A failure that passes (the network, Last.fm busy) is tried again by itself, from where it was. */
export function importLastfmNow(key: string, user: string): void {
  const c = loadConfig();
  if (key.trim() !== '') c.lastfmKey = key.trim();
  c.historyLastfmUser = user.trim();
  saveConfig(c);
  start('Importing Last.fm history', (run: ImportRun): Promise<string> => importLastfmRetrying(history(), c.lastfmKey, c.historyLastfmUser, run));
}

/** Imports (or resumes importing) `user`'s ListenBrainz listens. */
export function importListenbrainzNow(user: string): void {
  const c = loadConfig();
  c.historyListenbrainzUser = user.trim();
  saveConfig(c);
  start('Importing ListenBrainz listens', (run: ImportRun): Promise<string> => importListenbrainz(history(), c.historyListenbrainzUser, run));
}

/** Asks for a ListenBrainz export (the zip of listenbrainz.org/settings/export, or a JSON file) and imports it. */
export async function importListenbrainzExport(): Promise<void> {
  const o = new dialog.OpenOptions();
  o.title = 'ListenBrainz export';
  o.filters = [new dialog.Filter('ListenBrainz export', ['zip', 'json', 'jsonl'])];
  const picked = await dialog.open(o);
  if (picked === null || (picked as string[]).length === 0) return;
  const file = (picked as string[])[0];
  start('Importing a ListenBrainz export', (run: ImportRun): Promise<string> => importListenbrainzFile(history(), file, run));
}

/** An import was left unfinished (its button says Resume). */
export function lastfmLeft(): boolean { try { return lastfmUnfinished(history()); } catch (e) { return false; } }
export function listenbrainzLeft(): boolean { try { return listenbrainzUnfinished(history()); } catch (e) { return false; } }

/** The listens, and how many are matched on the iPod open. */
export function historyCounts(): Counts { try { return history().counts(cache.podKey()); } catch (e) { return new Counts(); } }

/** What the iPod open misses most: its unmatched artists and songs, most played first. */
export function unmatchedArtists(limit: i32): Ranked[] { try { return history().unmatchedArtists(cache.podKey(), limit); } catch (e) { return []; } }
export function unmatchedTracks(limit: i32): Ranked[] { try { return history().unmatchedTracks(cache.podKey(), limit); } catch (e) { return []; } }
