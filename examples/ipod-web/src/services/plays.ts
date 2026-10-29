// Plays heard away from the iPod, counted on it (its play counts and last played, zinc:ipod's played()): those the app hands over
// (POST /api/played) and the Subsonic clients' scrobbles. Without --allow-changes nothing is written to the iPod: the plays wait in
// the iPod's folder (<backups>/cache/<GUID>/plays.json) and are written once the daemon runs with --allow-changes. The Subsonic
// scrobbles go to Last.fm and ListenBrainz too, when their accounts are given (--lastfm-*, --listenbrainz-token).
import * as ipod from 'zinc:ipod';
import * as fs from 'zinc:fs';
import { Scrobbler, Accounts, Scrobble, counts, appendHistory, isoLocal } from '../../../ipod/src/services/scrobble';
import { options } from './options';
import { lib, load } from './library';
import { podDir, backupPlace } from './files';
import { Query } from '../query';
import { trackOf } from './subsonic';

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

/** scrobble: with submission (the default) the client heard the song: counted on the iPod and sent to Last.fm and ListenBrainz (a song
 *  of 30 s or less never counts, as on Last.fm); without, it is what plays now. `time`: when it was played, in ms (else now). */
export async function scrobbleFromSubsonic(q: Query): Promise<void> {
  const submission = q.get('submission') !== 'false';
  const at = q.get('time') !== '' ? Math.floor(parseFloat(q.get('time')) / 1000) : Math.floor(Date.now() / 1000);
  const plays: ipod.Play[] = [];
  for (const id of q.params.getAll('id')) {
    const t = trackOf(id);
    if (t === null) continue;
    const track = t as ipod.Track;
    const s: Scrobble = { artist: track.artist !== '' ? track.artist : track.albumArtist, track: track.title, album: track.album, albumArtist: track.albumArtist, durationS: Math.round(track.durationMs / 1000), at: at };
    if (!submission) { scrobbler.nowPlaying(s); continue; }
    const counted = counts(track.durationMs, track.durationMs);   // the client says it was heard: only a short song does not count
    appendHistory(`${podDir('')}/history.jsonl`, { listen: `${track.id}|${at * 1000}`, trackId: track.id, artist: s.artist, title: s.track, album: s.album,
      durationMs: track.durationMs, heardMs: track.durationMs, startedAt: isoLocal(at * 1000), source: 'subsonic', counted: counted, skipped: !counted });
    if (!counted) continue;
    plays.push({ id: track.id, count: 1, at: at });
    if (s.track !== '' && s.artist !== '') scrobbler.submit(s);
  }
  if (plays.length > 0) await count(plays);
}
