// Fills the fake iPod of tests/t1/ipod_nav.sh: 40 albums of one song each (enough for the album grid to scroll), one of them with accents
// ("Élan Vital" by "Café Tacvba", for the folded search), the first five songs also in the playlist "Café mix". SETUP_DIR holds song.wav.
import * as ipod from 'zinc:ipod';
import { env } from 'zinc:sys';

async function main(): Promise<void> {
  const dir = env('SETUP_DIR');
  await ipod.open(dir + '/Volumes/ZINCPOD', true, '', 'Zinc Pod');
  const mix: ipod.TrackInput[] = [], rest: ipod.TrackInput[] = [];
  for (let i = 1; i <= 40; i++) {
    const n = i < 10 ? `0${i}` : `${i}`;
    const item: ipod.TrackInput = i === 20
      ? { file: dir + '/song.wav', title: 'Aquí', artist: 'Café Tacvba', album: 'Élan Vital', trackNr: 1, genre: 'Rock', year: 1999 }
      : { file: dir + '/song.wav', title: `Song ${n}`, artist: `Artist ${n}`, album: `Album ${n}`, trackNr: 1, genre: 'Pop', year: 2000 + i };
    if (i <= 5) mix.push(item); else rest.push(item);
  }
  const a = await ipod.addWith(mix, 'Café mix');
  const b = await ipod.addWith(rest);
  let errors = '';
  for (const r of a) errors += r.error;
  for (const r of b) errors += r.error;
  console.log(errors === '' ? `filled ${a.length + b.length}` : errors);
  await ipod.close();
}
main();
