// The AirPlay bridge seen from examples/music-tree, the phone's setup page and the shared scrobbler, against fakes in this process.
import * as fs from 'zinc:fs';
import { Headers, Reply, Request, fetch, serveAsync, stop } from 'zinc:net';
import { Group, airplayBridge, sourceOf, spotifyRoute } from 'zinc:sonos';
import * as sys from 'zinc:sys';
import { URLSearchParams } from 'zinc:web';
import {
  bridge, bridgeSessionOfRoom, isBridgeStream, parseBridgeStatus, readBridgeIntoGroup, sendBridgeCommand,
} from '../../../examples/music-tree/src/services/airplay-bridge';
import { RemoteSetup } from '../../../examples/music-tree/src/services/remote-setup';
import { ScrobbleService } from '../../../examples/music-tree/src/services/scrobble-service';
import { LastfmDelivery, Scrobble } from 'zinc:lastfm';
import { Database } from 'zinc:sqlite';
import { ListeningLog } from '../../../examples/music-tree/src/services/listening-log';
import { ListeningPage, listeningExport, listeningReport } from '../../../examples/music-tree/src/services/listening-page';

function check(ok: boolean, why: string): void { if (!ok) throw new Error(why); }
const KEY = '0123456789abcdef0123456789abcdef', SECRET = 'fedcba9876543210fedcba9876543210';
const dir = sys.env('TEST_DATA');
const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

function json(text: string, status: i32 = 200): Reply { return { status, body: text, contentType: 'application/json' }; }

// The bridge, its answer settable.
let statusBody = JSON.stringify({
  version: '0.4.2', mode: 'gapless',
  sessions: [{ room: 'Salon', rooms: ['Salon', 'Bureau Plafond'], title: 'Un', artist: 'A', album: 'B', source: 'Mac', duration: 200, position: 12, art: '/art/x.jpg' }],
});
let lastAuthorization = '', lastCommand = '';
const fakeBridge = serveAsync(0, async (request: Request): Promise<Reply> => {
  if (request.method === 'POST') {
    lastAuthorization = request.headers.get('authorization');
    lastCommand = request.path;
    return json('{}', lastAuthorization === 'Bearer jeton' ? 200 : 401);
  }
  return json(statusBody);
}, { hostname: '127.0.0.1' });
const host = `127.0.0.1:${fakeBridge}`;

// Last.fm: asks for the session once, then takes scrobbles.
let scrobbles = 0, refuseSession = false, recentBody = '{"recenttracks":{"track":[]}}', recentStatus: i32 = 200;
const fakeLastfm = serveAsync(0, async (request: Request): Promise<Reply> => {
  if (request.method === 'GET' && request.path.indexOf('user.getRecentTracks') >= 0) return json(recentBody, recentStatus);
  if (request.method === 'GET') return json(request.path);   // the authorization page: where the phone was sent
  const form = new URLSearchParams(request.body);
  if (form.get('method') === 'auth.getSession') {
    if (refuseSession) return json('{"error":4}', 403);
    return json(`{"session":{"name":"<moi>","key":"clef-de-session"}}`);
  }
  if (form.get('method') === 'track.scrobble') {
    scrobbles++;
    return json('{"scrobbles":{"@attr":{"accepted":1,"ignored":0}}}');
  }
  return json('{}');
}, { hostname: '127.0.0.1' });
const lastfmUrl = `http://127.0.0.1:${fakeLastfm}/2.0/`;

function group(uri: string, room: string = 'Salon'): Group {
  const g = new Group();
  g.coordinator.name = room;
  g.coordinator.uuid = 'RINCON_' + room;
  g.media.uri = uri;
  g.state = 'PLAYING';
  return g;
}

function form(fields: string[][]): string {
  const f = new URLSearchParams();
  for (const pair of fields) f.set(pair[0], pair[1]);
  return f.toString();
}

async function post(url: string, body: string): Promise<[i32, string]> {
  const r = await fetch(url, { method: 'POST', body, contentType: 'application/x-www-form-urlencoded', timeoutMs: 4000 });
  const text = await r.text();
  return [r.status as i32, text];
}

