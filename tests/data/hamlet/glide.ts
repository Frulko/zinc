// Headless proof of the zoom glide: a level baked a few ms a frame in the second buffer set and then swapped in is the same picture as a zoom step that rebakes the window at once.
// The pixels, the depth, the ground, the shadows, the wind's tufts and the edged picture are compared, at several sizes and levels, then a glide sent back and one retargeted.
import { W, H, pix, zb, bakedPix, bakedZ, kinds, ground, groundZ, staticShadow, shadeEdgesRect, copyInto } from '../../../examples/hamlet/src/pixel';
import { world, generate, tileIndex } from '../../../examples/hamlet/src/world/world';
import { applyTool } from '../../../examples/hamlet/src/rules/build';
import { loadEconomy } from '../../../examples/hamlet/src/world/economy';
import { MODEL_IDS } from '../../../examples/hamlet/src/view/models';
import { tufts, bakeVillage, setZoom, glideZoom, stepSeason, zooming, zoomScale, bakeInfo } from '../../../examples/hamlet/src/view/scenery';
import { useBiomes } from '../../../examples/hamlet/src/view/seasons';
import { camera } from '../../../examples/hamlet/src/view/camera';
import { TOOL_ROAD, TOOL_HOUSE, ROLE_NAMES } from '../../../examples/hamlet/src/constants';
import * as fs from 'zinc:fs';

loadEconomy(fs.readText('examples/hamlet/assets/economy.json'), MODEL_IDS, ROLE_NAMES);
useBiomes(fs.readText('examples/hamlet/assets/biomes.json'));
let failures = 0;
function check(name: string, ok: boolean): void { console.log('hamlet glide: ' + name + (ok ? ' PASS' : ' FAIL')); if (!ok) failures++; }

class Snap { w: number = 0; h: number = 0; level: number = 0; x: number = 0; y: number = 0; tufts: number[] = []; baked: u32[] = []; z: number[] = []; kinds: number[] = []; gz: number[] = []; ground: number[] = []; shadow: number[] = []; edged: u32[] = []; }
/** What the frame code does with a new bake (frame.ts prepare), for a bake that did not come with its edges. */
function snap(prepared: boolean): Snap {
  const s = new Snap();
  s.w = W; s.h = H; s.level = camera.level; s.x = camera.x; s.y = camera.y;
  s.tufts = tufts.slice().sort((a: number, b: number): number => a - b);
  s.baked = bakedPix.slice(); s.z = bakedZ.slice(); s.kinds = kinds.slice(); s.gz = groundZ.slice(); s.ground = ground.slice(); s.shadow = staticShadow.slice();
  if (prepared) s.edged = pix.slice();
  else { copyInto(pix, bakedPix); shadeEdgesRect(0, 0, W, H); s.edged = pix.slice(); }
  return s;
}
function diff(a: Snap, b: Snap): number {
  if (a.w !== b.w || a.h !== b.h || a.level !== b.level || a.x !== b.x || a.y !== b.y) return 1e6;
  let n = a.tufts.length === b.tufts.length ? 0 : 1000;
  for (let k = 0; k < a.tufts.length && n < 1000; k++) if (a.tufts[k] !== b.tufts[k]) n++;
  for (let i = 0; i < a.baked.length; i++) {
    if (a.baked[i] !== b.baked[i] || a.edged[i] !== b.edged[i] || Math.abs(a.z[i] - b.z[i]) > 1e-9 || a.kinds[i] !== b.kinds[i] || Math.abs(a.gz[i] - b.gz[i]) > 1e-9 || a.ground[i] !== b.ground[i] || a.shadow[i] !== b.shadow[i]) n++;
  }
  return n;
}

function village(size: number): void {
  world.autosave = false; generate(7916, size);
  const mid = Math.floor(size / 2);
  for (let t = 0; t < size * size; t++) { if (t % 7 === 0) world.tree[t] = 0; }
  for (let i = 1; i < 9; i++) applyTool(TOOL_ROAD, tileIndex(i, mid));
  applyTool(TOOL_HOUSE, tileIndex(3, mid - 1)); applyTool(TOOL_HOUSE, tileIndex(5, mid + 1));
  camera.level = 5; bakeVillage();
}
/** Steps the frames of a glide until it is over; the frame count it took. */
function runGlide(): number { let n = 0; while (zooming() && n < 4000) { stepSeason(); n++; } return n; }

for (const [size, level] of [[12, 4], [48, 2], [48, 9], [24, 0]]) {
  village(size); setZoom(level);
  const direct = snap(false);
  village(size);
  glideZoom(level);
  const frames = runGlide();
  const slid = snap(bakeInfo.prepared);
  const d = diff(direct, slid);
  check(size + 'x' + size + ' level ' + level + ': a glide equals the plain zoom step (' + d + ' differing pixels, ' + frames + ' frames, window ' + W + 'x' + H + ')', d === 0 && frames > 1 && zoomScale() === 1);
}
// back and forth: a glide sent back to the level on screen bakes nothing and ends on the first picture; a glide retargeted twice ends on the last level
{
  village(24);
  const first = snap(false);
  glideZoom(3); for (let k = 0; k < 4; k++) stepSeason();
  glideZoom(5); runGlide();
  check('a glide sent back ends on the level on screen', camera.level === 5 && zoomScale() === 1 && diff(first, snap(false)) === 0);
  glideZoom(4); for (let k = 0; k < 3; k++) stepSeason();
  glideZoom(2); runGlide();
  const retargeted = snap(bakeInfo.prepared);
  village(24); setZoom(2);
  const direct = snap(false);
  check('a glide retargeted on the way ends on the last level, the same picture (' + diff(direct, retargeted) + ' differing pixels)', camera.level === 2 && diff(direct, retargeted) === 0);
}
console.log(failures === 0 ? 'hamlet glide: ALL PASS' : 'hamlet glide: ' + failures + ' FAILED');
