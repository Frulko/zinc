// zinc:assets v2 (ZN-436): a pack mounted in front of the base packs (a mod) overrides their entries, for the v1 calls and for a group load;
// what it does not hold still comes from the base. tests/t0/assets_groups.sh builds mods/level1.zpk.
import * as assets from 'zinc:assets';

async function main(): Promise<void> {
  console.log('before: ' + assets.readText('level1/b.json').trim());
  console.log('mounted ' + assets.mount('mods'));
  console.log('after: ' + assets.readText('level1/b.json').trim());
  await assets.loadGroup('level1');
  console.log('loaded: ' + assets.get('level1/b.json').text().trim() + ', a.bin ' + assets.get('level1/a.bin').bytes().length + ' bytes from the base');
  try { assets.mount('nothing.zpk'); } catch (e) { console.log((e as Error).message); }
}
main();
