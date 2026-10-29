// The fake iPod of tests/t1/ipod_smart.sh. MODE=fill: twelve songs by three artists (Rock, Jazz, Pop), ratings, plays and tempos, a
// podcast, a normal playlist "Road trip" and a smart playlist "Grouped" on grouping (a field the app's editor does not offer: its rules
// cannot be edited there). MODE=check: each playlist as the database holds it (name, smart, rules in words, its songs' titles) and,
// for a smart one, whether its members are what evaluateSmart gives (`same`). SETUP_DIR holds song.wav and the Volumes folder.
import * as ipod from 'zinc:ipod';
import { env } from 'zinc:sys';

const ARTISTS: string[] = ['Alpha', 'Bravo', 'Charlie'];
const GENRES: string[] = ['Rock', 'Jazz', 'Pop'];

async function fill(dir: string): Promise<void> {
  const items: ipod.TrackInput[] = [];
  for (let i = 0; i < 12; i++) {
    const a = i % 3;
    items.push({ file: dir + '/song.wav', title: `${ARTISTS[a]} ${Math.floor(i / 3) + 1}`, artist: ARTISTS[a], album: `${ARTISTS[a]} Album`,
      genre: GENRES[a], trackNr: Math.floor(i / 3) + 1, year: 1990 + i, rating: i % 6, bpm: 112 + i * 2 });
  }
  items.push({ file: dir + '/song.wav', title: 'Talk 1', artist: 'Alpha', album: 'Alpha Talks', genre: 'Rock', mediaType: 'podcast', rating: 5 });
  const added = await ipod.addWith(items);
  let errors = '';
  for (const r of added) errors += r.error;
  const plays: ipod.Play[] = [];
  for (let i = 0; i < 12; i++) if (i % 4 !== 0) plays.push({ id: added[i].id, count: i, at: 1700000000 + i * 86400 });
  await ipod.played(plays);
  const road = await ipod.createPlaylist('Road trip');
  await ipod.setPlaylistTracks(road, [added[0].id, added[1].id, added[2].id]);
  await ipod.createSmartPlaylist('Grouped', { match: 'all', rules: [{ field: 'grouping', action: 'contains', text: 'live', value: 0, value2: 0, units: '' }],
    limit: { type: 'none', value: 0, sort: '' }, liveUpdate: true, checkedOnly: false, refreshable: true });
  await ipod.save();
  console.log(errors === '' ? `filled ${added.length}` : errors);
}

async function check(): Promise<void> {
  const tracks = await ipod.tracks(), lists = await ipod.playlists();
  // the rules the session's editor shows at frame 230 (before the edit): the count its preview must say
  const shown: ipod.SmartRules = { match: 'any', rules: [{ field: 'genre', action: 'contains', text: 'Rock', value: 0, value2: 0, units: '' },
    { field: 'rating', action: 'greaterThan', text: '', value: 3, value2: 0, units: '' }], limit: { type: 'songs', value: 3, sort: 'highestRating' },
    liveUpdate: true, checkedOnly: false, refreshable: true };
  const unlimited: ipod.SmartRules = { match: shown.match, rules: shown.rules, limit: { type: 'none', value: 0, sort: '' }, liveUpdate: true, checkedOnly: false, refreshable: true };
  console.log(`preview ${ipod.evaluateSmart(shown, tracks, lists).length} of ${ipod.evaluateSmart(unlimited, tracks, lists).length}`);
  const title = new Map<string, string>();
  for (const t of tracks) title.set(t.id, t.title);
  for (const p of lists) {
    if (p.master) continue;
    const names = p.trackIds.map((id: string) => title.get(id) as string).join(', ');
    if (!p.smart) { console.log(`playlist ${p.name}: ${names !== '' ? names : '(empty)'}`); continue; }
    const same = ipod.evaluateSmart(p.rules, tracks, lists).join(',') === p.trackIds.join(',');
    console.log(`smart ${p.name}: ${ipod.describeSmart(p.rules, lists)} | ${names} | same ${same}`);
  }
}

async function main(): Promise<void> {
  const dir = env('SETUP_DIR');
  await ipod.open(dir + '/Volumes/ZINCPOD', env('MODE') === 'fill', '', 'Zinc Pod');
  if (env('MODE') === 'fill') await fill(dir); else await check();
  await ipod.close();
}
main();
