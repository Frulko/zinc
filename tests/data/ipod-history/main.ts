// The listening history of the iPod app (examples/ipod/src/services/history.ts, historyImport.ts) against the stand-in services of
// tests/data/ipod-scrobble/stub.py: the iPod's own history.jsonl, a Last.fm import stopped after 3 pages then resumed (an error 29 on
// the way), an incremental import, ListenBrainz by its API and by an export zip, the matching to the fixture iPod's library.json, and
// the queries. Prints one JSON object; tests/data/ipod-history/check.py compares it with the stub's data.
import * as fs from 'zinc:fs';
import { env } from 'zinc:sys';
import { History, syncPods, Ranked } from '../../../examples/ipod/src/services/history';
import { ImportRun, importLastfm, importListenbrainz, importListenbrainzFile, lastfmUnfinished } from '../../../examples/ipod/src/services/historyImport';

const GUID = '000A27001234ABCD';

function names(rs: Ranked[]): string[] { const out: string[] = []; for (const r of rs) out.push(`${r.artist}|${r.title}|${r.plays}|${r.skips}`); return out; }

async function main(): Promise<void> {
  const dir = env('HISTORY_DIR');
  const file = `${dir}/history/history.sqlite`;
  const out = JSON.parse('{}');
  let h = new History(file);
  syncPods(h, `${dir}/cache`);
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
  out.resumed = await importLastfm(h, 'apikey', 'ann', resume);
  out.resumePages = pages;
  out.unfinishedAfter = lastfmUnfinished(h);
  await new Promise<void>((r: () => void) => { setTimeout(r, 2100); });   // the scrobble added during the import is now in the past
  out.incremental = await importLastfm(h, 'apikey', 'ann', new ImportRun());
  out.again = await importLastfm(h, 'apikey', 'ann', new ImportRun());

  out.listenbrainz = await importListenbrainz(h, 'ann', new ImportRun());
  out.zip = await importListenbrainzFile(h, `${dir}/export.zip`, new ImportRun());
  out.zipAgain = await importListenbrainzFile(h, `${dir}/export.zip`, new ImportRun());
  try { await importLastfm(h, 'apikey', 'nobody', new ImportRun()); out.wrongUser = 'no error'; } catch (e) { out.wrongUser = (e as Error).message; }

  syncPods(h, `${dir}/cache`);
  const c = h.counts(GUID);
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
