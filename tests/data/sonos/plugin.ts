// tests/t1/sonos_plugin.sh: zinc:sonos against tests/data/sonos/stub_speaker.py (SONOS_STUB=127.0.0.1:<port>). Prints one line per check;
// the test compares them with plugin.expected and reads the speaker's log for the SOAP arguments sent.
import { discover, Group, Speaker, Song, UpnpError, musicTrackMeta, Events, Event, Subscription, soap, localAddressFor, Queue, QueueItem, SonosPlaylist } from 'zinc:sonos';
import { serveAsync, stop, Request, Reply } from 'zinc:net';
import { parse, toXml, escapeXml } from 'zinc:xml';
import { env } from 'zinc:sys';

function song(n: i32): Song {
  const s = new Song();
  s.url = `http://127.0.0.1:9/song${n}.mp3`; s.title = `Song ${n}`; s.artist = 'Band & Co'; s.album = 'First'; s.mime = 'audio/mpeg'; s.duration = 200;
  return s;
}

async function batch1(): Promise<void> {
  // the element tree: attributes in both quotes, entities, CDATA, a self-closed element, a prefixed name found by its local name
  const doc = parse(`<?xml version="1.0"?><!-- c --><a x='1' y="&lt;b&gt;"><dc:title>T &amp; U &#233;&#x263A;</dc:title><e/><f><![CDATA[<raw>]]></f></a>`);
  console.log(`xml ${doc.name} ${doc.attr('x')} ${doc.attr('y')} ${doc.textOf('title')} ${doc.children.length} ${(doc.child('f') as any).text} ${toXml(doc.child('e') as any)}`);

  const sys = await discover(env('SONOS_STUB'));
  console.log(`rooms ${sys.speakers.map((s: Speaker) => s.name + (s.address() === env('SONOS_STUB') ? '@stub' : '@' + s.address())).join(',')} hidden ${sys.allSpeakers.length - sys.speakers.length} groups ${sys.groups.map((g: Group) => g.name()).join(',')}`);
  const salon = sys.speakerByName('Salon') as Speaker;
  const g = sys.groupOf(salon) as Group;
  await sys.clearQueue(g);
  const first = await sys.addUriToQueue(g, song(1).url, musicTrackMeta(song(1)));
  const second = await sys.addUriToQueue(g, song(2).url, musicTrackMeta(song(2)));
  await sys.playFromQueue(g, 0);
  await sys.update(g);
  console.log(`queue ${first} ${second} ${g.state} ${g.track.number}/${g.track.count} ${g.track.title} - ${g.track.artist} ${g.track.source} ${g.media.nrTracks} ${g.status} ${g.track.metadata !== ''}`);
  await sys.next(g);
  try { await sys.next(g); console.log('next: no fault'); }
  catch (e) {
    if (e instanceof UpnpError) { const u = e as UpnpError; console.log(`fault ${u.code} ${u.status} ${u.action} ${u.description} | ${u.message}`); }
    else console.log('fault not a UpnpError: ' + (e as Error).message);
  }
  await sys.stop(g);
  await sys.update(g);
  await sys.setShuffle(g, true);
  const m1 = g.playMode;
  await sys.setRepeat(g, 'all');
  console.log(`mode ${m1} ${g.playMode} ${g.shuffle()} ${g.repeat()}`);
  await sys.setCrossFade(g, true);
  await sys.setGroupMute(g, true);
  console.log(`fade ${await sys.getCrossFade(g)} mute ${await sys.getGroupMute(g)} volume ${await sys.setRelativeGroupVolume(g, 5)}`);
  await sys.endDirectControlSession(g);
  await sys.playUri(g, 'http://radio.example/live.mp3', '', 'Radio X', true, true);
  await sys.update(g);
  console.log(`radio ${g.track.source} ${g.track.title} ${g.isPlayingRadio()} ${g.state}`);
  await sys.partyMode(salon);
}

