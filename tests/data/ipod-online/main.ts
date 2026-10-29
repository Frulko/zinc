// The fake iPod and history of tests/t1/ipod_discover.sh, ipod_repair.sh and ipod_lyrics.sh (the iPod app's Discover, Repair and Lyrics),
// on $SETUP_DIR/Volumes/ZINCPOD with the files $SETUP_DIR/song-<n>.wav (each its own bytes) and $SETUP_DIR/cover.png:
//   Air / Moon Safari          two songs, no cover, no year, no genre (Repair: a cover, a year and a genre from MusicBrainz)
//   Daft Punk, Daft punk       one song each of Discovery (Repair: one spelling)
//   Justice / Cross            Genesis twice, other files (Repair: duplicates)
//   Lyric Band / Songbook      Sing Along (synced lyrics on the LRCLIB stub), Plain Song (plain lyrics)
// History (ONLINE_MODE=fill): Daft Punk 30 listens, Air 10, Justice 5 and Missing Band 8 (not on the iPod); Last.fm's similar artists:
// daft punk -> justice .9, cassius .8, stardust .6; air -> phoenix .7, cassius .5. So Discover lists Cassius (30*.8 + 10*.5), Stardust,
// Phoenix, and Missing Band in "not on this iPod". The config has the stub's Last.fm key.
// ONLINE_MODE=read prints each song: title | artist | album artist | year | genre | cover | lyrics flag (| the lyrics in its file, lines joined by /).
// ONLINE_MODE=lyrics: zinc:ipod's writeLyrics, see below.
import * as ipod from 'zinc:ipod';
import * as fs from 'zinc:fs';
import { env } from 'zinc:sys';
import { History, Listen, LibTrack } from '../../../examples/ipod/src/services/history';

const GUID = '000A27001234ABCD';

async function main(): Promise<void> {
  const dir = env('SETUP_DIR'), mp = dir + '/Volumes/ZINCPOD', backups = env('ZINC_IPOD_BACKUPS');
  if (env('ONLINE_MODE') === 'lyrics') {   // zinc:ipod's writeLyrics into $SETUP_DIR/lyric.mp3 and lyric.m4a once added, read back after a reopen
    await ipod.open(mp);
    const r = await ipod.addWith([{ file: `${dir}/lyric.mp3`, title: 'Mp3 Lyric', artist: 'Lyric Band' }, { file: `${dir}/lyric.m4a`, title: 'M4a Lyric', artist: 'Lyric Band' }]);
    for (const x of r) { if (x.error !== '') { console.log(x.error); return; } await ipod.writeLyrics(x.id, `Words of ${x.id === r[0].id ? 'mp3' : 'm4a'}\nSecond line é`); }
    await ipod.save();
    await ipod.close();
    await ipod.open(mp);
    for (const t of await ipod.tracks()) if (t.title.endsWith(' Lyric')) {
      const text = await ipod.readLyrics(t.id);
      console.log(`${t.title} | ${t.lyrics} | ${text.split('\n').join('/')} | ${t.path.slice(t.path.lastIndexOf('.'))}`);
    }
    await ipod.close();
    return;
  }
  if (env('ONLINE_MODE') === 'read') {
    await ipod.open(mp);
    const ts = await ipod.tracks();
    ts.sort((a: ipod.Track, b: ipod.Track) => a.title < b.title ? -1 : a.title > b.title ? 1 : a.id < b.id ? -1 : 1);
    for (const t of ts) {
      let words = '';
      if (t.lyrics) words = ` | ${(await ipod.readLyrics(t.id)).trim().split('\n').join('/')}`;
      console.log(`${t.title} | ${t.artist} | ${t.albumArtist} | ${t.year} | ${t.genre} | ${t.artwork} | ${t.lyrics}${words}`);
    }
    await ipod.close();
    return;
  }
  await ipod.open(mp, true, '', 'Zinc Pod');
  const cover = dir + '/cover.png';
  let n = 0;
  const song = (title: string, artist: string, album: string, nr: i32, year: i32, genre: string, art: boolean): ipod.TrackInput => {
    n++;
    const x: ipod.TrackInput = { file: `${dir}/song-${n}.wav`, title: title, artist: artist, album: album, trackNr: nr, year: year, genre: genre };
    if (art) x.artworkFile = cover;
    return x;
  };
  const r = await ipod.addWith([
    song("La Femme d'Argent", 'Air', 'Moon Safari', 1, 0, '', false), song('Sexy Boy', 'Air', 'Moon Safari', 2, 0, '', false),
    song('One More Time', 'Daft Punk', 'Discovery', 1, 2001, 'Electronic', true), song('Aerodynamic', 'Daft punk', 'Discovery', 2, 2001, 'Electronic', true),
    song('Genesis', 'Justice', 'Cross', 1, 2007, 'Electronic', true), song('Genesis', 'Justice', 'Cross', 1, 2007, 'Electronic', true),
    song('Sing Along', 'Lyric Band', 'Songbook', 1, 2020, 'Pop', true), song('Plain Song', 'Lyric Band', 'Songbook', 2, 2020, 'Pop', true)]);
  let bad = '';
  for (const x of r) bad += x.error;
  const tracks = await ipod.tracks();
  await ipod.close();
  if (bad !== '') { console.log(bad); return; }
  const h = new History(`${backups}/history/history.sqlite`);
  let ts: number = 1780000000;
  const listen = (artist: string, title: string, times: i32): void => {
    for (let k = 0; k < times; k++) { const l = new Listen(); l.ts = ts; ts += 600; l.artist = artist; l.title = title; l.durationMs = 200000; l.source = 'lastfm'; h.add(l); }
  };
  h.db.transaction(() => { listen('Daft Punk', 'One More Time', 30); listen('Air', 'Sexy Boy', 10); listen('Justice', 'Genesis', 5); listen('Missing Band', 'Gone Song', 8); });
  const lib: LibTrack[] = [];
  for (const t of tracks) lib.push({ id: t.id, artist: t.artist, albumArtist: t.albumArtist, title: t.title, album: t.album, mbid: '' });
  h.match(GUID, lib, 'm1');
  h.close();
  const at = Math.floor(Date.now() / 1000);
  fs.writeText(`${backups}/history/similar-artists.jsonl`,
    JSON.stringify({ artist: 'daft punk', at: at, similar: [{ artist: 'justice', match: 0.9 }, { artist: 'cassius', match: 0.8 }, { artist: 'stardust', match: 0.6 }] }) + '\n' +
    JSON.stringify({ artist: 'air', at: at, similar: [{ artist: 'phoenix', match: 0.7 }, { artist: 'cassius', match: 0.5 }] }) + '\n');
  fs.writeText(`${backups}/config.json`, JSON.stringify({ lastfmKey: 'apikey' }) + '\n');
  console.log(`filled ${tracks.length}`);
}
main();
