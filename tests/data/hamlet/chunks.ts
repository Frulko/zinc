// Headless proof of the incremental static bake: panning and changing a tile redo only strips and rectangles, and the result equals a full bake. No window.
import { W, H, bakedPix, bakedZ, kinds, groundZ, staticShadow } from '../../../examples/hamlet/src/pixel';
import { world, generate, tileIndex } from '../../../examples/hamlet/src/world/world';
import { applyTool } from '../../../examples/hamlet/src/rules/build';
import { loadEconomy, economy } from '../../../examples/hamlet/src/world/economy';
import { MODEL_IDS } from '../../../examples/hamlet/src/view/models';
import { tufts, bakeVillage, rebakeStatic, moveCamera, setZoom, forceFullBake, bakeStats, bakeCount, stepSeason, pendingWork } from '../../../examples/hamlet/src/view/scenery';
import { useBiomes } from '../../../examples/hamlet/src/view/seasons';
import { camera } from '../../../examples/hamlet/src/view/camera';
import { TOOL_ROAD, TOOL_HOUSE, TOOL_ERASE, ROLE_NAMES } from '../../../examples/hamlet/src/constants';
import * as fs from 'zinc:fs';

loadEconomy(fs.readText('examples/hamlet/assets/economy.json'), MODEL_IDS, ROLE_NAMES);
useBiomes(fs.readText('examples/hamlet/assets/biomes.json'));
let failures = 0;
function check(name: string, ok: boolean): void { console.log('hamlet chunks: ' + name + (ok ? ' PASS' : ' FAIL')); if (!ok) failures++; }

class Snap { tufts: number[] = []; pix: u32[] = []; z: number[] = []; kinds: number[] = []; gz: number[] = []; shadow: number[] = []; }
function snap(): Snap { const s = new Snap(); s.tufts = tufts.slice().sort((a: number, b: number): number => a - b); s.pix = bakedPix.slice(); s.z = bakedZ.slice(); s.kinds = kinds.slice(); s.gz = groundZ.slice(); s.shadow = staticShadow.slice(); return s; }
/** Pixels that differ, not counting the four-pixel border of the window (its occlusion has no neighbours to read, in a full bake as in a slid one). */
function diff(a: Snap, b: Snap): number {
  let n = a.tufts.length === b.tufts.length ? 0 : 1000;
  for (let k = 0; k < a.tufts.length && n < 1000; k++) if (a.tufts[k] !== b.tufts[k]) n++;
  for (let y = 5; y < H - 5; y++) for (let x = 5; x < W - 5; x++) {
    const i = y * W + x;
    if (a.pix[i] !== b.pix[i] || Math.abs(a.z[i] - b.z[i]) > 1e-9 || a.kinds[i] !== b.kinds[i] || Math.abs(a.gz[i] - b.gz[i]) > 1e-9 || a.shadow[i] !== b.shadow[i]) n++;
  }
  return n;
}
/** The incremental result, then a full bake of the same camera and village: how many pixels differ. */
function againstFull(): number {
  const inc = snap();
  forceFullBake(); rebakeStatic();
  return diff(inc, snap());
}

function village(size: number): void {
  world.autosave = false; generate(7916, size);
  const mid = Math.floor(size / 2);
  for (let t = 0; t < size * size; t++) { if (t % 7 === 0) world.tree[t] = 0; }
  for (let i = 1; i < 9; i++) applyTool(TOOL_ROAD, tileIndex(i, mid));
  applyTool(TOOL_HOUSE, tileIndex(3, mid - 1)); applyTool(TOOL_HOUSE, tileIndex(5, mid + 1));
  bakeVillage();
}