function sleep(ms: i32): Promise<boolean> { return new Promise<boolean>((done) => { setTimeout(() => done(true), ms); }); }
async function until(f: () => boolean, ms: i32 = 4000): Promise<boolean> {
  for (let waited = 0; waited < ms; waited += 50) { if (f()) return true; await sleep(50); }
  return f();
}

// Events: the program's own server hands each request to handleNotify; the stub speaker sends the state at once, then each change.
async function batch2(): Promise<void> {
  const stub = env('SONOS_STUB');
  const sys = await discover(stub);
  const g = sys.groupOf(sys.speakerByName('Salon') as Speaker) as Group;
  let events: Events | null = null;
  const port = serveAsync(0, async (req: Request): Promise<Reply> => {
    const r = (events as Events).handleNotify(req);
    return r !== null ? r as Reply : { status: 404, body: 'not an event', contentType: 'text/plain' };
  });
  const ev = new Events(sys, port);
  events = ev;
  const seen: string[] = [];
  let changes = 0;
  ev.onChange((grp: Group | null, e: Event) => { changes++; if (seen.indexOf(e.service) < 0) seen.push(e.service); });
  sys.allSpeakers = [];   // the topology event fills it again
  console.log(`callback address ${localAddressFor('127.0.0.1')}`);
  await ev.watch(g, 2);   // two seconds: renewed after 1.7 s
  await until(() => seen.length >= 4);
  const services = ['AVTransport', 'GroupRenderingControl', 'RenderingControl', 'ZoneGroupTopology'].filter((s: string) => seen.indexOf(s) >= 0);
  console.log(`subscribed ${ev.subs.map((s: Subscription) => s.service).join(',')} events ${services.join(',')} rooms ${sys.allSpeakers.length}`);
  // changes made by another app reach the objects with no poll
  const a = (sys.speakerByName('Salon') as Speaker).address();
  await soap(a, 'GroupRenderingControl', '/MediaRenderer/GroupRenderingControl/Control', 'SetGroupVolume', '<InstanceID>0</InstanceID><DesiredVolume>44</DesiredVolume>');
  await soap(a, 'RenderingControl', '/MediaRenderer/RenderingControl/Control', 'SetVolume', '<InstanceID>0</InstanceID><Channel>Master</Channel><DesiredVolume>12</DesiredVolume>');
  await sleep(300);   // the first events (the whole state) are in
  g.queueUpdateId = 0;
  await soap(a, 'AVTransport', '/MediaRenderer/AVTransport/Control', 'RemoveAllTracksFromQueue', '<InstanceID>0</InstanceID>');
  await soap(a, 'AVTransport', '/MediaRenderer/AVTransport/Control', 'AddURIToQueue', `<InstanceID>0</InstanceID><EnqueuedURI>${song(3).url}</EnqueuedURI><EnqueuedURIMetaData>${escapeXml(musicTrackMeta(song(3)))}</EnqueuedURIMetaData><DesiredFirstTrackNumberEnqueued>0</DesiredFirstTrackNumberEnqueued><EnqueueAsNext>0</EnqueueAsNext>`);
  await soap(a, 'AVTransport', '/MediaRenderer/AVTransport/Control', 'SetAVTransportURI', '<InstanceID>0</InstanceID><CurrentURI>x-rincon-queue:RINCON_A#0</CurrentURI><CurrentURIMetaData></CurrentURIMetaData>');
  await soap(a, 'AVTransport', '/MediaRenderer/AVTransport/Control', 'Pause', '<InstanceID>0</InstanceID>');
  const ok = await until(() => g.volume === 44 && (sys.speakerByName('Salon') as Speaker).volume === 12 && g.state === 'PAUSED_PLAYBACK' && g.track.title === 'Song 3');
  await sleep(300);   // the queue's ContentDirectory event (ContainerUpdateIDs) of the change made by another app
  const viaEvent = g.queueUpdateId;
  console.log(`queue event ${viaEvent > 0 && viaEvent === (await sys.getQueue(g, 0, 1)).updateId}`);
  console.log(`events ${ok} group ${g.volume} room ${(sys.speakerByName('Salon') as Speaker).volume} ${g.state} ${g.track.number}/${g.track.count} ${g.track.title} - ${g.track.artist} ${g.track.duration} ${g.track.source} ${g.playMode} ${g.can('Seek')}`);
  // a NOTIFY the program did not subscribe to is refused; another request is left to the program
  const bad = await fetch(`http://127.0.0.1:${port}/sonos-events`, { method: 'NOTIFY', body: '<e:propertyset/>', headers: [['SID', 'uuid:nobody'], ['NT', 'upnp:event'], ['NTS', 'upnp:propchange']] });
  const other = await fetch(`http://127.0.0.1:${port}/song`);
  console.log(`unknown sid ${bad.status} other ${other.status}`);
  await sleep(2000);   // the renewals
  const before = ev.subs.length;
  await ev.close();
  console.log(`closed ${before} -> ${ev.subs.length} changes>0 ${changes > 0}`);
  stop();
}

