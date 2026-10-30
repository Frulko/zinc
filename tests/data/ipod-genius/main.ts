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
import { loadWeights, readArtistGraph, buildModel, genius, reasons, mixes, pathBetween, Model, Mix } from '../../../examples/ipod/src/services/genius';
import { fetchSimilarArtists } from '../../../examples/ipod/src/services/historyImport';
import { Radio, startRadio, extend, like, dislike, unqueue } from '../../../examples/ipod/src/services/radio';
import { createPlaylistOf } from '../../../examples/ipod/src/services/ipod';

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
  await h.match(GUID, libTracks(tracks), 'm1');

  const w = loadWeights(dir);
  console.log('weights', w.artistSpread, fs.exists(`${dir}/genius.json`));
  const names: string[] = [];
  for (const t of tracks) if (names.indexOf(t.artist) < 0) names.push(t.artist);
  console.log('fetched without a key', await fetchSimilarArtists(dir, '', names));
  const plain = await buildModel(await h.podListens(GUID), tracks, await readArtistGraph(dir), w);
  let seedId = '';
  for (const t of tracks) if (t.title === 'Alpha One Song 1') seedId = t.id;
  const g0 = genius(plain, seedId, 25);
  // the spread holds until only Lonely Star is left (its two songs end the list together)
  console.log('genius', g0.length, letters(g0), 'seed first', g0[0].id === seedId, 'spread', spreadOk(g0.slice(0, 23), w.artistSpread));
  let rated = false;
  for (const t of g0) rated = rated || t.rating === 1 || t.rating === 2;
  console.log('one star picked', rated, 'same again', ids(genius(await buildModel(await h.podListens(GUID), tracks, await readArtistGraph(dir), w), seedId, 25)) === ids(g0));
  const r1 = genius(plain, seedId, 25, 1);
  let alpha = 0;   // Refresh shakes the close songs by their ids (new on each fake iPod): only what holds whatever the ids
  for (const t of r1) if (t.artist[0] === 'A') alpha++;
  console.log('refresh', r1[0].id === seedId, ids(r1) === ids(genius(plain, seedId, 25, 1)), 'Alpha songs', alpha, 'spread', spreadOk(r1.slice(0, 23), w.artistSpread));

  // Last.fm's similar artists (the stub): fetched once, then from the cache
  let told = '';   // the progress, and a stop after two artists (Cancel in Transfers)
  console.log('stopped after', await fetchSimilarArtists(dir, 'apikey', names, 200, (done: i32, total: i32, artist: string): boolean => { told += `${done}/${total} `; return done < 2; }), told);
  console.log('fetched', await fetchSimilarArtists(dir, 'apikey', names), 'again', await fetchSimilarArtists(dir, 'apikey', names));
  const graph = await readArtistGraph(dir);
  const m1 = await buildModel(await h.podListens(GUID), tracks, graph, w);
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
  const both = await readArtistGraph(dir);
  const once = fs.readText(`${dir}/similar-artists.jsonl`).split('"old band"').length - 1;
  const again = await readArtistGraph(dir);
  console.log('old file moved', both.has('old band'), both.size === graph.size + 1, 'newer kept', (both.get('alpha one') as Map<string, number>).size === alphaOne,
    'gone', !fs.exists(`${dir}/similar-artists.json`), 'once', once === 1, again.size === both.size);
  radio(m1, tracks, seedId, w.artistSpread);
  // From A to B without AudioMuse: greedy steps toward B
  let charlie = '';
  for (const t of tracks) if (t.title === 'Charlie One Song 1') charlie = t.id;
  const way = pathBetween(m1, seedId, charlie, 12);
  console.log('path', letters(way), way[0].id === seedId, way[way.length - 1].id === charlie, 'not music', pathBetween(m1, seedId, 'none').length);
  const short = genius(plain, seedId, 10);
  console.log('ten', short.length, letters(short));

  // the taste clusters
  const ms = await mixes(await buildModel(await h.podListens(GUID), tracks, graph, w));
  console.log('mixes', ms.length);
  for (const mix of ms) {
    const groups: string[] = [];
    for (const id of mix.members) for (const t of tracks) if (t.id === id && groups.indexOf(t.artist[0]) < 0) groups.push(t.artist[0]);
    console.log('mix', mix.name, '|', mix.members.length, mix.tracks.length, groups.join(''), 'spread', spreadOk(mix.tracks, w.artistSpread));
  }
  // no history: metadata and the iPod's counters only
  const bare = await mixes(await buildModel([], tracks, new Map<string, Map<string, number>>(), w));
  const m0 = await buildModel([], tracks, new Map<string, Map<string, number>>(), w);
  const g8 = genius(m0, seedId, 8);
  const why0: string[] = [];
  for (const r of reasons(m0, seedId, g8)) if (why0.indexOf(r) < 0) why0.push(r);
  console.log('mixes without history', bare.length, g8.length, 'why', why0.join(' | '));

  // saved to the iPod as a normal playlist, read back after closing it
  const id = await createPlaylistOf('Genius · Alpha One Song 1', ids(g0).split(','));
  await ipod.close();
  await ipod.open((pod as ipod.Device).mountpoint);
  let back = '';
  for (const p of await ipod.playlists()) if (p.id === id) back = `${p.name} ${p.smart} ${p.trackIds.join(',') === ids(g0)}`;
  console.log('saved', back);
  await ipod.close();
  h.close();
}

