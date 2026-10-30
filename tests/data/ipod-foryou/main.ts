// The For you page of the iPod app (examples/ipod/src/services/forYou.ts) on a fake iPod (tests/t1/ipod_foryou.sh makes it) and a generated
// history over three years whose shelves are known, at a fixed now (NOW, 2026-06-15 12:00 UTC):
//   Rock, Jazz, Electro One..Four   three songs each (one album per artist), heard in sessions of one group every 3 days until a month ago
//   Old Flame                        6 songs heard 10 times each 13 months ago, never since: Repeat Rewind
//   Capsule Band                     6 songs heard 5 times each in October 2023, never since: Time Capsule (2023)
//   Repeat Act                       one album of 3 songs, heard whole 7 times in the last 25 days: On Repeat, Jump back in, Because...
//   Jazz Two's album heard whole 2 days ago, 4 songs of the playlist "Road Trip" (Electro, 4 albums) yesterday: Jump back in
//   Hidden Gem, Deep Cut, Lost Track two songs each never heard (Rock, Jazz, Electronic) and a third Hidden Gem song rated 1 star: Rediscover
//   Ghost Artist                     5 listens 6 days ago of songs not on the iPod: in the month's top artists, not on this iPod
// Without FORYOU_MODE it makes all that, then prints the shelves (names only: the ids are new on each fake iPod); =fill only makes it; =pod
// only the songs (no history); =add adds listens to the history (FORYOU_ADD=gem: 3 of Hidden Gem Song 1 an hour ago; =ghost: 3,000 of songs
// not on the iPod); =bench measures 10,000 songs and 100,000 listens (each step's time and longest slice; GENIUS_DIR
// holds bench.sqlite and an optional similar-artists.jsonl); =big puts that library and history on the fake iPod, to time the app on it. FORYOU_COVERS: a folder of <Artist-Name>.png covers.
import * as ipod from 'zinc:ipod';
import { env } from 'zinc:sys';
import { History, Listen, LibTrack } from '../../../examples/ipod/src/services/history';
import { loadWeights, readArtistGraph, buildModel, mixes, genius, Model } from '../../../examples/ipod/src/services/genius';
import { MOODS, moodMix } from '../../../examples/ipod/src/services/moods';
import { Budget } from '../../../examples/ipod/src/services/slice';
import * as fy from '../../../examples/ipod/src/services/forYou';

const GUID = '000A27001234ABCD';
const NOW: number = 1781524800;
const DAY: number = 86400;
const NUM: string[] = ['One', 'Two', 'Three', 'Four'];

let seed: number = 11;
function rnd(n: i32): i32 { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor(seed / 2147483648 * n) as i32; }

function libTracks(ts: ipod.Track[]): LibTrack[] {
  const out: LibTrack[] = [];
  for (const t of ts) out.push({ id: t.id, artist: t.artist, albumArtist: t.albumArtist, title: t.title, album: t.album, mbid: '' });
  return out;
}

function listen(h: History, t: ipod.Track | null, ts: number, artist: string = '', title: string = ''): void {
  const l = new Listen();
  l.ts = ts; l.durationMs = 200000; l.source = 'lastfm';
  if (t !== null) { l.artist = (t as ipod.Track).artist; l.title = (t as ipod.Track).title; l.album = (t as ipod.Track).album; }
  else { l.artist = artist; l.title = title; }
  h.add(l);
}

