// Fills the fake iPod of tests/t1/ipod_demo.sh (IPOD_MOUNT; ZINC_IPOD_ROOTS points at its parent): a database named
// "Zinc Pod", nine tracks in three albums (two with a cover, IPOD_COVER_A and IPOD_COVER_B, one without; one tone each, IPOD_TONES),
// a podcast, and the playlist "Road trip"; then the duplicates of the Optimise page: two songs again from the same file with fewer
// tags, and one melody (IPOD_MELODY) as a WAV and as an AAC with other tags (only the sound matches).
import * as ipod from 'zinc:ipod';
import * as sys from 'zinc:sys';

async function main(): Promise<void> {
  const tones = sys.env('IPOD_TONES'), melody = sys.env('IPOD_MELODY'), coverA = sys.env('IPOD_COVER_A'), coverB = sys.env('IPOD_COVER_B');
  await ipod.open(sys.env('IPOD_MOUNT'), true, '', 'Zinc Pod');
  const items: ipod.TrackInput[] = [];
  const tone = (): string => `${tones}/tone-${items.length + 1}.wav`;
  const a = ['Blue Hour', 'Neon Rain', 'Glass Harbour', 'Night Bus'];
  for (let i = 0; i < a.length; i++) items.push({ file: tone(), title: a[i], artist: 'Lumen', album: 'Afterglow', genre: 'Electronic', trackNr: i + 1, tracks: a.length, year: 2019, artworkFile: coverA });
  const b = ['Copper Fields', 'Slow River', 'Old Pine'];
  for (let i = 0; i < b.length; i++) items.push({ file: tone(), title: b[i], artist: 'The Marsh', album: 'Lowlands', genre: 'Folk', trackNr: i + 1, tracks: b.length, year: 2004, rating: 4, artworkFile: coverB });
  items.push({ file: tone(), title: 'Field Recording', artist: 'Anon', album: 'Untitled Tapes', genre: 'Ambient', trackNr: 1, year: 1998 });
  items.push({ file: tone(), title: 'Episode 12', artist: 'Zinc Radio', album: 'Zinc Radio', mediaType: 'podcast' });
  items.push({ file: `${tones}/tone-5.wav`, title: 'Copper fields', artist: 'The Marsh', album: 'Lowlands', rating: 5 });
  items.push({ file: `${tones}/tone-8.wav`, title: 'field recording', artist: 'Anon', album: 'Untitled Tapes' });
  items.push({ file: melody, title: 'Morning Light', artist: 'Lumen', album: 'Singles', genre: 'Electronic', year: 2021 });
  items.push({ file: sys.env('IPOD_MELODY_AAC'), title: 'Track 01', artist: 'Unknown' });
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
