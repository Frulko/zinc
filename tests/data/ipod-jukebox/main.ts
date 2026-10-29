// The iPod app's jukebox source (examples/ipod/src/services/jukebox.ts) against tests/data/ipod-jukebox/stub.py (JUKEBOX_URL) on the
// fake iPod of tests/t1/ipod_jukebox.sh (POD): connect and Test connection, browse and search, an album added (one song converted
// by a jukebox job) with its tags and cover, a playlist whose download is cut (no playlist yet), the same playlist again (the cut
// song resumed, the playlist made), and a Subsonic server (/navi) browsed with a song converted while sent.
import * as ipod from 'zinc:ipod';
import { env } from 'zinc:sys';
import * as jb from '../../../examples/ipod/src/services/jukebox';
import { openPod, readLibrary, closePod } from '../../../examples/ipod/src/services/ipod';

function names(es: jb.Entry[]): string { return es.map((e: jb.Entry) => `${e.name}(${e.sub})`).join(', '); }
function quiet(t: string): void { console.error(t); }
function step(done: i32, total: i32, detail: string): void { console.error(`${done}/${total} ${detail}`); }

async function tracks(): Promise<ipod.Track[]> { return (await readLibrary()).tracks; }

async function main(): Promise<void> {
  const url = env('JUKEBOX_URL');
  jb.setSlice(65536);
  jb.setPollMs(10);
  let refused = '';
  try { await jb.describe(await jb.connect(url, 'wrong')); } catch (e) { refused = (e as Error).message; }
  console.log('refused', refused);
  const s = await jb.connect(url, 'jbtoken');
  console.log('connect', s.subsonic, await jb.describe(s));
  const artists = await jb.artists(s);
  console.log('artists', names(artists));
  const albums = await jb.albums(s, artists[0]);
  console.log('albums', names(albums));
  const lists = await jb.playlists(s);
  console.log('playlists', names(lists));
  console.log('search', (await jb.search(s, 'tunn')).map((x: jb.Song) => x.title).join(','));

  await openPod(env('POD'));
  const album = await jb.songsOf(s, albums[0]);
  let r = await jb.addSongs(s, album, '', await tracks(), quiet, step);
  console.log('album', r.added, r.kept, r.failed.length, `[${r.playlist}]`, r.failed.join(' | '));
  for (const t of await tracks()) console.log('track', t.title, t.artist, t.album, t.genre, t.composer, t.comment, t.grouping, t.trackNr, t.tracks,
    t.cdNr, t.year, t.rating, t.bpm, t.artwork, t.path.slice(t.path.lastIndexOf('.')));

  const road = await jb.songsOf(s, lists[0]);
  r = await jb.addSongs(s, road, 'Road Trip', await tracks(), quiet, step);
  console.log('cut', r.added, r.kept, r.failed.length, `[${r.playlist}]`, r.failed.join(' | '));
  r = await jb.addSongs(s, road, 'Road Trip', await tracks(), quiet, step);
  console.log('resumed', r.added, r.kept, r.failed.length, `[${r.playlist}]`, r.failed.join(' | '));
  const all = await tracks();
  for (const p of (await readLibrary()).playlists) if (p.name === 'Road Trip') {
    console.log('playlist', p.trackIds.map((id: string) => { for (const t of all) if (t.id === id) return t.title; return '?'; }).join(','));
  }

  const n = await jb.connect(`${url}/navi`, 'ann:sesame');
  console.log('subsonic', n.subsonic, await jb.describe(n));
  const na = await jb.artists(n);
  const nalb = await jb.albums(n, na[1]);
  console.log('subsonic albums', names(nalb), names(await jb.playlists(n)), (await jb.search(n, 'enc')).map((x: jb.Song) => x.title).join(','));
  const big = await jb.songsOf(n, nalb[0]);
  r = await jb.addSongs(n, big, '', await tracks(), quiet, step);
  console.log('subsonic add', r.added, r.kept, r.failed.length);
  for (const t of await tracks()) if (t.title === 'Encore') console.log('encore', t.artist, t.album, t.trackNr, t.year, t.artwork, t.path.slice(t.path.lastIndexOf('.')));
  await closePod();
}
main().catch((e: Error) => { console.log('error', e.message); });