for (const [size, zoom] of [[12, 5], [48, 5], [48, 10]]) {
  village(size);
  if (zoom !== 5) setZoom(zoom);
  const fullMs0 = bakeStats.lastMs;
  let worst = 0;
  for (const [dx, dy] of [[23, -7], [-41, 15], [0, 9], [-3, -30], [60, 40]]) {
    const before = bakeStats.partial, full = bakeStats.full;
    moveCamera(dx, dy);
    const moved = bakeStats.partial > before || bakeStats.full > full;
    const d = againstFull();
    if (d > worst) worst = d;
    if (!moved && d > 0) worst = 99999;
  }
  check(size + 'x' + size + ' zoom ' + zoom + ': panning equals a full bake (worst pixel difference ' + worst + ')', worst === 0);
  const partialBefore = bakeStats.partial, fullBefore = bakeStats.full;
  const did = moveCamera(17, 11);     // a village smaller than the window cannot be panned
  if (did) check(size + 'x' + size + ' zoom ' + zoom + ': a pan is a strip bake, not a full one (' + bakeStats.lastMs + ' ms, a full bake took ' + fullMs0 + ' ms)', bakeStats.partial === partialBefore + 1 && bakeStats.full === fullBefore);
  forceFullBake(); rebakeStatic();

  const mid = Math.floor(size / 2);
  let changes = 0;
  const edits: (() => void)[] = [
    (): void => { applyTool(TOOL_HOUSE, tileIndex(6, mid - 1)); },
    (): void => { for (let i = 9; i < 12; i++) applyTool(TOOL_ROAD, tileIndex(i, mid)); },
    (): void => { applyTool(TOOL_ERASE, tileIndex(3, mid - 1)); },
    (): void => { world.tree[tileIndex(2, mid + 2)] = 0; world.rock[tileIndex(2, mid + 2)] = 1; world.revision++; },
  ];
  let worstChange = 0, partialRuns = 0;
  for (const edit of edits) {
    const f = bakeStats.full;
    edit(); rebakeStatic();
    if (bakeStats.full === f) partialRuns++;
    const d = againstFull();
    if (d > worstChange) worstChange = d;
    changes++;
  }
  check(size + 'x' + size + ' zoom ' + zoom + ': ' + changes + ' edits equal a full bake (worst ' + worstChange + ' pixels), ' + partialRuns + ' of them baked a few rectangles', worstChange === 0 && partialRuns >= 2);
  const g = bakeStats.partial;
  applyTool(TOOL_HOUSE, tileIndex(7, mid - 1)); const t0 = Date.now(); rebakeStatic(); const buildMs = Date.now() - t0;
  console.log('hamlet chunks: ' + size + 'x' + size + ' zoom ' + zoom + ' window ' + W + 'x' + H + ': build ' + buildMs + ' ms (' + (bakeStats.partial > g ? 'rectangles' : 'full') + ')');
  forceFullBake(); const f0 = Date.now(); rebakeStatic(); console.log('hamlet chunks: ' + size + 'x' + size + ' zoom ' + zoom + ' full bake ' + (Date.now() - f0) + ' ms');
}
// the seasons: every season change is baked a band at a time, and the picture it ends on equals a full bake of the new season (and differs from the old one)
{
  village(48);
  const before = snap();
  let seen = 0, winter = before;
  let spring = before;
  for (const month of [1, 4, 7, 10, 1]) {         // spring, summer, autumn, winter, spring again
    world.tick = Math.round(month * 15 / (1 / 32)) + 8;
    const was = bakeCount;
    for (let n = 0; n < 200 && (n === 0 || pendingWork()); n++) stepSeason();
    seen += bakeCount - was;
    const d = againstFull();
    if (month === 10) winter = snap();
    if (month === 1 && spring === before) spring = snap();
    check('season of month ' + month + ': the bands end on a full bake of the season (' + d + ' pixels differ)', d === 0);
  }
  check('winter does not look like spring, spring comes back to the same picture, and a change took more than one bake', diff(spring, winter) > 1000 && diff(spring, snap()) === 0 && seen > 8);
  world.tick = 0;
}
console.log(failures === 0 ? 'hamlet chunks: ALL PASS' : 'hamlet chunks: ' + failures + ' FAIL');
