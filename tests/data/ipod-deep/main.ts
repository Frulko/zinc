// Genius tier 2 of the iPod app (examples/ipod/src/services/audiomuse.ts, its merge in genius.ts, the shelves of forYou.ts) against the
// stand-in of tests/data/ipod-deep/stub.py (tests/t1/ipod_deep.sh starts it; never the real AudioMuse). A fake iPod as tests/data/
// ipod-genius makes it (three groups of four artists, A Rock, B Jazz, C Electronic, two songs each, a history where each session plays
// one group) and, for the stub, what AudioMuse "heard": A and B sound alike (aggressive, guitars), C apart (danceable); Charlie Four's
// two songs were not analysed (tier 1 only), Lonely Star Song 1 comes under another server's id (matched by its names) and one song
// AudioMuse knows is not on the iPod. Prints lines the test compares; letters are the groups of the songs picked, in order (sorted for
// the shelves and the path, whose ties follow the iPod's ids).
//   DEEP_MODE=''        reach, a bad token, an analysis polled to its end, one cancelled, the sync (paged), Genius tier 1 vs merged,
//                       the near lists and a path, the tier-2 shelves; the cache is left in <ZINC_IPOD_BACKUPS>/cache/<GUID>
//   DEEP_MODE=offline   the stub is down: reach and near say offline, the cache is read back and Genius is the merged one again
import * as ipod from 'zinc:ipod';
import * as fs from 'zinc:fs';
import { env } from 'zinc:sys';
import { History, Listen, LibTrack } from '../../../examples/ipod/src/services/history';
import { loadWeights, readArtistGraph, buildModel, attachDeep, genius, pathBetween, Model } from '../../../examples/ipod/src/services/genius';
import * as fy from '../../../examples/ipod/src/services/forYou';
import * as muse from '../../../examples/ipod/src/services/audiomuse';
import * as prep from '../../../examples/ipod/src/services/prepare';
import * as moods from '../../../examples/ipod/src/services/moods';

const GUID = '000A27001234ABCD';
const NOW: number = 1781524800;
const DAY: number = 86400;
const GROUPS: string[] = ['Alpha', 'Bravo', 'Charlie'];
const GENRES: string[] = ['Rock', 'Jazz', 'Electronic'];
const YEARS: i32[] = [1995, 1962, 2015];
const NUM: string[] = ['One', 'Two', 'Three', 'Four'];

let seed: number = 7;
function rnd(n: i32): i32 { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor(seed / 2147483648 * n) as i32; }
function letters(ts: ipod.Track[]): string { let s = ''; for (const t of ts) s += t.artist[0]; return s; }
/** The groups of `ids`, sorted (the order of songs as close as each other follows the iPod's ids, new on each fake iPod). */
function lettersOf(ids: string[], tracks: ipod.Track[]): string {
  const out: string[] = [];
  for (const id of ids) for (const t of tracks) if (t.id === id) out.push(t.artist[0]);
  out.sort();
  return out.join('');
}
function libTracks(ts: ipod.Track[]): LibTrack[] {
  const out: LibTrack[] = [];
  for (const t of ts) out.push({ id: t.id, artist: t.artist, albumArtist: t.albumArtist, title: t.title, album: t.album, mbid: '' });
  return out;
}

/** What AudioMuse heard of a song of group g (A and B alike, C apart), a little different per song. */
function sound(g: i32, k: i32): string[] {
  const e = (k % 5) / 100;
  if (g === 2) return [`electronic:${0.80 + e},dance:${0.50 - e}`, `danceable:${0.90 - e},aggressive:0.10,happy:0.50,party:${0.70 + e},relaxed:0.10,sad:0.10`];
  return [`rock:${0.55 + e},jazz:${0.35 - e}`, `danceable:0.20,aggressive:${0.80 - e},happy:0.30,party:0.20,relaxed:0.10,sad:${0.20 + e}`];
}

