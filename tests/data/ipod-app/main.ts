// zinc:ipod end to end on a fake iPod (tests/t1/ipod_plugin.sh makes it: a folder with iPod_Control/Device/SysInfo, and
// ZINC_IPOD_ROOTS pointing at its parent): the same lines on every engine.
import * as ipod from 'zinc:ipod';
import * as sys from 'zinc:sys';

async function main(): Promise<void> {
  const song = sys.env('IPOD_SONG');
  let pod: ipod.Device | null = null;   // a real iPod plugged into the machine is listed too
  for (const p of await ipod.detect()) if (p.mountpoint.endsWith('/ZINCPOD')) pod = p;
  if (pod === null) { console.log('no fake iPod'); return; }
  console.log('detected', pod.model, pod.checksum, 'database', pod.hasDatabase);
  const d = await ipod.open(pod.mountpoint, true, '', 'Zinc Pod');
  console.log('opened', d.name, 'sysinfo', d.sysInfoExtended, 'free > 0', d.freeBytes > 0);
  let phases = 0;
  ipod.onProgress((phase: string, done: i32, total: i32, detail: string) => { if (phase === 'add') phases++; });
  const res = await ipod.add([song, song + '.flac'], 'Mix');
  console.log('added', res[0].error === '', 'refused', res[1].error);
  const more = await ipod.addWith([{ file: song, title: 'Override', rating: 4, mediaType: 'podcast' }]);
  console.log('addWith', more[0].error === '', 'progress', phases > 0);
  const ts = await ipod.tracks();
  for (const t of ts) console.log('track', t.title, t.artist, t.trackNr, t.tracks, t.rating, t.mediaType, t.durationMs > 1500);
  for (const p of await ipod.playlists()) console.log('playlist', p.name, p.master, p.podcasts, p.trackIds.length);
  const u = await ipod.update(ts[0].id, { file: '', genre: 'Test' });
  console.log('updated', u.genre, u.title);
  await ipod.save();
  console.log('snapshots', (await ipod.snapshots()).length > 0);
  const c = await ipod.check();
  console.log('check', c.missing.length, c.orphans.length);
  let tracksLine = '';
  for (const it of await ipod.specs()) if (it.group === 'Library' && it.name === 'Tracks') tracksLine = it.value;
  console.log('specs tracks', tracksLine, 'firmware', d.firmware, d.connection);
  const pic = await ipod.artwork(ts[0].id, 64);
  console.log('artwork', pic.width, await ipod.cover(ts[0].id, 64));
  const folder = await ipod.backup('', false);
  const list = await ipod.backups();
  console.log('backups', list.length, list[0].folder === folder, list[0].auto, list[list.length - 1].auto);
  const counted = await ipod.played([{ id: ts[0].id, count: 2, at: 1700000000 }, { id: 'ffffffffffffffff', count: 1, at: 1700000000 }]);
  console.log('played', counted.length, counted[0].playCount, counted[0].lastPlayed);
  // smart playlists: the evaluator in TypeScript and libgpod agree on a table of rules; rules read back; refilled after a play
  const bpm = await ipod.update(ts[0].id, { file: '', bpm: 124 });
  console.log('bpm', bpm.bpm, 'skips', bpm.skipCount, bpm.lastSkipped);
  const one = (field: string, action: string, value: number, value2: number, units: string, text: string): ipod.SmartRule =>
    ({ field: field, action: action, value: value, value2: value2, units: units, text: text });
  const rules = (match: string, rs: ipod.SmartRule[], type: string, n: number, sort: string): ipod.SmartRules =>
    ({ match: match, rules: rs, limit: { type: type, value: n, sort: sort }, liveUpdate: true, checkedOnly: false, refreshable: true });
  const table: ipod.SmartRules[] = [
    rules('all', [one('bpm', 'inRange', 130, 120, '', '')], 'none', 0, ''),
    rules('all', [one('bpm', 'notInRange', 100, 110, '', '')], 'none', 0, ''),
    rules('all', [one('playCount', 'is', 0, 0, '', '')], 'none', 0, ''),
    rules('all', [one('playCount', 'greaterThan', 1, 0, '', '')], 'none', 0, ''),
    rules('all', [one('rating', 'lessThan', 4, 0, '', '')], 'none', 0, ''),
    rules('all', [one('rating', 'isNot', 4, 0, '', '')], 'none', 0, ''),
    rules('all', [one('title', 'is', 0, 0, '', 'OVERRIDE')], 'none', 0, ''),
    rules('all', [one('title', 'contains', 0, 0, '', 'on')], 'none', 0, ''),
    rules('all', [one('title', 'startsWith', 0, 0, '', 'so')], 'none', 0, ''),
    rules('all', [one('title', 'doesNotEndWith', 0, 0, '', 'ide')], 'none', 0, ''),
    rules('all', [one('genre', 'isNot', 0, 0, '', 'test')], 'none', 0, ''),
    rules('all', [one('lastPlayed', 'greaterThan', 1600000000, 0, '', '')], 'none', 0, ''),
    rules('all', [one('lastPlayed', 'notLessThan', 1700000000, 0, '', '')], 'none', 0, ''),
    rules('all', [one('lastPlayed', 'inRange', 1650000000, 1750000000, '', '')], 'none', 0, ''),
    rules('all', [one('lastPlayed', 'inTheLast', 2, 0, 'weeks', '')], 'none', 0, ''),
    rules('all', [one('added', 'notInTheLast', 1, 0, 'days', '')], 'none', 0, ''),
    rules('all', [one('durationMs', 'greaterThan', 1000, 0, '', '')], 'none', 0, ''),
    rules('all', [one('videoKind', 'is', 1, 0, '', '')], 'none', 0, ''),
    rules('all', [one('videoKind', 'isNot', 4, 0, '', '')], 'none', 0, ''),
    rules('any', [one('rating', 'is', 4, 0, '', ''), one('bpm', 'is', 124, 0, '', '')], 'none', 0, ''),
    rules('all', [one('rating', 'is', 4, 0, '', ''), one('bpm', 'is', 124, 0, '', '')], 'none', 0, ''),
    rules('all', [], 'songs', 1, 'highestRating'),
    rules('all', [], 'songs', 1, 'mostOftenPlayed'),
    rules('all', [], 'songs', 1, 'leastOftenPlayed'),
    rules('all', [], 'songs', 1, 'title'),
    rules('all', [], 'MB', 1, 'lowestRating'),
  ];
  let agree = 0, roundTrip = 0;
  const made: string[] = [];
  for (let i = 0; i < table.length; i++) made.push(await ipod.createSmartPlaylist('Smart ' + i, table[i]));
  const all = await ipod.playlists(), now = await ipod.tracks();
  for (let i = 0; i < table.length; i++) for (const p of all) if (p.id === made[i]) {
    const want = ipod.evaluateSmart(table[i], now, all);
    if (want.join(',') === p.trackIds.join(',')) agree++; else console.log('differs', ipod.describeSmart(table[i]), want.join(','), '|', p.trackIds.join(','));
    if (ipod.describeSmart(p.rules, all) === ipod.describeSmart(table[i], all) && p.smart && p.rules.refreshable) roundTrip++;
  }
  console.log('smart agree', agree, 'of', table.length, 'rules read back', roundTrip);
  const unplayed = await ipod.createSmartPlaylist('Unplayed', rules('all', [one('playCount', 'is', 0, 0, '', '')], 'none', 0, ''));
  const size = async (id: string): Promise<i32> => { for (const p of await ipod.playlists()) if (p.id === id) return p.trackIds.length; return -1; };
  const before = await size(unplayed);
  await ipod.played([{ id: ts[1].id, count: 1, at: 1700000000 }]);
  console.log('unplayed', before, 'after a play', await size(unplayed), ipod.describeSmart((await ipod.playlists()).filter((p: ipod.Playlist) => p.id === unplayed)[0].rules));
  await ipod.setSmartRules(unplayed, rules('all', [one('playCount', 'greaterThan', 0, 0, '', '')], 'songs', 1, 'leastOftenPlayed'));
  await ipod.refreshSmartPlaylists();
  console.log('rules changed', await size(unplayed));
  try { await ipod.createSmartPlaylist('Bad', rules('all', [one('mood', 'is', 1, 0, '', '')], 'none', 0, '')); } catch (e) { console.log('bad rule:', (e as Error).message); }
  try { await ipod.setArtwork(ts[0].id, song); } catch (e) { console.log('bad cover:', (e as Error).message.indexOf('not an image') >= 0); }
  await ipod.close();
  try { await ipod.tracks(); } catch (e) { console.log('closed:', (e as Error).message); }
}
main();