function titles(q: Queue): string { return q.items.map((it: QueueItem) => it.title.replace('Song ', '')).join(','); }

// The queue and the Sonos playlists (study batch 2): numbers count from 1, getQueue's start from 0 (SoCo).
async function batch3(): Promise<void> {
  const sys = await discover(env('SONOS_STUB'));
  const g = sys.groupOf(sys.speakerByName('Salon') as Speaker) as Group;
  await sys.clearQueue(g);
  const uris: string[] = [], metas: string[] = [];
  for (let i: i32 = 1; i <= 20; i++) { uris.push(song(i).url); metas.push(musicTrackMeta(song(i))); }
  const first = await sys.addMultipleUrisToQueue(g, uris, metas);
  const page = await sys.getQueue(g, 15, 3);
  console.log(`multiple ${first} size ${await sys.queueSize(g)} page ${titles(page)} of ${page.total} ${page.items[0].id} ${page.items[0].artist} ${page.items[0].album} ${page.items[0].itemClass} ${page.items[0].uri}`);
  await sys.playFromQueue(g, 2);
  const next = await sys.addMultipleUrisToQueue(g, [song(21).url, song(22).url], [musicTrackMeta(song(21)), musicTrackMeta(song(22))], 0, true);
  await sys.removeFromQueue(g, 1);
  await sys.removeRangeFromQueue(g, 5, 2);
  await sys.moveInQueue(g, 1, 3);
  await sys.reorderTracksInQueue(g, 4, 2, 1);
  const all = await sys.getQueue(g, 0, 0);
  await sys.update(g);
  console.log(`edited next ${next} ${titles(all)} total ${all.total} playing ${g.track.number} ${g.track.title} update ${g.queueUpdateId === all.updateId && all.updateId > 0}`);
  const mix = await sys.createSonosPlaylist('Mix & Co');
  for (let i: i32 = 1; i <= 3; i++) await sys.addItemToSonosPlaylist(mix, song(i).url, musicTrackMeta(song(i)));
  await sys.moveInSonosPlaylist(mix, 3, 1);
  await sys.removeFromSonosPlaylist(mix, 2);
  const saved = await sys.createSonosPlaylistFromQueue(g, 'Saved');
  const savedSize = (await sys.sonosPlaylistTracks(saved)).total;
  await sys.clearSonosPlaylist(saved);
  const found = await sys.getSonosPlaylistByTitle('Mix & Co');
  console.log(`playlists ${(await sys.getSonosPlaylists()).map((p: SonosPlaylist) => p.id + ' ' + p.title).join(', ')} mix ${titles(await sys.sonosPlaylistTracks(mix))} ${mix.uri} found ${found !== null && (found as SonosPlaylist).uri === mix.uri} saved ${savedSize} then ${(await sys.sonosPlaylistTracks(saved)).total}`);
  await sys.playSonosPlaylist(g, mix);
  await sys.removeSonosPlaylist(saved);
  console.log(`after ${(await sys.getSonosPlaylists()).length} queue ${(await sys.getQueue(g)).items[0].uri}`);
}

async function main(): Promise<void> {
  await batch1();
  await batch3();
  await batch2();
}
main().catch((e: Error) => console.log('error ' + e.message));