async function main(): Promise<void> {
  const mode = env('FORYOU_MODE');
  if (mode === 'bench') { await bench(); return; }
  const db = `${env('ZINC_IPOD_BACKUPS')}/history/history.sqlite`;
  let pod: ipod.Device | null = null;
  for (const p of await ipod.detect()) if (p.mountpoint.endsWith('/ZINCPOD')) pod = p;
  if (pod === null) { console.log('no fake iPod'); return; }
  if (mode === 'big') { await big((pod as ipod.Device).mountpoint, db); return; }
  if (mode === 'add') {
    await ipod.open((pod as ipod.Device).mountpoint);
    const tracks = await ipod.tracks();
    await ipod.close();
    const h = new History(db);
    h.db.transaction(() => {
      if (env('FORYOU_ADD') === 'gem') { for (const t of tracks) if (t.title === 'Hidden Gem Song 1') for (let k = 0; k < 3; k++) listen(h, t, NOW - 3600 + k * 300); }
      else for (let k = 0; k < 3000; k++) listen(h, null, NOW - 40 * DAY + k * 600, `Ghost ${k % 7}`, `Ghost Song ${k}`);
    });
    h.match(GUID, libTracks(tracks), 'm1');
    h.close();
    console.log('added');
    return;
  }
  await ipod.open((pod as ipod.Device).mountpoint, true, '', 'Zinc Pod');
  const items: ipod.TrackInput[] = [];
  const song = env('IPOD_SONG');
  const covers = env('FORYOU_COVERS');   // <artist with dashes>.png per artist, when given
  const add = (artist: string, n: i32, genre: string, year: i32, rated: i32): void => {
    for (let k = 0; k < n; k++) items.push({ file: song, title: `${artist} Song ${k + 1}`, artist: artist, album: `${artist} Album`, genre: genre, year: year, bpm: 100 + k,
      rating: k === rated ? 1 : 0, artworkFile: covers !== '' ? `${covers}/${artist.split(' ').join('-')}.png` : '' });
  };
  const groups: string[] = ['Rock', 'Jazz', 'Electro'], genres: string[] = ['Rock', 'Jazz', 'Electronic'], years: i32[] = [1995, 1962, 2015];
  for (let g = 0; g < 3; g++) for (let a = 0; a < 4; a++) add(`${groups[g]} ${NUM[a]}`, 3, genres[g], years[g], -1);
  add('Old Flame', 6, 'Pop', 2008, -1);
  add('Capsule Band', 6, 'Indie', 2011, -1);
  add('Repeat Act', 3, 'Rock', 2024, -1);
  add('Hidden Gem', 3, 'Rock', 1996, 2);
  add('Deep Cut', 2, 'Jazz', 1960, -1);
  add('Lost Track', 2, 'Electronic', 2016, -1);
  const added = await ipod.addWith(items);
  let bad = 0;
  for (const r of added) if (r.error !== '') bad++;
  const tracks = await ipod.tracks();
  const byTitle = new Map<string, ipod.Track>();
  for (const t of tracks) byTitle.set(t.title, t);
  const road = await ipod.createPlaylist('Road Trip');
  const roadIds: string[] = [];
  for (const a of NUM) roadIds.push((byTitle.get(`Electro ${a} Song 1`) as ipod.Track).id);
  await ipod.setPlaylistTracks(road, roadIds);
  await ipod.save();
  const playlists = await ipod.playlists();
  await ipod.close();
  console.log('tracks', tracks.length, 'refused', bad);
  if (mode === 'pod') return;   // the songs, no history

  const h = new History(db);
  const of = (title: string): ipod.Track => byTitle.get(title) as ipod.Track;
  let in2026 = 0;
  h.db.transaction(() => {
    const byGroup: ipod.Track[][] = [[], [], []];
    for (const t of tracks) for (let g = 0; g < 3; g++) if (t.artist.startsWith(groups[g] + ' ')) byGroup[g].push(t);
    // three years of sessions, one group each, every 3 days, until a month ago
    let g = 0;
    for (let ts = NOW - 3 * 365 * DAY; ts < NOW - 31 * DAY; ts += 3 * DAY) {
      const group = byGroup[g];
      const pick: i32[] = [];
      while (pick.length < 6) { const i = rnd(group.length); if (pick.indexOf(i) < 0) pick.push(i); }
      for (let j = 0; j < 6; j++) { listen(h, group[pick[j]], ts + j * 240); if (ts + j * 240 >= 1767225600) in2026++; }
      g = (g + 1) % 3;
    }
    for (let k = 0; k < 10; k++) for (let i = 1; i <= 6; i++) listen(h, of(`Old Flame Song ${i}`), NOW - 400 * DAY + k * 2 * DAY + i * 240);
    for (let k = 0; k < 5; k++) for (let i = 1; i <= 6; i++) listen(h, of(`Capsule Band Song ${i}`), 1696500000 + k * 3 * DAY + i * 240);   // October 2023
    for (const d of [25, 20, 15, 10, 5, 4, 3]) { for (let i = 1; i <= 3; i++) { listen(h, of(`Repeat Act Song ${i}`), NOW - d * DAY + i * 240); in2026++; } }
    for (let i = 1; i <= 3; i++) { listen(h, of(`Jazz Two Song ${i}`), NOW - 2 * DAY + i * 240); in2026++; }
    for (let i = 0; i < 4; i++) { listen(h, of(`Electro ${NUM[i]} Song 1`), NOW - DAY + i * 240); in2026++; }
    for (let k = 0; k < 5; k++) { listen(h, null, NOW - 6 * DAY + k * 240, 'Ghost Artist', `Ghost Song ${k}`); in2026++; }
  });
  h.match(GUID, libTracks(tracks), 'm1');
  if (mode === 'fill') { h.close(); console.log('filled'); return; }

  // the shelves, as the app works them out
  const dir = `${env('ZINC_IPOD_BACKUPS')}/history`;
  const m: Model = await buildModel(await h.podListens(GUID), tracks, await readArtistGraph(dir), loadWeights(dir));
  const s = await fy.signals(await h.podListens(GUID), h.lovedOn(GUID), m, NOW);
  const names = (c: fy.Card, sorted: boolean): string => {
    const out: string[] = [];
    for (const id of c.tracks) for (const t of tracks) if (t.id === id) out.push(t.title.replace(' Song ', ' '));
    if (sorted) out.sort();
    return out.join(', ');
  };
  const show = (label: string, cards: fy.Card[], sorted: boolean): void => {
    if (cards.length === 0) { console.log(label, 'none'); return; }
    for (const c of cards) console.log(label, `${c.title} | ${c.subtitle} |`, names(c, sorted));
  };
  show('on repeat', fy.onRepeat(s), false);
  show('repeat rewind', fy.repeatRewind(s), true);
  show('time capsule', await fy.timeCapsule(s), true);
  show('rediscover', await fy.rediscover(s), true);
  const jump = fy.jumpBackIn(s, playlists);
  const firstJump: string[] = [];
  for (const c of jump.slice(0, 3)) firstJump.push(`${c.kind} ${c.title}`);
  console.log('jump back in', jump.length, '|', firstJump.join(' / '));
  const because = await fy.becauseYouListened(s);
  console.log('because', because.length, '|', because[0].title, '|', because[0].cards[0].title, because[0].cards[0].tracks.length);
  show('top month', fy.topSongs(s, 'm', 'Top month', '', fy.monthStart(NOW), NOW + 1, 3), true);
  const artistsMonth: string[] = [];
  for (const c of fy.topArtists(h.topArtists(fy.monthStart(NOW), NOW + 1, 4))) artistsMonth.push(`${c.title} (${c.subtitle})`);
  console.log('top artists month', artistsMonth.join(', '));
  const y = await fy.yearReview(yearCounts(h, NOW), s, NOW);
  let monthSum = 0;
  for (const n of y.months) monthSum += n;
  console.log('year', y.year, 'listens', y.listens === in2026, 'months', monthSum === y.listens, y.months.slice(4, 6).join(' '), 'artists', y.artists.length,
    'songs', y.songs.length, 'genres', y.genres.length, 'minutes', y.minutes > 0);
  // the daily mixes: one per taste, the same all day, others the next day (8 songs: a pick of each group's 12)
  const d1 = await fy.dailyMixes(s, '2026-06-15', 8), again = await fy.dailyMixes(await fy.signals(await h.podListens(GUID), h.lovedOn(GUID), m, NOW + 3600), '2026-06-15', 8), d2 = await fy.dailyMixes(s, '2026-06-16', 8);
  let same = d1.length === again.length, differs = false;
  for (let k = 0; k < d1.length; k++) { same = same && names(d1[k], false) === names(again[k], false); differs = differs || (k < d2.length && names(d1[k], false) !== names(d2[k], false)); }
  console.log('daily mixes', d1.length, 'same all day', same, 'others tomorrow', differs);
  for (const c of d1) {
    const count = new Map<string, i32>();
    for (const id of c.tracks) for (const t of tracks) if (t.id === id) { const w = t.artist.split(' ')[0]; count.set(w, (count.has(w) ? count.get(w) as i32 : 0) + 1); }
    let best = '', most: i32 = 0;
    count.forEach((n: i32, w: string) => { if (n > most) { best = w; most = n; } });
    let rated = false;
    for (const id of c.tracks) for (const t of tracks) if (t.id === id && t.rating === 1) rated = true;
    console.log('daily', c.title, '|', c.subtitle.split(' · ')[1], '| mostly', best, most * 2 > c.tracks.length, 'one star', rated);
  }
  console.log('extra shelves', fy.extraShelves(s).length);
  h.close();
}

