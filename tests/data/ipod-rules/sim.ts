// The actual in-memory stand-in, never a mounted device or native library.
import N from '../../../plugins/ipod/native/ipod.sim';
import { emptyRules } from '../../../plugins/ipod/smart';
async function main(): Promise<void> {
  await N.open('/Volumes/ZINCPOD', false, '', '');
  const added = await N.add([{ file: 'fake.mp3', mediaType: 'podcast', grouping: 'Live', compilation: true }], '');
  const tracks = await N.tracks();
  console.log('sim', added[0].error === '', tracks[0].checked, tracks[0].mediaBits, tracks[0].grouping, tracks[0].compilation);
  const rules = emptyRules(); rules.checkedOnly = true;
  rules.rules.push({ field: 'grouping', action: 'contains', text: 'live', value: 0, value2: 0, units: '' });
  const id = await N.createSmartPlaylist('Live', rules);
  const lists = await N.playlists();
  for (const p of lists) if (p.id === id) console.log('members', p.trackIds.length);
  await N.close();
}
main();
