// Plays heard away from the iPod, counted on it (its play counts and last played, zinc:ipod's played()): those the app hands over
// (POST /api/played) and the Subsonic clients' scrobbles. Without --allow-changes nothing is written to the iPod: the plays wait in
// the iPod's folder (<backups>/cache/<GUID>/plays.json) and are written once the daemon runs with --allow-changes. The Subsonic
// scrobbles go to Last.fm and ListenBrainz too, when their accounts are given (--lastfm-*, --listenbrainz-token).
import * as ipod from 'zinc:ipod';
import * as fs from 'zinc:fs';
import { Scrobbler, Accounts } from '../../../ipod/src/services/scrobble';
import { options } from './options';
import { lib, load } from './library';
import { podDir, backupPlace } from './files';

interface PlaysFile { plays: ipod.Play[]; }
let writing = false;

export const scrobbler = new Scrobbler(`${backupPlace()}/scrobble`);
const accounts = new Accounts();
accounts.lastfmKey = options.lastfmKey; accounts.lastfmSecret = options.lastfmSecret; accounts.lastfmSession = options.lastfmSession;
accounts.listenbrainzToken = options.listenbrainzToken;
scrobbler.accounts = accounts;
scrobbler.log = (what: string, result: string, ok: boolean) => { console.log(`ipod-web: ${what}: ${result}`); };

function pendingFile(): string { return `${podDir('')}/plays.json`; }
function pending(): ipod.Play[] {
  try { if (fs.exists(pendingFile())) { const f: PlaysFile = JSON.parse(fs.readText(pendingFile())); return f.plays; } } catch (e) { /* lost: none */ }
  return [];
}
function keep(plays: ipod.Play[]): void {
  const f: PlaysFile = { plays: plays };
  if (plays.length === 0) { if (fs.exists(pendingFile())) fs.remove(pendingFile()); return; }
  fs.writeText(pendingFile(), JSON.stringify(f));
}

/** Counts `plays` on the open iPod with the ones waiting, or keeps them when changes are not allowed. The number counted, or -n
 *  when n plays now wait. */
export async function count(plays: ipod.Play[]): Promise<i32> {
  const all = pending();
  for (const p of plays) all.push(p);
  if (!options.allowChanges || writing) { keep(all); return -all.length; }   // one write at a time: the others wait for the next scan
  if (all.length === 0) return 0;
  keep(all);
  writing = true;
  let counted: ipod.Track[] = [];
  try { counted = await ipod.played(all); } finally { writing = false; }
  keep(pending().slice(all.length));   // plays kept meanwhile stay
  await load();
  console.log(`ipod-web: ${all.length} play${all.length === 1 ? '' : 's'} counted on the iPod`);
  return counted.length;
}

/** After a scan: the plays kept while the daemon was read only, written once it may (another run with --allow-changes). */
export async function writeWaiting(): Promise<void> {
  if (!options.allowChanges || lib.mountpoint === '' || !fs.exists(pendingFile())) return;
  try { await count([]); } catch (e) { console.log(`ipod-web: the plays waiting could not be counted: ${(e as Error).message}`); }
}
