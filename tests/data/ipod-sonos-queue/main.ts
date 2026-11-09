// The iPod app's queue on a Sonos group (examples/ipod/src/services/player.ts), headless and without its UI, against the made-up
// speaker of tests/data/sonos/stub_speaker.py (--house --transition; tests/t1/ipod_sonos_queue.sh starts it and the fake iPod of 40
// songs). Prints one line per check:
//   before      a list of 40 played from its 11th song: the group holds all 40 in order and plays its 11th
//   paged       1,100 entries (the 40 songs over and over) played from the 601st: all of them on the group, in order, the 601st playing
//   attach      a saved session's group read (attachTo) while a list is played: the list wins, the group is not taken back
//   moved       12 s into a song, the output switched to Bureau: the song goes on there (the test reads the Seek in the speaker's log)
import * as ipod from 'zinc:ipod';
import * as sonos from 'zinc:sonos';
import { env, exit } from 'zinc:sys';
import { openPod, PodLibrary } from '../../../examples/ipod/src/services/ipod';
import { findSpeakers, outputs, system, chosenGroup, songsOf } from '../../../examples/ipod/src/services/sonos';
import * as player from '../../../examples/ipod/src/services/player';

function wait(ms: number): Promise<void> { return new Promise<void>((r: () => void) => { setTimeout(r, ms); }); }

/** The group's queue once it holds `n` entries (20 s at most). */
async function queued(g: sonos.Group, n: i32): Promise<sonos.Queue> {
  let q = await system().getQueue(g, 0, 0);
  for (let i = 0; i < 200 && q.total !== n; i++) { await wait(100); q = await system().getQueue(g, 0, 0); }
  return q;
}

/** True when the group's queue is `list`, in order, and its song `number` plays. */
async function holds(lib: PodLibrary, list: ipod.Track[], number: i32): Promise<string> {
  const g = chosenGroup() as sonos.Group;
  const q = await queued(g, list.length as i32);
  const want = songsOf(lib, g, list).map((s: sonos.Song) => s.url);
  let same = q.items.length === want.length;
  for (let i = 0; same && i < want.length; i++) same = q.items[i].uri === want[i];
  await system().update(g);
  return `${same} ${q.total} ${g.track.number === number}`;
}

async function main(): Promise<void> {
  const lib = await openPod(env('SETUP_DIR') + '/Volumes/ZINCPOD');
  await findSpeakers();
  let salon = '', bureau = '';
  for (const o of outputs()) { if (o.name === 'Salon') salon = o.id; if (o.name === 'Bureau') bureau = o.id; }
  const songs = lib.tracks.slice();
  songs.sort((a: ipod.Track, b: ipod.Track) => a.title < b.title ? -1 : 1);
  const list: ipod.Track[] = [], long: ipod.Track[] = [];
  for (let i = 0; i < 40; i++) list.push(songs[i % songs.length]);
  for (let i = 0; i < 1100; i++) long.push(songs[i % songs.length]);
  await player.chooseOutput(salon);
  player.playList(lib, list, 10);
  console.log('before', await holds(lib, list, 11), player.sonosStart());
  player.playList(lib, long, 600);
  console.log('paged', await holds(lib, long, 601), player.sonosStart());
  const restored = player.attachTo(0);
  player.playList(lib, list, 5);
  console.log('attach', await restored, await holds(lib, list, 6), player.sonosStart());
  player.seek(12);
  await player.chooseOutput(bureau);
  const b = chosenGroup() as sonos.Group;   // the switch only queues the commands: Bureau's queue played and filled again tells they were sent
  for (let i = 0; i < 200; i++) {
    await system().update(b);
    if (b.media.uri === 'x-rincon-queue:RINCON_B#0' && (await system().getQueue(b, 0, 0)).total === 40) break;
    await wait(100);
  }
  console.log('moved', (chosenGroup() as sonos.Group).id === bureau, player.playError() === '' ? 'no error' : player.playError());
  exit(0);
}
main();
