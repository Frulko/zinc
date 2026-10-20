// zinc:assets v2 (ZN-436): three groups loaded with byte progress, a handle that outlives its group, a group over the ram budget, the v1 calls
// through the packs, and every group unloaded at the end (zinc mem: nothing resident at exit). tests/t0/assets_groups.sh makes the assets.
import * as assets from 'zinc:assets';

async function load(g: string): Promise<void> {
  let last: f64 = -1;
  let monotone = true;
  let reports: i32 = 0;
  let ratio: f64 = 0;
  await assets.loadGroup(g, (p: assets.Progress) => {
    if (p.done < last) monotone = false;
    last = p.done;
    reports++;
    ratio = p.total > 0 ? p.done / p.total : 1;
  });
  console.log(g + ': ' + (reports > 1 ? 'several' : 'one') + ' reports, monotone ' + monotone + ', ends at ' + ratio + ', loaded ' + assets.isLoaded(g));
}

async function main(): Promise<void> {
  console.log('groups ' + assets.groups().join(' '));
  try { assets.get('level1/b.json'); } catch (e) { console.log((e as Error).message); }
  await load('boot');
  await load('level1');
  await load('level2');
  const s = assets.stats();
  console.log('resident ' + s.resident + ' of ' + s.budget + ', groups ' + s.groups + ', packs ' + s.packs + ', pending ' + s.pending);
  const h = assets.get('level1/b.json');
  console.log('handle ' + h.name + ': ' + h.text().trim() + ', ' + h.bytes().length + ' bytes');
  try { await assets.loadGroup('big'); } catch (e) { console.log((e as Error).message); }
  try { await assets.loadGroup('nope'); } catch (e) { console.log((e as Error).message); }
  console.log('v1: ' + assets.readText('boot/hello.txt').trim() + ', ' + assets.readBytes('level2/c.bin').length + ' bytes, exists ' + assets.exists('level1/a.bin') + ', ' + assets.list().length + ' names');
  assets.unloadGroup('level1');
  console.log('level1 unloaded: resident ' + assets.stats().resident + ', the handle still reads ' + h.text().trim());
  h.release();
  console.log('handle released: resident ' + assets.stats().resident);
  assets.unloadGroup('boot');
  assets.unloadGroup('level2');
  const e = assets.stats();
  console.log('all unloaded: resident ' + e.resident + ', peak ' + e.peak + ', groups ' + e.groups);
}
main();