async function get(url: string): Promise<[i32, string]> {
  const r = await fetch(url, { timeoutMs: 4000 });
  const text = await r.text();
  return [r.status as i32, text];
}

async function main(): Promise<void> {
  // Recognising the stream, in the three spellings the bridge's modes use.
  check(airplayBridge('x-rincon-mp3radio://http://192.168.1.5:7099/ap2-8a931219.mp3') === '192.168.1.5:7099', 'radio stream');
  check(airplayBridge('http://192.168.1.5:7099/ap2-8a931219.mp3') === '192.168.1.5:7099', 'plain stream');
  check(airplayBridge('http://192.168.1.5:7099/ap2-8a931219-3.mp3') === '192.168.1.5:7099', 'gapless track');
  check(airplayBridge('http://radio.example/ap2-live.mp3') === '', 'a name that is not the bridge\'s');
  check(airplayBridge('x-rincon-mp3radio://http://radio.example/live.mp3') === '', 'a radio');
  check(sourceOf('http://192.168.1.5:7099/ap2-8a931219-3.mp3') === 'airplay', 'sourceOf plain');
  check(sourceOf('x-rincon-mp3radio://http://192.168.1.5:7099/ap2-8a931219.mp3') === 'airplay', 'sourceOf radio');
  check(sourceOf('x-rincon-mp3radio://http://radio.example/live.mp3') === 'radio', 'a radio stays one');
  check(spotifyRoute('x-sonos-vli:RINCON_1:2,spotify:abc', '') === 'connect', 'Connect');
  check(spotifyRoute('x-rincon-queue:RINCON_1#0', 'x-sonos-spotify:spotify%3atrack%3a1?sid=9') === 'sonos', 'the queue of the Sonos service');
  check(spotifyRoute('x-sonos-spotify:spotify%3atrack%3a1?sid=9', '') === 'sonos', 'a song of the Sonos service');
  check(spotifyRoute('x-rincon-queue:RINCON_1#0', 'http://nas/a.mp3') === '', 'a queue of files');
  check(spotifyRoute('http://192.168.1.5:7099/ap2-1.mp3', '') === '', 'AirPlay');

  // The status: untrusted, and read per room.
  check(parseBridgeStatus('not json') === null, 'bad JSON');
  check(parseBridgeStatus('{"version":"1"}') === null, 'no sessions');
  const odd = parseBridgeStatus('{"sessions":[{"room":3,"duration":"x","position":-4},null]}');
  check(odd !== null && odd.sessions.length === 1 && odd.sessions[0].room === '' && odd.sessions[0].duration === 0 && odd.sessions[0].position === 0, 'bad fields');
  const status = parseBridgeStatus(statusBody);
  check(bridgeSessionOfRoom(status, 'Bureau Plafond') !== null, 'a room of the group');
  check(bridgeSessionOfRoom(status, 'Cuisine') === null, 'another room');

  // A group on its stream gets the bridge's song; without a title it keeps Sonos's text and a duration of 0.
  const salon = group(`http://${host}/ap2-8a931219-1.mp3`);
  salon.track.title = 'AirPlay - test';
  check(isBridgeStream(salon), 'bridge stream');
  check(!isBridgeStream(group('x-rincon-mp3radio://http://radio.example/live.mp3')), 'not the bridge');
  await readBridgeIntoGroup(salon);
  check(salon.track.title === 'Un' && salon.track.duration === 200 && salon.track.position === 12, 'song from the bridge');
  check(salon.track.art === `http://${host}/art/x.jpg`, 'cover from the bridge');
  check(bridge.host === host && bridge.status !== null && (bridge.status as any).version === '0.4.2', 'status kept');
  statusBody = '{"version":"0.4.2","mode":"source","sessions":[{"room":"Salon","rooms":["Salon"],"source":"Mac"}]}';
  const noTitle = group(`http://${host}/ap2-8a931219.mp3`);
  noTitle.track.title = 'AirPlay - test';
  await readBridgeIntoGroup(noTitle);
  check(noTitle.track.title === 'AirPlay - test' && noTitle.track.duration === 0, 'no song known');
  const gone = group('http://127.0.0.1:1/ap2-8a931219.mp3');
  await readBridgeIntoGroup(gone);
  check(bridge.status === null && bridge.host === '127.0.0.1:1', 'bridge gone');

  // Commands carry the token.
  bridge.host = host;
  bridge.token = 'jeton';
  await sendBridgeCommand('/api/stop?room=Salon');
  check(lastAuthorization === 'Bearer jeton' && lastCommand === '/api/stop?room=Salon', 'stop');
  bridge.token = 'faux';
  let refused = false;
  try { await sendBridgeCommand('/api/mode?set=text'); } catch (error) { refused = true; }
  check(refused, 'a refused command throws');
  bridge.token = '';

  // The setup page.
  const service = new ScrobbleService(dir + '/private');
  service.start();
  const setup = new RemoteSetup(service, lastfmUrl, `http://127.0.0.1:${fakeLastfm}/auth/`);
  setup.open('127.0.0.1', 0);
  check(setup.isOpen() && setup.code.length === 8 && setup.url.endsWith(`/setup?code=${setup.code}`), 'opened');
  const base = `http://127.0.0.1:${setup.port}`;
  check((await get(`${base}/favicon.ico`))[0] === 404, 'favicon');
  check((await get(`${base}/setup?code=faux`))[0] === 403, 'wrong code');
  check((await get(`${base}/callback/faux?token=t`))[0] === 403, 'wrong code on the callback');
  check((await get(`${base}/setup?code=${setup.code}`))[0] === 200, 'the form');
  const badKey = await post(`${base}/setup`, form([['code', setup.code], ['key', 'court'], ['secret', SECRET]]));
  check(badKey[0] === 400 && badKey[1].indexOf(SECRET) < 0, 'a bad key');
  check((await post(`${base}/setup`, form([['code', setup.code]])))[0] === 400, 'nothing typed');
  check((await get(`${base}/callback/${setup.code}?token=t`))[0] === 400, 'a callback before the form');
  const accepted = await post(`${base}/setup`, form([['code', setup.code], ['key', KEY], ['secret', SECRET], ['bridge', 'jeton']]));
  check(accepted[0] === 200, `the redirect: ${accepted[0]}`);   // fetch follows it to the fake's authorization page, which says where it landed
  check(accepted[1].indexOf(`/auth/?api_key=${KEY}&cb=`) >= 0, `to Last.fm: ${accepted[1]}`);
  check(accepted[1].indexOf(encodeURIComponent(`${base}/callback/${setup.code}`)) >= 0, 'and back');
  check(accepted[1].indexOf(SECRET) < 0, 'the secret stays here');
  check(bridge.token === 'jeton', 'the bridge\'s token');
  refuseSession = true;
  const denied = await get(`${base}/callback/${setup.code}?token=t`);
  check(denied[0] === 502 && !service.connected() && denied[1].indexOf(SECRET) < 0, 'Last.fm refuses');
  refuseSession = false;
  const done = await get(`${base}/callback/${setup.code}?token=t`);
  check(done[0] === 200 && done[1].indexOf('Connecté : &lt;moi&gt;') >= 0, `connected: ${done[1]}`);
  check(done[1].indexOf(SECRET) < 0, 'the secret is not shown again');
  check(service.connected() && service.account() === '<moi>', 'the account');
  for (const name of ['credentials.json', 'session.key', 'bridge.token']) {
    check((fs.stat(`${dir}/private/${name}`).mode & 0o777) === 0o600, `${name} is private`);
  }
  await sleep(500);
  check(!setup.isOpen(), 'closed after the connection');

  // A restart finds it all; five wrong codes close the page.
  bridge.token = '';
  const again = new ScrobbleService(dir + '/private');
  again.start();
  check(again.connected() && again.account() === '<moi>' && bridge.token === 'jeton', 'read back');
  const locked = new RemoteSetup(again, lastfmUrl, `http://127.0.0.1:${fakeLastfm}/auth/`);
  locked.open('127.0.0.1', 0);
  const lockedBase = `http://127.0.0.1:${locked.port}`;
  for (let i = 0; i < 5; i++) await get(`${lockedBase}/setup?code=faux`);
  await sleep(500);
  check(!locked.isOpen(), 'too many wrong codes');

  // Scrobbling from what the bridge said; a stream without a duration counts for nothing.
  (again.api as any).endpoint = lastfmUrl;
  statusBody = JSON.stringify({ version: '0.4.2', mode: 'gapless', sessions: [{ room: 'Salon', rooms: ['Salon'], title: 'Un', artist: 'A', album: 'B', source: 'Mac', duration: 60, position: 0, art: '' }] });
  const heard = group(`http://${host}/ap2-8a931219-1.mp3`);
  await readBridgeIntoGroup(heard);
  const t0 = 1_000_000;
  for (let s = 0; s <= 40; s += 10) {
    heard.track.position = s;
    again.note(heard, t0 + s);
  }
  check(again.store.pending.length === 1 && again.store.pending[0].title === 'Un', 'queued');
  const silent = group(`http://${host}/ap2-8a931219.mp3`, 'Bureau');
  silent.track.artist = 'AirPlay'; silent.track.title = 'Mac';
  for (let s = 0; s <= 40; s += 10) again.note(silent, t0 + s);
  check(again.store.pending.length === 1, 'no duration, no scrobble');
  await again.tick(null, null, false);
  check(scrobbles === 1 && again.store.pending.length === 0, 'delivered');

  // Two scrobblers on one account: left time to the other one, then sent only if it did not.
  const delivery = again.delivery as LastfmDelivery;
  const waiting = (artist: string, title: string, endedAgo: number): void => {
    const s = new Scrobble();
    s.id = artist + title; s.artist = artist; s.title = title; s.duration = 200; s.timestamp = Date.now() / 1000 - 200 - endedAgo;
    again.store.pending = [s];
    delivery.retryAt = 0;
  };
  const dated = (artist: string, title: string, extra: string): string => `{"artist":{"#text":"${artist}"},"name":"${title}"${extra}}`;
  waiting('A', 'Deux', 10);
  await delivery.sendOldest(Date.now() / 1000);
  check(scrobbles === 1 && again.store.pending.length === 1, 'the other scrobbler has its time');
  waiting('A, B', 'Deux !', 200);
  recentBody = `{"recenttracks":{"track":[${dated('a', 'deux', ',"date":{"uts":"1"}')}]}}`;
  await delivery.sendOldest(Date.now() / 1000);
  check(scrobbles === 1 && again.store.pending.length === 0, 'already there: not sent twice');
  waiting('A', 'Deux', 200);
  recentBody = `{"recenttracks":{"track":${dated('A', 'Deux', ',"date":{"uts":"1"}')}}}`;
  await delivery.sendOldest(Date.now() / 1000);
  check(scrobbles === 1 && again.store.pending.length === 0, 'one song comes as an object');
  waiting('A', 'Deux', 200);
  recentBody = `{"recenttracks":{"track":[${dated('A', 'Deux', ',"@attr":{"nowplaying":"true"}')},${dated('A', 'Autre', ',"date":{"uts":"1"}')}]}}`;
  await delivery.sendOldest(Date.now() / 1000);
  check(scrobbles === 2 && again.store.pending.length === 0, 'playing now or another song: sent');
  waiting('A', 'Deux', 200);
  recentBody = '{"error":11}'; recentStatus = 503;
  await delivery.sendOldest(Date.now() / 1000);
  check(scrobbles === 2 && again.store.pending.length === 1 && delivery.retryAt > 0, 'Last.fm down: kept for later');
  waiting('A', 'Deux', 200);
  recentBody = '{"error":17}'; recentStatus = 403;
  await delivery.sendOldest(Date.now() / 1000);
  check(scrobbles === 3 && again.store.pending.length === 0, 'a hidden history does not hold the listens');
  recentStatus = 200;

  // The app's own log: every listen, its mode and context, and the page behind its code.
  const listening = new ListeningLog(':memory:');
  listening.start();
  const heardNow = group('x-rincon-queue:RINCON_Salon#0');
  heardNow.track.uri = 'x-sonos-spotify:spotify%3atrack%3a1?sid=9';
  heardNow.track.artist = 'Air <b>'; heardNow.track.title = 'La Femme'; heardNow.track.album = 'Moon'; heardNow.track.duration = 200;
  const t1 = Date.now() / 1000 - 600;
  for (let s = 0; s <= 100; s += 10) { heardNow.track.position = s; listening.note(heardNow, true, null, t1 + s); }
  heardNow.state = 'PAUSED_PLAYBACK';
  listening.note(heardNow, true, null, t1 + 120);
  heardNow.state = 'PLAYING';
  for (let s = 130; s <= 140; s += 10) { heardNow.track.position = s - 20; listening.note(heardNow, false, null, t1 + s); }
  heardNow.track.title = 'Passée';
  for (let s = 150; s <= 152; s += 1) listening.note(heardNow, true, null, t1 + s);   // too short to be kept
  heardNow.track.title = 'Autre'; heardNow.media.uri = 'x-sonosapi-stream:s1?sid=254'; heardNow.track.uri = 'x-sonosapi-stream:s1'; heardNow.track.duration = 0; heardNow.track.source = sourceOf(heardNow.media.uri);
  for (let s = 160; s <= 200; s += 20) listening.note(heardNow, false, null, t1 + s);
  const db = listening.db as Database;
  const rows = db.prepare('SELECT * FROM plays ORDER BY id').all([]);
  check(rows.length === 2 && listening.count() === 2, `two kept: ${rows.length}`);
  check(rows[0].text('title') === 'La Femme' && rows[0].text('mode') === 'spotify-sonos' && rows[0].number('screen_on') === 1, 'the first, with its mode');
  check(rows[1].text('mode') === 'radio' && rows[1].number('screen_on') === 0, `the radio: ${rows[1].text('mode')}`);
  const report = listeningReport(db, 30, 'abc');
  check(report.indexOf('Air &lt;b&gt;') >= 0 && report.indexOf('Air <b>') < 0, 'what the speakers say is escaped');
  check(report.indexOf('Spotify par les Sonos') >= 0 && report.indexOf('Radio') >= 0 && report.indexOf('<script') < 0, 'the modes, without scripts');
  check(listeningReport(db, 7, 'abc', t1 + 20 * 86400).indexOf('Rien pour cette période') >= 0, 'an empty period');
  const statsPage = new ListeningPage(listening);
  statsPage.open('127.0.0.1', 0);
  const statsBase = `http://127.0.0.1:${statsPage.port}/`;
  check((await fetch(`${statsBase}?code=faux`, { timeoutMs: 3000 })).status === 403, 'a wrong code');
  const shown = await fetch(`${statsBase}?code=${statsPage.code}&days=7`, { timeoutMs: 3000 });
  check(shown.status === 200 && (await shown.text()).indexOf('Mes écoutes') >= 0, 'the page');
  check((await fetch(`${statsBase}ecoutes.json?days=0`, { timeoutMs: 3000 })).status === 403, 'the export needs the code too');
  const exported = await fetch(`${statsBase}ecoutes.json?code=${statsPage.code}&days=0`, { timeoutMs: 3000 });
  check(exported.status === 200 && exported.headers.get('content-disposition').indexOf('attachment') >= 0, 'a file to save');
  const document = JSON.parse(await exported.text());
  check(document.count === 2 && document.plays[0].artist === 'Air <b>' && document.plays[0].mode === 'spotify-sonos' && document.plays[1].mode === 'radio', 'every listen, oldest first');
  check(JSON.parse(listeningExport(db, 7, t1 + 20 * 86400)).count === 0, 'the period is respected');
  check(report.indexOf('/ecoutes.json?code=abc&amp;days=30') >= 0, 'the button keeps the period');
  statsPage.close();
  db.close();

  // Disconnecting forgets the keys.
  again.disconnect();
  check(!again.connected() && !fs.exists(`${dir}/private/credentials.json`) && !fs.exists(`${dir}/private/session.key`), 'forgotten');

  stop(fakeBridge);
  stop(fakeLastfm);
  console.log('music airplay checks passed');
}

main().catch((error: Error) => { console.error(error.message); sys.exit(1); });
