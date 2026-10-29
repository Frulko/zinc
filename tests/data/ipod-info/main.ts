// tests/t1/ipod_info.sh: INFO_MODE=fill puts three songs on the fake iPod at $SETUP_DIR/Volumes/ZINCPOD (one album, other comments and
// years, no grouping); INFO_MODE=read prints each song's fields the Info window can change, from the iPod's database.
import * as ipod from 'zinc:ipod';
import { env } from 'zinc:sys';

async function main(): Promise<void> {
  const dir = env('SETUP_DIR');
  const mp = dir + '/Volumes/ZINCPOD';
  if (env('INFO_MODE') === 'fill') {
    await ipod.open(mp, true, '', 'Zinc Pod');
    const song = dir + '/song.wav';
    const r = await ipod.addWith([
      { file: song, title: 'Alpha', artist: 'Band', album: 'First', trackNr: 1, genre: 'Rock', year: 2001, comment: 'one' },
      { file: song, title: 'Beta', artist: 'Band', album: 'First', trackNr: 2, genre: 'Rock', year: 2002, comment: 'two' },
      { file: song, title: 'Gamma', artist: 'Band', album: 'First', trackNr: 3, genre: 'Rock', year: 2003, comment: 'three' }]);
    let bad = '';
    for (const x of r) bad += x.error;
    console.log(bad === '' ? 'filled 3' : bad);
  } else {
    await ipod.open(mp);
    const ts = await ipod.tracks();
    ts.sort((a: ipod.Track, b: ipod.Track) => a.trackNr - b.trackNr);
    for (const t of ts) console.log(t.title, `[${t.grouping}]`, t.genre, t.year, t.comment, t.rating, t.compilation);
  }
  await ipod.close();
}
main();
