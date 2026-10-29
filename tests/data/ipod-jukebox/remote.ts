// tests/t1/ipod_jukebox.sh: the album of tests/data/ipod-jukebox/stub.py added to a remote iPod (the daemon at REMOTE, token secret):
// uploaded by /api/add, its tags written by /api/update.
import * as ipod from 'zinc:ipod';
import { env } from 'zinc:sys';
import * as jb from '../../../examples/ipod/src/services/jukebox';
import { openRemote, readLibrary } from '../../../examples/ipod/src/services/ipod';

async function main(): Promise<void> {
  jb.setPollMs(10);
  const s = await jb.connect(env('JUKEBOX_URL'), 'jbtoken');
  const album = (await jb.albums(s, (await jb.artists(s))[0]))[0];
  await openRemote(env('REMOTE'), 'secret');
  const r = await jb.addSongs(s, await jb.songsOf(s, album), '', (await readLibrary()).tracks, (t: string) => { console.error(t); },
    (d: i32, n: i32, t: string) => { console.error(t); });
  console.log('remote', r.added, r.kept, r.failed.length, r.failed.join(' | '));
  for (const t of (await readLibrary()).tracks) console.log('remote', t.title, t.artist, t.album, t.composer, t.comment, t.trackNr, t.year, t.rating, t.bpm,
    t.path.slice(t.path.lastIndexOf('.')));
}
main().catch((e: Error) => { console.log('error', e.message); });
