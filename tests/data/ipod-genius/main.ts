// Genius of the iPod app (examples/ipod/src/services/genius.ts) on a fake iPod (tests/t1/ipod_genius.sh makes it) and a generated
// history whose answers are known: three groups of four artists (A Rock 1995, B Jazz 1962, C Electronic 2015, two songs each), every
// session plays only one group; one A song is tagged Jazz (co-listening must keep it in A), one is rated 1 star (never picked), and
// "Lonely Star" (Folk, 1970, never heard) is close to Alpha One only through Last.fm's similar artists (the stub). Prints lines that
// the test compares; the letters are the groups of the songs picked, in order.
// GENIUS_BENCH=1 instead measures a 10,000-song library with 100,000 listens (no iPod).
import * as ipod from 'zinc:ipod';
import * as fs from 'zinc:fs';
import { env } from 'zinc:sys';
import { History, Listen, LibTrack } from '../../../examples/ipod/src/services/history';
import { loadWeights, readArtistGraph, fetchSimilarArtists, buildModel, genius, reasons, mixes, savePlaylist, Model, Mix } from '../../../examples/ipod/src/services/genius';

const GUID = '000A27001234ABCD';
const GROUPS: string[] = ['Alpha', 'Bravo', 'Charlie'];
const GENRES: string[] = ['Rock', 'Jazz', 'Electronic'];
const YEARS: i32[] = [1995, 1962, 2015];
const BPMS: i32[] = [124, 92, 128];
const NUM: string[] = ['One', 'Two', 'Three', 'Four'];

let seed: number = 7;
function rnd(n: i32): i32 { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor(seed / 2147483648 * n) as i32; }

function letters(ts: ipod.Track[]): string { let s = ''; for (const t of ts) s += t.artist[0]; return s; }

/** The same artist twice within `n` songs. */
function spreadOk(ts: ipod.Track[], n: i32): boolean {
  for (let i = 0; i < ts.length; i++) for (let k = i + 1; k < ts.length && k < i + n; k++) if (ts[i].artist === ts[k].artist) return false;
  return true;
}
function ids(ts: ipod.Track[]): string { const out: string[] = []; for (const t of ts) out.push(t.id); return out.join(','); }

function libTracks(ts: ipod.Track[]): LibTrack[] {
  const out: LibTrack[] = [];
  for (const t of ts) out.push({ id: t.id, artist: t.artist, albumArtist: t.albumArtist, title: t.title, album: t.album, mbid: '' });
  return out;
}

