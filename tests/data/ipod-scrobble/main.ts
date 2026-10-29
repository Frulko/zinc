// The scrobbling core of the iPod app (examples/ipod/src/services/scrobble.ts) against tests/data/ipod-scrobble/stub.py (IPOD_LASTFM_URL,
// IPOD_LISTENBRAINZ_URL): the rule, listens that add up and count once, the Last.fm sign-in, now playing, the offline queues kept on
// disk and sent once the services answer, by batches of 50. tests/t1/ipod_scrobble.sh checks what the stub received.
import * as fs from 'zinc:fs';
import { env } from 'zinc:sys';
import { Scrobbler, Scrobble, Accounts, counts, lastfmToken, lastfmAuthUrl, lastfmSession, lastfmSessionIfApproved, lastfmCheck, listenbrainzCheck } from '../../../examples/ipod/src/services/scrobble';

function song(title: string, durationS: i32, at: number): Scrobble {
  return { artist: 'Band', track: title, album: 'First', albumArtist: 'Band', durationS: durationS, at: at };
}

async function main(): Promise<void> {
  const dir = env('SCROBBLE_DIR');
  // the rule: more than 30 s long, heard half of it or 4 minutes
  console.log('rule', counts(30000, 30000), counts(31000, 15500), counts(31000, 15000), counts(600000, 240000), counts(600000, 239000));

  // a scrobbler with no account: listens count (for the iPod) but nothing is queued
  const off = new Scrobbler(`${dir}/off`);
  console.log('off', off.heard('l0', song('Alpha', 200, 1700000000), 120000), off.waitingLastfm(), off.waitingListenbrainz());

  // the sign-in
  const token = await lastfmToken('apikey', 'sekrit');
  console.log('auth url', lastfmAuthUrl('apikey', token));
  const session = await lastfmSession('apikey', 'sekrit', token);
  console.log('session', session.name, session.key);
  console.log('not approved yet', await lastfmSessionIfApproved('apikey', 'sekrit', 'other') === null);

  const s = new Scrobbler(`${dir}/q`);
  const a = new Accounts();
  a.lastfmKey = 'apikey'; a.lastfmSecret = 'sekrit'; a.lastfmSession = session.key; a.listenbrainzToken = 'lbtoken';
  s.accounts = a;
  console.log('check', await lastfmCheck(a), await listenbrainzCheck('lbtoken'));
  let refused = '';
  try { await listenbrainzCheck('nope'); } catch (e) { refused = (e as Error).message; }
  console.log('refused', refused);
  await s.nowPlaying(song('Alpha', 200, 1700000000));
  console.log('now playing errors', s.lastfmError === '' && s.listenbrainzError === '');

  // offline: the listen counts once (60 s then 50 s of a 200 s song: the second part makes it), resuming it adds nothing more
  fs.writeText(`${dir}/offline`, '');
  console.log('heard', s.heard('l1', song('Alpha', 200, 1700000000), 60000), s.heard('l1', song('Alpha', 200, 1700000000), 50000), s.heard('l1', song('Alpha', 200, 1700000000), 90000));
  s.heard('l2|beta|1', song('Beta', 200, 1700000050), 10000);   // left early: taken up again later by its id
  console.log('open listen',s.openListen('l2|'), s.openListen('l1') === '');
  await s.flush();
  console.log('offline waiting', s.waitingLastfm(), s.waitingListenbrainz(), s.lastfmError.indexOf('waiting') > 0, s.listenbrainzError.indexOf('503') >= 0);
  for (let i = 0; i < 59; i++) s.submit(song(`Song ${i}`, 200, 1700000100 + i));
  await s.flush();
  // a new scrobbler on the same folder (the app started again) finds the 60 listens and sends them once the services answer
  fs.remove(`${dir}/offline`);
  const again = new Scrobbler(`${dir}/q`);
  again.accounts = a;
  console.log('after restart', again.waitingLastfm(), again.waitingListenbrainz());
  await again.flush();
  console.log('sent', again.waitingLastfm(), again.waitingListenbrainz(), again.lastfmError === '', again.listenbrainzError === '');
}
main();