/** A guided radio (services/radio.ts) from `seedId`: 10 songs at a time until the library runs out. After the first extension a 👎 on its
 *  first song of another group (the songs queued after it are taken back, as the app does); a second radio with a 👍 on a Charlie
 *  song instead must pick more Charlie songs next. */
function radio(m: Model, tracks: ipod.Track[], seedId: string, spread: i32): void {
  let seedTrack = tracks[0];
  for (const t of tracks) if (t.id === seedId) seedTrack = t;
  const r = startRadio(m, seedId) as Radio;
  let queued: ipod.Track[] = [seedTrack];
  const sizes: i32[] = [];
  let banned = '', after = '';
  for (let k = 0; k < 20; k++) {
    const more = extend(m, r, queued.map((t: ipod.Track) => t.id), 10);
    if (more.length === 0) break;
    sizes.push(more.length as i32);
    if (k === 0) {
      let at = -1;
      for (let i = 0; i < more.length && at < 0; i++) if (more[i].artist[0] !== 'A') at = i;
      banned = more[at].artist;
      dislike(r, more[at].id);
      unqueue(r, more.slice(at + 1).map((t: ipod.Track) => t.id));
      queued = queued.concat(more.slice(0, at + 1));
    } else { queued = queued.concat(more); after += letters(more); }
  }
  const seen = new Set<string>();
  let repeats = 0, bannedAfter = 0;
  for (const t of queued) { if (seen.has(t.id)) repeats++; seen.add(t.id); }
  for (const t of queued.slice(queued.length - after.length)) if (t.artist === banned) bannedAfter++;
  console.log('radio', letters(queued), 'extensions', sizes.join(','), 'disliked', banned[0], 'then', after.length, 'repeats', repeats,
    'spread', spreadOk(queued, spread), 'disliked artist after', bannedAfter);
  // 👍: two radios, one liking a Charlie song after its first extension
  const next = (liked: boolean): string => {
    const r2 = startRadio(m, seedId) as Radio;
    const first = extend(m, r2, [seedId], 5);
    let c = '';
    for (const t of tracks) if (t.artist === 'Charlie One' && c === '') c = t.id;
    if (liked) like(r2, c);
    return letters(first) + ' ' + letters(extend(m, r2, [seedId].concat(first.map((t: ipod.Track) => t.id)), 5));
  };
  console.log('radio next', next(false), 'liked a C song', next(true));
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
  await h.match('BENCH', libTracks(tracks), 'b');
  const filled = Date.now() - t0;
  t0 = Date.now();
  const m: Model = await buildModel(await h.podListens('BENCH'), tracks, new Map<string, Map<string, number>>(), loadWeights(dir));
  const built = Date.now() - t0;
  t0 = Date.now();
  const g = genius(m, 't1234', 100);
  const picked = Date.now() - t0;
  t0 = Date.now();
  const ms: Mix[] = await mixes(m);
  const clustered = Date.now() - t0;
  console.log(`bench: history filled and matched ${filled} ms; model (100,000 listens, 10,000 songs) ${built} ms; Genius 100 songs ${picked} ms (${g.length}); mixes ${clustered} ms (${ms.length})`);
  h.close();
}

main().catch((e: Error) => { console.error(`ipod-genius: ${e.message}`); });
