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
  try { await ipod.setArtwork(ts[0].id, song); } catch (e) { console.log('bad cover:', (e as Error).message.indexOf('not an image') >= 0); }
  await ipod.close();
  try { await ipod.tracks(); } catch (e) { console.log('closed:', (e as Error).message); }
}
main();