async function main(): Promise<void> {
  const backups = env('ZINC_IPOD_BACKUPS');
  const cacheDir = `${backups}/cache/${GUID}`;
  const c = new muse.Muse(env('MUSE_URL'), 'muse-token');
  let pod: ipod.Device | null = null;
  for (const p of await ipod.detect()) if (p.mountpoint.endsWith('/ZINCPOD')) pod = p;
  if (pod === null) { console.log('no fake iPod'); return; }
  const offline = env('DEEP_MODE') === 'offline';
  await ipod.open((pod as ipod.Device).mountpoint, !offline, '', 'Zinc Pod');
  if (!offline) {
    const items: ipod.TrackInput[] = [];
    for (let g = 0; g < 3; g++) for (let a = 0; a < 4; a++) for (let k = 0; k < 2; k++) {
      const artist = `${GROUPS[g]} ${NUM[a]}`;
      items.push({ file: env('IPOD_SONG'), title: `${artist} Song ${k + 1}`, artist: artist, album: `${artist} Album`, genre: GENRES[g], year: YEARS[g], bpm: 100 + a });
    }
    for (let k = 0; k < 2; k++) items.push({ file: env('IPOD_SONG'), title: `Lonely Star Song ${k + 1}`, artist: 'Lonely Star', album: 'Lonely', genre: 'Folk', year: 1970, bpm: 100 });
    await ipod.addWith(items);
    await ipod.save();
  }
  const tracks = await ipod.tracks();
  await ipod.close();
  const db = `${backups}/history/history.sqlite`;
  if (!offline) {
    // what AudioMuse analysed, for the stub
    const lib: string[] = [];
    for (const t of tracks) {
      let g = -1;
      for (let x = 0; x < 3; x++) if (t.artist.startsWith(GROUPS[x])) g = x;
      if (t.artist === 'Charlie Four') continue;   // not analysed yet
      const id = t.title === 'Lonely Star Song 1' ? 'fp_lonely' : t.artist === 'Lonely Star' ? '' : 'tr-' + t.id;
      if (id === '') continue;
      const v = (t.title.charCodeAt(t.title.length - 1) + t.artist.length * 3) as i32;   // from the names: the same song sounds the same on every fake iPod
      const s = g >= 0 ? sound(g as i32, v) : ['folk:0.90', 'danceable:0.10,aggressive:0.10,happy:0.20,party:0.10,relaxed:0.90,sad:0.30'];
      lib.push(JSON.stringify({ id: id, title: t.title, artist: t.artist, album: t.album, mood_vector: s[0], other_features: s[1], tempo: 120 + v % 7, energy: 0.1 + (v % 3) / 100 }));
    }
    lib.push(JSON.stringify({ id: 'tr-ffffffff', title: 'Not Here', artist: 'Elsewhere', album: 'Gone', mood_vector: 'rock:0.5', other_features: 'aggressive:0.5', tempo: 100, energy: 0.1 }));
    fs.writeText(`${env('STUB_DIR')}/library.json`, `[${lib.join(',')}]`);
    // the history: 40 sessions per group over the last year, six songs each
    const h = new History(db);
    const byGroup: ipod.Track[][] = [[], [], []];
    for (const t of tracks) for (let g = 0; g < 3; g++) if (t.artist.startsWith(GROUPS[g])) byGroup[g].push(t);
    h.db.transaction(() => {
      let ts = NOW - 365 * DAY;
      for (let s = 0; s < 40; s++) for (let g = 0; g < 3; g++) {
        ts += 3 * DAY;
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
    h.close();
  }
  const h = new History(db);
  const dir = `${backups}/history`;
  const m: Model = await buildModel(await h.podListens(GUID), tracks, await readArtistGraph(dir), loadWeights(dir));
  let alpha = '';
  for (const t of tracks) if (t.title === 'Alpha One Song 1') alpha = t.id;

  if (offline) {
    try { await muse.reach(c); console.log('reach answered'); } catch (e) { console.log('reach offline', muse.isOffline(e as Error)); }
    const d = muse.readDeep(cacheDir, GUID);
    if (d === null) { console.log('no cache'); return; }
    try { await muse.fetchNear(c, cacheDir, d as muse.Deep, tracks, [alpha], 50); console.log('near answered'); }
    catch (e) { console.log('near offline', muse.isOffline(e as Error)); }
    attachDeep(m, d);
    console.log('cached', (d as muse.Deep).tracks.length, 'genius', letters(genius(m, alpha, 12)));
    h.close();
    return;
  }

  // reach, and a bad token
  const r = await muse.reach(c);
  console.log('reach analysed', r.analysed, 'last', r.lastTask);
  try { await muse.reach(new muse.Muse(env('MUSE_URL'), 'wrong')); console.log('bad token accepted'); } catch (e) { console.log('bad token', (e as Error).message.indexOf('(401)') > 0, muse.isOffline(e as Error)); }
  // an analysis polled to its end, then one cancelled after its first state
  const seen: string[] = [];
  const line = await muse.analyse(c, (s: muse.TaskState) => { seen.push(`${s.state} ${s.progress} ${s.message}`); }, (): boolean => false, 5);
  console.log('analyse', seen.join(' | '), '->', line);
  let states: i32 = 0;
  const cancelled = await muse.analyse(c, (s: muse.TaskState) => { states++; }, (): boolean => states >= 1, 5);
  console.log('cancel', states, cancelled);
  // the sync
  const pages: string[] = [];
  const d = await muse.sync(c, cacheDir, GUID, tracks, (done: i32, total: i32) => { pages.push(`${done}/${total}`); });
  let lonely = false;
  for (const t of d.tracks) for (const x of tracks) if (x.id === t.id && x.title === 'Lonely Star Song 1') lonely = true;
  console.log('sync', d.tracks.length, 'unknown', d.unknown, 'pages', pages.join(' '), 'by name', lonely, 'kept', muse.readDeep(cacheDir, GUID) !== null);
  // Genius: tier 1, then merged with the sound
  const t1 = genius(m, alpha, 12);
  attachDeep(m, d);
  const t2 = genius(m, alpha, 12);
  const count = (s: string, ch: string): i32 => { let n: i32 = 0; for (let i = 0; i < s.length; i++) if (s[i] === ch) n++; return n; };
  console.log('genius tier 1', letters(t1), 'merged', letters(t2), 'more B', count(letters(t2), 'B') > count(letters(t1), 'B'));
  let charlieFour = 0;
  for (const t of genius(m, alpha, 25)) if (t.artist === 'Charlie Four') charlieFour++;
  console.log('not analysed still picked', charlieFour);
  // near lists and the path, then the tier-2 shelves
  const s = await fy.signals(await h.podListens(GUID), h.lovedOn(GUID), m, NOW);
  const seeds = fy.soundsLikeSeeds(s);
  const asked = await muse.fetchNear(c, cacheDir, d, tracks, seeds, 50);
  const again = await muse.fetchNear(c, cacheDir, d, tracks, seeds, 50);
  const p = seeds.length >= 2 ? await muse.fetchPath(c, cacheDir, d, tracks, seeds[0], seeds[1]) : [];
  console.log('seeds', lettersOf(seeds, tracks), 'near asked', asked, 'again', again, 'path', lettersOf(p, tracks));
  let four = '';
  for (const t of tracks) if (t.artist === 'Charlie Four') four = t.id;
  console.log('a seed it never analysed', await muse.fetchNear(c, cacheDir, d, tracks, [four], 50), (muse.nearOf(d, four) as muse.Near).ids.length);
  attachDeep(m, d);
  console.log('genius with near', letters(genius(m, alpha, 12)));
  // From A to B: AudioMuse's path when it has one, else tier 1 (a pair it has no path for, then the model without deep results)
  const between = (from: string, to: string): string => { const l = pathBetween(m, from, to, 10); return l.length === 0 ? '-' : `${l[0].id === from} ${l[l.length - 1].id === to} ${letters(l)}`; };
  const deepIds = pathBetween(m, seeds[0], seeds[1], 25).map((t: ipod.Track) => t.id);
  console.log('path between', deepIds.join(',') === p.join(','), between(seeds[1], alpha));
  attachDeep(m, null);
  console.log('path between tier 1', between(seeds[0], seeds[1]), between(seeds[1], alpha));
  // the mood mixer: by AudioMuse's moods (A and B aggressive, C danceable), then by the genres alone (A Rock, B Jazz, C Electronic)
  const mixer = (): string => {
    const parts: string[] = [];
    for (const id of ['workout', 'party', 'chill']) {
      const mood = moods.moodOf(id), mx = moods.moodMix(m, mood, mood.energy, mood.tempo, 8);
      // the first song and the group most picked (songs as close as each other follow the iPod's ids)
      const n = new Map<string, i32>();
      let most = '';
      for (const t of mx.tracks) { const k = t.artist[0]; n.set(k, (n.has(k) ? n.get(k) as i32 : 0) + 1); if (most === '' || (n.get(k) as i32) > (n.get(most) as i32)) most = k; }
      parts.push(`${id} ${mx.deep} ${mx.tracks.length} first ${mx.tracks[0].artist[0]} most ${most}`);
    }
    return parts.join(' / ');
  };
  console.log('mood mixer without AudioMuse', mixer());
  attachDeep(m, d);
  console.log('mood mixer', mixer());
  const shelves = fy.extraShelves(await fy.signals(await h.podListens(GUID), h.lovedOn(GUID), m, NOW));
  console.log('extra shelves', shelves.length);
  for (const sh of shelves) {
    const cards: string[] = [];
    for (const card of sh.cards) cards.push(`${card.kind} ${card.title} ${lettersOf(card.tracks, tracks)}`);
    console.log('shelf', sh.title, '|', cards.join(' / '));
  }
  attachDeep(m, null);
  console.log('tier 1 again', letters(genius(m, alpha, 12)) === letters(t1), 'shelves', fy.extraShelves(await fy.signals(await h.podListens(GUID), h.lovedOn(GUID), m, NOW)).length);
  // Settings › Recommendations: one line per source, from disk (the clock: three days after the similar artists' file was written)
  fs.writeText(`${dir}/similar-artists.jsonl`, '{"artist":"alpha one","at":1,"similar":[]}\n{"artist":"bravo one","at":1,"similar":[]}\n');
  const at = fs.stat(`${dir}/similar-artists.jsonl`).mtimeMs / 1000 + 3 * DAY;
  h.set('lastfm.newest', `${at - 2 * DAY}`);
  d.syncedAt = at - 3600;
  console.log(prep.historyLine(h, at));
  console.log(prep.similarLine(await prep.similarKnown(dir), at));
  console.log(prep.museLine(d, tracks, true, at));
  console.log(prep.thousands(38882), prep.thousands(999), prep.thousands(1234567));
  h.close();
}

main();
