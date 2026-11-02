// By hand, never in a tier: how long the terrain generator takes (scatter against clustered) and how long one 64 x 64 WFC chunk takes, at 64 to 1024 tiles a side. Run from the repository root.
import { terrain, GEN_SCATTER, GEN_CLUSTERED, copyTerrainParams } from '../../../examples/hamlet/src/gen/terrain';
import { PRESETS } from '../../../examples/hamlet/src/gen/presets';
import { Wfc } from '../../../examples/hamlet/src/gen/wfc';
import { COVER_RULES } from '../../../examples/hamlet/src/gen/cover';
import * as fs from 'zinc:fs';
import { world, generate } from '../../../examples/hamlet/src/world/world';
import { loadEconomy } from '../../../examples/hamlet/src/world/economy';
import { MODEL_IDS } from '../../../examples/hamlet/src/view/models';
import { ROLE_NAMES } from '../../../examples/hamlet/src/constants';
import { noise } from '../../../examples/hamlet/src/world/noise';

loadEconomy(fs.readText('examples/hamlet/assets/economy.json'), MODEL_IDS, ROLE_NAMES);
world.autosave = false;
for (const size of [64, 128, 256]) {                       // the whole generate(): terrain, deposits, animals (the game's largest map is 256)
  const line: string[] = ['generate ' + size];
  for (const style of [GEN_SCATTER, GEN_CLUSTERED]) { const p = copyTerrainParams(PRESETS[6].params); p.genStyle = style; const a = performance.now(); generate(5, size, p); line.push((style === GEN_CLUSTERED ? 'clustered ' : 'scatter ') + Math.round(performance.now() - a) + ' ms, ' + world.deer.length + ' animals'); }
  console.log(line.join(', '));
}
for (const size of [64, 128, 256, 1024]) {
  const line: string[] = ['size ' + size];
  for (const style of [GEN_SCATTER, GEN_CLUSTERED]) {
    const p = copyTerrainParams(PRESETS[6].params);
    p.genStyle = style; p.tile = 2; p.clearI = 0; p.clearJ = size >> 1; p.clearR = 2;
    const a = performance.now();
    const l = terrain(5, size, size, p);
    line.push((style === GEN_CLUSTERED ? 'clustered ' : 'scatter ') + Math.round(performance.now() - a) + ' ms' + (style === GEN_CLUSTERED ? ' (repairs ' + l.wfcRestarts + ', forced ' + l.wfcForced + ')' : ''));
  }
  console.log(line.join(', '));
}
// one chunk at a time on a 1024 map: the worst slice
const n = 1024, init: number[] = Array.from({ length: n * n }, (_v: number, t: number): number => { const r = noise((t % n) * .05, Math.floor(t / n) * .05); return r > .6 ? 12 : r > .4 ? 13 : 39; });
const wfc = new Wfc(n, n, COVER_RULES, init, (_t: number, _k: number): number => 1, 9);
let worst = 0, total = 0;
for (let j = 0; j < n; j += 64) for (let i = 0; i < n; i += 64) {
  const a = performance.now();
  wfc.solveChunk(i, j, i + 64, j + 64);
  const d = performance.now() - a; total += d; if (d > worst) worst = d;
}
console.log('1024 x 1024 WFC alone: 256 chunks, worst slice ' + Math.round(worst) + ' ms, total ' + Math.round(total) + ' ms, repairs ' + wfc.restarts + ', forced ' + wfc.forced);
