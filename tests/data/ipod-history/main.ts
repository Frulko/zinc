// The listening history of the iPod app (examples/ipod/src/services/history.ts, historyImport.ts) against the stand-in services of
// tests/data/ipod-scrobble/stub.py: the iPod's own history.jsonl, a Last.fm import stopped after 3 pages then resumed (an error 29 on
// the way), an incremental import, ListenBrainz by its API and by an export zip, the matching to the fixture iPod's library.json, and
// the queries. Prints one JSON object; tests/data/ipod-history/check.py compares it with the stub's data.
import * as fs from 'zinc:fs';
import * as net from 'zinc:net';
import { env } from 'zinc:sys';
import { History, syncPods, Ranked } from '../../../examples/ipod/src/services/history';
import { ImportRun, importLastfm, importLastfmRetrying, importListenbrainz, importListenbrainzFile, lastfmUnfinished } from '../../../examples/ipod/src/services/historyImport';

const GUID = '000A27001234ABCD';

function names(rs: Ranked[]): string[] { const out: string[] = []; for (const r of rs) out.push(`${r.artist}|${r.title}|${r.plays}|${r.skips}`); return out; }

async function main(): Promise<void> {
  const dir = env('HISTORY_DIR');
  const file = `${dir}/history/history.sqlite`;
  const out = JSON.parse('{}');
  let h = new History(file);
  await syncPods(h, `${dir}/cache`);
  out.localFirst = h.counts(GUID).listens;

  // Last.fm: stopped after 3 pages, then resumed by a new History on the same file (the app started again)
  const cut = new ImportRun();
  cut.progress = (done: i32, total: i32, added: i32) => { if (done === 3) cut.stopped = true; };
  out.cut = await importLastfm(h, 'apikey', 'ann', cut);
  h.close();
  h = new History(file);
  out.unfinished = lastfmUnfinished(h);
  const pages: string[] = [];
  const resume = new ImportRun();
  resume.progress = (done: i32, total: i32, added: i32) => { pages.push(`${done}/${total}`); };
  const notes: string[] = [];
  resume.note = (line: string) => { notes.push(line); };
  out.resumed = await importLastfm(h, 'apikey', 'ann', resume);
  out.resumePages = pages;
  out.resumeNotes = notes;
  out.unfinishedAfter = lastfmUnfinished(h);
  await new Promise<void>((r: () => void) => { setTimeout(r, 2100); });   // the scrobble added during the import is now in the past
  out.incremental = await importLastfm(h, 'apikey', 'ann', new ImportRun());
  out.again = await importLastfm(h, 'apikey', 'ann', new ImportRun());

  out.listenbrainz = await importListenbrainz(h, 'ann', new ImportRun());
  out.zip = await importListenbrainzFile(h, `${dir}/export.zip`, new ImportRun());
  out.zipAgain = await importListenbrainzFile(h, `${dir}/export.zip`, new ImportRun());
  // a refusal is not tried again; then (the account changed: from the start) Last.fm down for longer than its own tries at page 4:
  // tried again by itself from page 4; then down for good: given up after the waits of IPOD_HISTORY_RETRY_MS
  const refused: string[] = [];
  const wrong = new ImportRun();
  wrong.note = (line: string) => { refused.push(line); };
  try { await importLastfmRetrying(h, 'apikey', 'nobody', wrong); out.wrongUser = 'no error'; } catch (e) { out.wrongUser = (e as Error).message; }
  out.wrongUserRetries = refused.filter((l: string) => l.indexOf('from where it was') >= 0).length;
  const stub = env('IPOD_LASTFM_URL').replace('/2.0/', '');
  await net.fetch(`${stub}/fail?n=8&after=3`);
  const retry = new ImportRun(), retryNotes: string[] = [], retryPages: i32[] = [];
  retry.note = (line: string) => { retryNotes.push(line); };
  retry.progress = (done: i32, total: i32, added: i32) => { retryPages.push(done); };
  out.retried = await importLastfmRetrying(h, 'apikey', 'ann', retry);
  out.retryWaits = retryNotes.filter((l: string) => l.indexOf('from where it was') >= 0);
  out.retryPages = retryPages;
  out.retryUnfinished = lastfmUnfinished(h);
  await net.fetch(`${stub}/fail?n=1000`);
  try { await importLastfmRetrying(h, 'apikey', 'ann', new ImportRun()); out.givenUp = 'no error'; } catch (e) { out.givenUp = (e as Error).message; }
  await net.fetch(`${stub}/fail?n=0`);

  await syncPods(h, `${dir}/cache`);
  const c = h.counts(GUID);
  out.syncAgain = await syncPods(h, `${dir}/cache`);   // nothing new: the listens and the library are not read again
  out.syncMark = h.lastRow() > 0 && h.getNumber(`match.${GUID}.row`) === h.lastRow();   // the last listen matched is kept
  out.counts = [c.listens, c.matchedListens, c.songs, c.unmatchedSongs, c.unmatchedListens];
  const m = JSON.parse('{}');
  const cat = JSON.parse(fs.readText(`${dir}/history-data.json`)).catalog;
  for (let i = 0; i < cat.length; i++) {
    const r = h.matchOf(GUID, '' + cat[i][0], '' + cat[i][1]);
    m['' + cat[i][0] + '|' + cat[i][1]] = `${r.trackId}|${r.method}`;
  }
  m['Björk|Jóga'] = `${h.matchOf(GUID, 'Björk', 'Jóga').trackId}|${h.matchOf(GUID, 'Björk', 'Jóga').method}`;
  out.matches = m;
  const win0 = 1600000000, win1 = 1605000000;
  out.topTracks = names(h.topTracks(win0, win1, 3));
  out.topArtists = names(h.topArtists(win0, win1, 3));
  out.sessions = h.sessions(win0, win1).length;
  const firstSession = h.sessions(win0, win1)[0];
  out.firstSession = [firstSession.start, firstSession.listens];
  const pp = JSON.parse('{}');
  for (const p of h.podPlays(GUID, 0, 4000000000)) pp[p.trackId] = [p.plays, p.skips, p.last];
  out.podPlays = pp;
  out.lastPlayed = h.lastPlayed('Carpenters', 'Yesterday Once Mor');
  out.unmatchedArtists = names(h.unmatchedArtists(GUID, 2));
  out.unmatchedTracks = names(h.unmatchedTracks(GUID, 2));
  out.loved = h.loved(10).length;
  out.topOverall = names(h.top('lastfm', 'tracks', 'overall').slice(0, 2));
  out.topArtists7 = names(h.top('lastfm', 'artists', '7day').slice(0, 1));
  h.close();
  console.log(JSON.stringify(out));
}
main().catch((e: Error) => { console.error(`ipod-history: ${e.message}`); });