async function main(): Promise<void> {
  if (env('GENIUS_BENCH') !== '') { bench(); return; }
  const dir = env('GENIUS_DIR');
  let pod: ipod.Device | null = null;
  for (const p of await ipod.detect()) if (p.mountpoint.endsWith('/ZINCPOD')) pod = p;
  if (pod === null) { console.log('no fake iPod'); return; }
  await ipod.open((pod as ipod.Device).mountpoint, true, '', 'Zinc Pod');
  const items: ipod.TrackInput[] = [];
  for (let g = 0; g < 3; g++) for (let a = 0; a < 4; a++) for (let k = 0; k < 2; k++) {
    const artist = `${GROUPS[g]} ${NUM[a]}`;
    items.push({ file: env('IPOD_SONG'), title: `${artist} Song ${k + 1}`, artist: artist, album: `${artist} Album`,
      genre: g === 0 && a === 3 && k === 1 ? 'Jazz' : GENRES[g], year: YEARS[g], bpm: BPMS[g] + a * 2 - k, rating: g === 0 && a === 1 && k === 1 ? 1 : 0 });
  }
  for (let k = 0; k < 2; k++) items.push({ file: env('IPOD_SONG'), title: `Lonely Star Song ${k + 1}`, artist: 'Lonely Star', album: 'Lonely', genre: 'Folk', year: 1970, bpm: 100 });
  const added = await ipod.addWith(items);
  let bad = 0;
  for (const r of added) if (r.error !== '') bad++;
  await ipod.save();
  const tracks = await ipod.tracks();
  console.log('tracks', tracks.length, 'refused', bad);

  // the history: 40 sessions per group, a week apart, six songs each (the group's first song, then five of its others)
  const h = new History(`${dir}/history.sqlite`);
  const byGroup: ipod.Track[][] = [[], [], []];
  for (const t of tracks) for (let g = 0; g < 3; g++) if (t.artist.startsWith(GROUPS[g])) byGroup[g].push(t);
  h.db.transaction(() => {
    let ts = 1600000000;
    for (let s = 0; s < 40; s++) for (let g = 0; g < 3; g++) {
      ts += 3 * 86400;
      const group = byGroup[g];
      const pick: i32[] = [0];
      while (pick.length < 6) { const i = 1 + rnd(group.length - 1); if (pick.indexOf(i) < 0) pick.push(i); }
      for (let j = 0; j < pick.length; j++) {
        const t = group[pick[j]];
        const l = new Listen();
        l.ts = ts + j * 240; l.artist = t.artist; l.title = t.title; l.album = t.album; l.durationMs = 200000; l.source = 'lastfm';
        h.add(l);
      }
    }
  });
  h.match(GUID, libTracks(tracks), 'm1');

  const w = loadWeights(dir);
  console.log('weights', w.artistSpread, fs.exists(`${dir}/genius.json`));
  const names: string[] = [];
  for (const t of tracks) if (names.indexOf(t.artist) < 0) names.push(t.artist);
  console.log('fetched without a key', await fetchSimilarArtists(dir, '', names));
  const plain = buildModel(h, GUID, tracks, readArtistGraph(dir), w);
  let seedId = '';
  for (const t of tracks) if (t.title === 'Alpha One Song 1') seedId = t.id;
  const g0 = genius(plain, seedId, 25);
  // the spread holds until only Lonely Star is left (its two songs end the list together)
  console.log('genius', g0.length, letters(g0), 'seed first', g0[0].id === seedId, 'spread', spreadOk(g0.slice(0, 23), w.artistSpread));
  let rated = false;
  for (const t of g0) rated = rated || t.rating === 1 || t.rating === 2;
  console.log('one star picked', rated, 'same again', ids(genius(buildModel(h, GUID, tracks, readArtistGraph(dir), w), seedId, 25)) === ids(g0));
  const r1 = genius(plain, seedId, 25, 1);
  let alpha = 0;   // Refresh shakes the close songs by their ids (new on each fake iPod): only what holds whatever the ids
  for (const t of r1) if (t.artist[0] === 'A') alpha++;
  console.log('refresh', r1[0].id === seedId, ids(r1) === ids(genius(plain, seedId, 25, 1)), 'Alpha songs', alpha, 'spread', spreadOk(r1.slice(0, 23), w.artistSpread));

  // Last.fm's similar artists (the stub): fetched once, then from the cache
  let told = '';   // the progress, and a stop after two artists (Cancel in Transfers)
  console.log('stopped after', await fetchSimilarArtists(dir, 'apikey', names, 200, (done: i32, total: i32, artist: string): boolean => { told += `${done}/${total} `; return done < 2; }), told);
  console.log('fetched', await fetchSimilarArtists(dir, 'apikey', names), 'again', await fetchSimilarArtists(dir, 'apikey', names));
  const graph = readArtistGraph(dir);
  const m1 = buildModel(h, GUID, tracks, graph, w);
  const g1 = genius(m1, seedId, 25);
  console.log('genius with similar artists', letters(g1), 'spread', spreadOk(g1, w.artistSpread));
  // why each was picked: the reasons met per group, in the order of the list
  const why = reasons(m1, seedId, g1);
  const per = new Map<string, string[]>();
  for (let i = 0; i < g1.length; i++) {
    const k = g1[i].artist[0], l = per.get(k);
    if (l === undefined) per.set(k, [why[i]]); else if ((l as string[]).indexOf(why[i]) < 0) (l as string[]).push(why[i]);
  }
  per.forEach((l: string[], k: string) => { console.log('why', k, l.join(' | ')); });
  // the first versions' file, one JSON array, is moved once into the lines (an older entry of an artist loses), then deleted
  const alphaOne = (graph.get('alpha one') as Map<string, number>).size;
  fs.writeText(`${dir}/similar-artists.json`, JSON.stringify([{ artist: 'old band', at: 1, similar: [{ artist: 'alpha one', match: 0.5 }] },
    { artist: 'alpha one', at: -1, similar: [] as { artist: string; match: number }[] }]));
  const both = readArtistGraph(dir);
  const once = fs.readText(`${dir}/similar-artists.jsonl`).split('"old band"').length - 1;
  const again = readArtistGraph(dir);
  console.log('old file moved', both.has('old band'), both.size === graph.size + 1, 'newer kept', (both.get('alpha one') as Map<string, number>).size === alphaOne,
    'gone', !fs.exists(`${dir}/similar-artists.json`), 'once', once === 1, again.size === both.size);
  const short = genius(plain, seedId, 10);
  console.log('ten', short.length, letters(short));

  // the taste clusters
  const ms = mixes(buildModel(h, GUID, tracks, graph, w));
  console.log('mixes', ms.length);
  for (const mix of ms) {
    const groups: string[] = [];
    for (const id of mix.members) for (const t of tracks) if (t.id === id && groups.indexOf(t.artist[0]) < 0) groups.push(t.artist[0]);
    console.log('mix', mix.name, '|', mix.members.length, mix.tracks.length, groups.join(''), 'spread', spreadOk(mix.tracks, w.artistSpread));
  }
  // no history: metadata and the iPod's counters only
  const bare = mixes(buildModel(null, GUID, tracks, new Map<string, Map<string, number>>(), w));
  const m0 = buildModel(null, GUID, tracks, new Map<string, Map<string, number>>(), w);
  const g8 = genius(m0, seedId, 8);
  const why0: string[] = [];
  for (const r of reasons(m0, seedId, g8)) if (why0.indexOf(r) < 0) why0.push(r);
  console.log('mixes without history', bare.length, g8.length, 'why', why0.join(' | '));

  // saved to the iPod as a normal playlist, read back after closing it
  const id = await savePlaylist('Genius · Alpha One Song 1', g0);
  await ipod.close();
  await ipod.open((pod as ipod.Device).mountpoint);
  let back = '';
  for (const p of await ipod.playlists()) if (p.id === id) back = `${p.name} ${p.smart} ${p.trackIds.join(',') === ids(g0)}`;
  console.log('saved', back);
  await ipod.close();
  h.close();
}