/** FORYOU_MODE=big: the bench's library (10,000 songs) on the fake iPod and its 100,000 listens in the history, to time the app on it. */
/** The year's counts from the history, as src/forYou.ts reads them for the worker. */
function yearCounts(h: History, now: number): fy.YearReview {
  const from = fy.yearStart(now), to = Math.min(fy.yearStart(now, 1), now + 1);
  return fy.yearCounts(now, h.times(from, to), h.topArtists(from, to, 5), h.topTracks(from, to, 5));
}

async function big(mount: string, db: string): Promise<void> {
  await ipod.open(mount, true, '', 'Zinc Pod');
  const items: ipod.TrackInput[] = [];
  const song = env('IPOD_SONG');
  for (let i = 0; i < 10000; i++) {
    const a = Math.floor(i / 10);
    items.push({ file: song, title: `Song ${i}`, artist: `Artist ${a}`, album: `Album ${a}`, genre: `Genre ${a % 25}`, year: 1960 + a % 60, bpm: 80 + i % 80, rating: 0 });
  }
  const added = await ipod.addWith(items);
  for (const r of added) if (r.error !== '') { console.log('refused', r.error); break; }
  await ipod.save();
  const tracks = await ipod.tracks();
  await ipod.close();
  const byTitle = new Map<string, ipod.Track>();
  for (const t of tracks) byTitle.set(t.title, t);
  const h = new History(db);
  h.db.transaction(() => {
    let ts = NOW - 10000 * DAY / 4;
    for (let s = 0; s < 10000; s++) {
      ts += DAY / 4;
      const base = rnd(20) * 500;
      for (let j = 0; j < 10; j++) listen(h, byTitle.get(`Song ${base + rnd(500)}`) as ipod.Track, ts + j * 240);
    }
  });
  h.match(GUID, libTracks(tracks), 'm1');
  h.close();
  console.log('big', tracks.length);
}

