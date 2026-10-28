// Fills the fake iPod of tests/t1/ipod_demo.sh (IPOD_MOUNT; ZINC_IPOD_ROOTS points at its parent): a database named
// "Zinc Pod", nine tracks in three albums (two with a cover, IPOD_COVER_A and IPOD_COVER_B, one without), a podcast, and the
// playlist "Road trip".
import * as ipod from 'zinc:ipod';
import * as sys from 'zinc:sys';

async function main(): Promise<void> {
  const song = sys.env('IPOD_SONG'), coverA = sys.env('IPOD_COVER_A'), coverB = sys.env('IPOD_COVER_B');
  await ipod.open(sys.env('IPOD_MOUNT'), true, '', 'Zinc Pod');
  const items: ipod.TrackInput[] = [];
  const a = ['Blue Hour', 'Neon Rain', 'Glass Harbour', 'Night Bus'];
  for (let i = 0; i < a.length; i++) items.push({ file: song, title: a[i], artist: 'Lumen', album: 'Afterglow', genre: 'Electronic', trackNr: i + 1, tracks: a.length, year: 2019, artworkFile: coverA });
  const b = ['Copper Fields', 'Slow River', 'Old Pine'];
  for (let i = 0; i < b.length; i++) items.push({ file: song, title: b[i], artist: 'The Marsh', album: 'Lowlands', genre: 'Folk', trackNr: i + 1, tracks: b.length, year: 2004, rating: 4, artworkFile: coverB });
  items.push({ file: song, title: 'Field Recording', artist: 'Anon', album: 'Untitled Tapes', genre: 'Ambient', trackNr: 1, year: 1998 });
  items.push({ file: song, title: 'Episode 12', artist: 'Zinc Radio', album: 'Zinc Radio', mediaType: 'podcast' });
  const res = await ipod.addWith(items, 'Road trip');
  let ok = 0;
  for (const r of res) {
    if (r.error === '') ok++;
    else console.log(r.file, r.error);
  }
  console.log('filled', ok);
  await ipod.close();
}
main();
