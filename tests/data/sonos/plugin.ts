// tests/t1/sonos_plugin.sh: zinc:sonos against tests/data/sonos/stub_speaker.py (SONOS_STUB=127.0.0.1:<port>). Prints one line per check;
// the test compares them with plugin.expected and reads the speaker's log for the SOAP arguments sent.
import { discover, Group, Speaker, Song, UpnpError, musicTrackMeta } from 'zinc:sonos';
import { parse, toXml } from 'zinc:xml';
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

async function main(): Promise<void> {
  await batch1();
}
main().catch((e: Error) => console.log('error ' + e.message));