async function bench(): Promise<void> {
  const dir = env('GENIUS_DIR');
  const n = 10000;
  const tracks: ipod.Track[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i / 10);
    tracks.push({ id: `t${i}`, title: `Song ${i}`, artist: `Artist ${a}`, album: `Album ${a}`, albumArtist: '', genre: `Genre ${a % 25}`, composer: '', comment: '',
      trackNr: 0, tracks: 0, cdNr: 0, cds: 0, year: 1960 + a % 60, rating: 0, playCount: i % 7, bitrate: 256, sampleRate: 44100, durationMs: 200000, size: 0,
      mediaType: 'audio', path: '', artwork: false, added: 0, lastPlayed: 0, bpm: 80 + i % 80, skipCount: i % 11 === 0 ? 1 : 0, lastSkipped: 0,
      grouping: '', description: '', kind: '', compilation: false, sortTitle: '', sortArtist: '', sortAlbum: '', sortAlbumArtist: '', sortComposer: '',
      startMs: 0, stopMs: 0, volume: 0, skipWhenShuffling: false, rememberPosition: false, lyrics: false, modified: 0 });
  }
  const h = new History(`${dir}/bench.sqlite`);
  if (h.version('BENCH').startsWith('0:')) h.db.transaction(() => {   // filled once
    let ts = NOW - 10000 * DAY / 4;
    for (let s = 0; s < 10000; s++) {   // 10,000 sessions of 10 listens over 7 years, each within a taste of 500 songs
      ts += DAY / 4;
      const base = rnd(20) * 500;
      for (let j = 0; j < 10; j++) listen(h, tracks[base + rnd(500)], ts + j * 240);
    }
  });
  h.match('BENCH', libTracks(tracks), 'b');
  // each step: its time, and the longest slice it held the thread (services/slice.ts; a step that does not pause is one slice)
  const times: string[] = [];
  let b = new Budget(), t0 = performance.now();
  const done = (name: string, k: number): void => {
    const t = performance.now();
    times.push(`${name} ${Math.round(t - t0)} ms, longest slice ${Math.round(Math.max(b.longest, b.since()))} ms (${k})`);
    b = new Budget(); t0 = performance.now();
  };
  const graph = await readArtistGraph(dir, b);
  done('artist graph', graph.size);
  const m: Model = await buildModel(await h.podListens('BENCH', b), tracks, graph, loadWeights(dir), b);
  done('model', m.tracks.length);
  const s = await fy.signals(await h.podListens('BENCH', b), h.lovedOn('BENCH'), m, NOW, b);
  done('signals', s.flatTs.length);
  done('daily', (await fy.dailyMixes(s, '2026-06-15', 50, b)).length);
  done('jump', fy.jumpBackIn(s, []).length);
  done('on repeat', fy.onRepeat(s).length);
  done('repeat rewind', fy.repeatRewind(s).length);
  done('rediscover', (await fy.rediscover(s, 30, b)).length);
  done('time capsule', (await fy.timeCapsule(s, 30, b)).length);
  done('because', (await fy.becauseYouListened(s, 3, b)).length);
  done('tops', fy.topSongs(s, 'a', '', '', fy.monthStart(NOW), NOW, 50).length + fy.topArtists(h.topArtists(fy.yearStart(NOW), NOW, 12)).length);
  done('year', (await fy.yearReview(yearCounts(h, NOW), s, NOW, b)).listens);
  done('version', h.version('BENCH').length);
  done('mixes', (await mixes(m, 6, 50, 5, b)).length);
  done('genius 100', genius(m, 't1234', 100).length);
  for (const mood of MOODS) done(`mood ${mood.id}`, moodMix(m, mood, mood.energy, mood.tempo).tracks.length);
  console.log(`bench:\n  ${times.join('\n  ')}`);
  h.close();
}

main().catch((e: Error) => { console.error(`ipod-foryou: ${e.message}`); });