function bench(): void {
  const dir = env('GENIUS_DIR');
  const n = 10000;
  const tracks: ipod.Track[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i / 10);
    tracks.push({ id: `t${i}`, title: `Song ${i}`, artist: `Artist ${a}`, album: `Album ${a}`, albumArtist: '', genre: `Genre ${a % 25}`, composer: '', comment: '',
      trackNr: 0, tracks: 0, cdNr: 0, cds: 0, year: 1960 + a % 60, rating: 0, playCount: i % 7, bitrate: 256, sampleRate: 44100, durationMs: 200000, size: 0,
      mediaType: 'audio', path: '', artwork: false, added: 0, lastPlayed: 0, bpm: 80 + i % 80, skipCount: i % 11 === 0 ? 1 : 0, lastSkipped: 0 });
  }
  const h = new History(`${dir}/bench.sqlite`);
  let t0 = Date.now();
  h.db.transaction(() => {
    let ts = 1500000000;
    for (let s = 0; s < 10000; s++) {   // 10,000 sessions of 10 listens, each within a taste of 500 songs
      ts += 86400 / 4;
      const base = rnd(20) * 500;
      for (let j = 0; j < 10; j++) {
        const t = tracks[base + rnd(500)];
        const l = new Listen();
        l.ts = ts + j * 240; l.artist = t.artist; l.title = t.title; l.durationMs = 200000; l.source = 'lastfm';
        h.add(l);
      }
    }
  });
  h.match('BENCH', libTracks(tracks), 'b');
  const filled = Date.now() - t0;
  t0 = Date.now();
  const m: Model = buildModel(h, 'BENCH', tracks, new Map<string, Map<string, number>>(), loadWeights(dir));
  const built = Date.now() - t0;
  t0 = Date.now();
  const g = genius(m, 't1234', 100);
  const picked = Date.now() - t0;
  t0 = Date.now();
  const ms: Mix[] = mixes(m);
  const clustered = Date.now() - t0;
  console.log(`bench: history filled and matched ${filled} ms; model (100,000 listens, 10,000 songs) ${built} ms; Genius 100 songs ${picked} ms (${g.length}); mixes ${clustered} ms (${ms.length})`);
  h.close();
}

main().catch((e: Error) => { console.error(`ipod-genius: ${e.message}`); });
