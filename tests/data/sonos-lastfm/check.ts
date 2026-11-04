import { Track, Listen, observe, eligible, entry, record, Lastfm, ApiError, signature, LastfmDelivery, Store } from 'zinc:lastfm';
import { System, discover } from 'zinc:sonos';
import { playbackInfo, playbackChangeKey } from '../../../app/sonos-lastfm/src/log';
import { readConfig } from '../../../app/sonos-lastfm/src/config';
import { Log } from '../../../app/sonos-lastfm/src/log';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
function check(ok: boolean, why: string): void { if (!ok) throw new Error(why); }
function track(position: number, playing: boolean = true, title: string = 'Song'): Track {
  const t = new Track(); t.artist = 'Artist'; t.title = title; t.album = 'Album'; t.uri = 'spotify:track:one';
  t.duration = 120; t.position = position; t.playing = playing; return t;
}
async function main(): Promise<void> {
  const config = readConfig(['--data', '/tmp/music', '--port', '8900', '--interval', '3', '--sonos', 'http://127.0.0.1:1400']);
  check(config.data === '/tmp/music' && config.port === 8900 && config.interval === 3 && config.sonosAddress === '127.0.0.1:1400', 'configuration');
  const invalidArgs: string[][] = [['--port', '0'], ['--port', '1.5'], ['--interval', '16'], ['--interval', 'oops'], ['--data'], ['--unknown', 'x']];
  for (const args of invalidArgs) {
    let refused = false;
    try { readConfig(args); } catch (error) { refused = true; }
    check(refused, 'invalid CLI arguments rejected');
  }
  const l = new Listen(); l.group = 'coordinator';
  observe(l, track(0), 1000, 2);
  for (let p = 2; p <= 58; p += 2) observe(l, track(p), 1000 + p, 2);
  check(!eligible(l), 'half track not reached');
  observe(l, track(60), 1060, 2); check(eligible(l), 'half track qualifies');
  const info = playbackInfo('Living room', 'PLAYING', 'spotify', l, '');
  check(info.indexOf('Artist - Song') >= 0 && info.indexOf('album: Album') >= 0 && info.indexOf('1:00/2:00') >= 0 && info.indexOf('listened 1:00/1:00') >= 0 && info.endsWith('source: spotify'), 'live playback details');
  check(playbackInfo('Room\nname', 'PAUSED_PLAYBACK', 'spotify', l, 'Last.fm: scrobbled').indexOf('\n') < 0, 'one line per status');
  const change = playbackChangeKey('Room', 'PLAYING', 'spotify', l, '');
  l.track.position += 2; l.heard += 2;
  check(playbackChangeKey('Room', 'PLAYING', 'spotify', l, '') === change, 'progress does not spam the log');
  check(playbackChangeKey('Room', 'PAUSED_PLAYBACK', 'spotify', l, '') !== change, 'pause is a log event');
  check(playbackChangeKey('Other room', 'PLAYING', 'spotify', l, '') !== change, 'group change is a log event');
  check(playbackChangeKey('Room', 'PLAYING', 'spotify', l, 'Last.fm: scrobbled') !== change, 'delivery change is a log event');
  l.track.title = 'New song';
  check(playbackChangeKey('Room', 'PLAYING', 'spotify', l, '') !== change, 'track change is a log event');
  l.track.title = 'Song'; l.track.position -= 2; l.heard -= 2;
  const first = entry(l); l.queued = true;
  observe(l, track(62), 1062, 2); check(!eligible(l), 'once per listen');
  observe(l, track(118), 1064, 2); check(l.heard === 62, 'seek does not add listening time');
  observe(l, track(0), 1066, 2); check(l.heard === 0 && !l.queued && entry(l).id !== first.id, 'repeat is a new listen');
  for (let p = 2; p <= 60; p += 2) observe(l, track(p), 1066 + p, 2);
  check(eligible(l), 'repeat allowed within 30 minutes');
  const pause = new Listen(); observe(pause, track(0), 1000, 2); observe(pause, track(0, false), 1002, 2);
  observe(pause, track(0, false), 1100, 2); observe(pause, track(0), 1102, 2);
  observe(pause, track(2), 1104, 2); check(pause.heard === 2, 'pause not counted');
  observe(pause, track(90), 1106, 2); check(pause.heard === 2, 'forward seek not counted');
  observe(pause, track(92), 1200, 2); check(pause.heard === 2, 'unobserved downtime not counted');
  const short = new Listen(); short.track = track(20); short.track.duration = 30; short.heard = 30;
  check(playbackInfo('Room', 'PLAYING', 'radio', short, '').indexOf('30s or shorter') >= 0, 'short track log reason');
  check(!eligible(short), '30 second tracks skipped'); short.track.duration = 0; check(!eligible(short), 'unknown durations skipped');
  check(playbackInfo('Room', 'PLAYING', 'radio', short, '').indexOf('unknown duration') >= 0, 'unknown duration log reason');
  const long = new Listen(); long.track = track(300); long.track.duration = 1000; long.heard = 240; check(eligible(long), 'four minute cap');
  const house = new System(''); house.applyTopology('<ZoneGroups><ZoneGroup Coordinator="A"><ZoneGroupMember UUID="A" ZoneName="Living &amp; kitchen" Location="http://127.0.0.1:1400/xml/device_description.xml"/><ZoneGroupMember UUID="B" ZoneName="Follower" Location="http://127.0.0.2:1400/xml/device_description.xml"/></ZoneGroup></ZoneGroups>');
  check(house.groups.length === 1 && house.groups[0].coordinator.uuid === 'A' && house.groups[0].name().startsWith('Living & kitchen'), 'plugin coordinator');
  const store = new Store(sys.env('TEST_DATA')); store.load(); store.listens.push(l); store.enqueue(first); store.enqueue(first); store.save();
  const recorded = new Store(sys.env('TEST_DATA') + '/record');
  recorded.load();
  check(record(recorded, 'R', track(0), 1000, 2), 'a new song is announced');
  check(!record(recorded, 'R', track(2), 1002, 2), 'once');
  const unknown = track(4); unknown.duration = 0;
  check(!record(recorded, 'R', unknown, 1004, 2) && recorded.pending.length === 0, 'an unknown duration is not counted');
  for (let p = 2; p <= 60; p += 2) record(recorded, 'R', track(p), 2000 + p, 2);
  check(recorded.pending.length === 1, 'record queues an eligible listen');
  const loaded = new Store(store.dir); loaded.load();
  check(loaded.pending.length === 1 && loaded.pending[0].timestamp === 1000 && loaded.listens[0].heard === 60, 'durable queue, original timestamp, dedup');
  observe(loaded.listens[0], track(62), 5000, 2); check(loaded.listens[0].heard === 60, 'restart earns no downtime');
  check((fs.stat(store.dir + '/state.json').mode & 0o777) === 0o600, 'private state permissions');
  const p = new Map<string, string>(); p.set('b', 'two'); p.set('a', 'one'); p.set('format', 'json'); p.set('api_sig', 'excluded');
  check(await signature(p, 'secret') === 'e9e7274870c1332e02554d6b5715657c', 'sorted raw MD5 signature');
  const base = sys.env('TEST_SONOS');
  const found = await discover(base.slice(7)); check(found.groups.length === 1, 'plugin discovery and topology');
  await found.update(found.groups[0]);
  const live = new Track(); live.artist = found.groups[0].track.artist; live.title = found.groups[0].track.title;
  check(live.artist === 'Artist' && found.groups[0].track.position === 60, 'plugin playback');
  const api = new Lastfm('key', 'secret', sys.env('TEST_LASTFM')); api.session = 'session';
  const delivery = new LastfmDelivery(api, loaded, new Log(), 'session');
  await delivery.sendOldest(2000);
  check(loaded.pending.length === 1 && delivery.retryAt === 2005, 'HTTP failure retains outbox and schedules retry');
  await delivery.sendOldest(2001);
  check(loaded.pending.length === 1 && delivery.retryAt === 2005, 'retry waits for backoff');
  await delivery.sendOldest(2005);
  check(loaded.pending.length === 0 && loaded.sent === 1, 'accepted delivery persists acknowledgement');
  const acknowledged = new Store(loaded.dir);
  acknowledged.load();
  check(acknowledged.pending.length === 0 && acknowledged.sent === 1, 'acknowledgement survives restart');
  let failed = false;
  check((await api.scrobble(first)).indexOf('ignored code 3') >= 0, 'ignored record is not success');
  failed = false;
  try { await api.scrobble(first); } catch (e) { failed = e instanceof ApiError && e.code === 9; }
  check(failed, 'revoked auth classified');
  for (let i = 0; i < 2; i++) {
    failed = false;
    try { await api.scrobble(first); } catch (e) { failed = e instanceof ApiError && e.code === 29; }
    check(failed, 'future timestamps and daily limits retained for retry');
  }
  failed = false;
  try { await api.scrobble(first); } catch (e) { failed = e instanceof ApiError && e.code === 6; }
  check(failed, 'invalid scrobble parameters classified');
  check(await api.token() === 'browser-token' && await api.authorize('browser-token') === 'session', 'passwordless auth');
  failed = false;
  try { await api.authorize('pending-token'); } catch (e) { failed = e instanceof ApiError && e.code === 14; }
  check(failed, 'HTTP 403 retains pending-authorization API code');
  await api.nowPlaying(live);
  fs.writeText(store.dir + '/state.json', '{broken');
  failed = false; try { new Store(store.dir).load(); } catch (e) { failed = true; }
  check(failed && fs.readText(store.dir + '/state.json') === '{broken', 'corrupt state preserved');
  console.log('sonos-lastfm checks passed');
}
main().catch((e: Error) => { console.error(e.message); sys.exit(1); });
