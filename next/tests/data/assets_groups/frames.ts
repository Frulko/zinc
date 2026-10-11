// zinc:assets v2 (ZN-436) in a frame loop: three groups load one after the other while a bar draws their progress; a line per frame where
// it moved. Under ZINC_DETERMINISTIC=1 every run prints the same lines and frame hashes (tests/t0/assets_groups.sh).
import * as gfx from 'zinc:gfx';
import * as assets from 'zinc:assets';

let done: f64 = 0;
let total: f64 = 1;
let shown: f64 = -1;
let group = '';
async function loadAll(): Promise<void> {
  for (const g of ['boot', 'level1', 'level2']) {
    group = g;
    await assets.loadGroup(g, (p: assets.Progress) => { done = p.done; total = p.total; });
    console.log('frame ' + gfx.frame() + ': ' + g + ' loaded');
  }
}
loadAll();
gfx.onFrame((dt: number) => {
  gfx.clear(0x101418ff);
  gfx.rect(10, 50, 300 * done / total, 20, 0x3fb950ff);
  if (done !== shown) { shown = done; console.log('frame ' + gfx.frame() + ': ' + group + ' ' + done + ' of ' + total); }
});
