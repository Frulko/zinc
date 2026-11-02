// Headless proof of the clustered generator (gen/wfc.ts, gen/cover.ts, gen/deposits.ts patches, herds in world.ts): the WFC answer breaks no adjacency rule on many seeds and sizes, the maps hold
// no object on void, water or mountain rock, required deposits lie within reach, deposits and animals come in groups (Clark-Evans index and the share in groups, against the scatter style),
// a patch is richest at its centre, and the scatter style is what it was (a pinned hash). The hash lines are the same on three engines. No window. Run from the repository root.
import * as fs from 'zinc:fs';
import { world, generate, tileI, tileJ } from '../../../examples/hamlet/src/world/world';
import { economy, loadEconomy } from '../../../examples/hamlet/src/world/economy';
import { terrain, GEN_CLUSTERED, GEN_SCATTER, copyTerrainParams } from '../../../examples/hamlet/src/gen/terrain';
import { PRESETS } from '../../../examples/hamlet/src/gen/presets';
import { Wfc, wfcViolations } from '../../../examples/hamlet/src/gen/wfc';
import { COVER_RULES } from '../../../examples/hamlet/src/gen/cover';
import { clarkEvans } from '../../../examples/hamlet/src/gen/clusters';
import { noise, hash } from '../../../examples/hamlet/src/world/noise';
import { snapshot, restore } from '../../../examples/hamlet/src/world/save';
import { stateHash } from '../../../examples/hamlet/src/world/hash';
import { START_RADIUS, GROVE_REACH, WATER_REACH, groveNeed, FIELD_TILES } from '../../../examples/hamlet/src/gen/start';
import { missions, loadMissions, applyMission } from '../../../examples/hamlet/src/world/missions';
import { BI_PLAIN } from '../../../examples/hamlet/src/gen/terrain';
import { MODEL_IDS } from '../../../examples/hamlet/src/view/models';
import { TERRAIN_GRASS, TERRAIN_WATER, TERRAIN_VOID, ROLE_NAMES, ROCK_DEPOSIT, MOUNTAIN_LEVEL, LODE_REACH, DEER_GONE } from '../../../examples/hamlet/src/constants';

loadEconomy(fs.readText('examples/hamlet/assets/economy.json'), MODEL_IDS, ROLE_NAMES);
loadMissions((path: string): string => fs.readText('examples/hamlet/assets/' + path));
world.autosave = false;
const SCATTER_HASH = 1626371057;                  // the scatter style's pinned hash: the generator before the clustered one gave 426146974; the start guarantee (gen/start.ts) changed these three villages (their start was short)
let failures = 0, digest = 0;
const bad: string[] = [];
function check(name: string, ok: boolean): void { console.log('hamlet generation: ' + name + (ok ? ' PASS' : ' FAIL')); if (!ok) failures++; }
const mix = (v: number): void => { digest = (Math.imul(digest, 31) + (v | 0)) >>> 0; };

// ---- WFC alone: random starting sets (every set holds the glue tile EDGE, as the cover's do), several sizes and seams ----
let violations = 0, forced = 0, restarts = 0;
for (const [w, h] of [[12, 12], [24, 24], [64, 64], [100, 70], [128, 128], [256, 256]]) for (let s = 0; s < (w >= 128 ? 1 : 4); s++) {
  const init: number[] = Array.from({ length: w * h }, (_v: number, t: number): number => {
    const r = noise((t % w) * .11 + s * 31, Math.floor(t / w) * .11), q = hash(t, s + 5);
    if (q < .02) return 0;                                      // a hole: not part of the problem
    return r > .6 ? 12 : r > .4 ? 1 | 4 | 8 : r > .25 ? 1 | 2 | 4 | 32 : 1 | 4 | 16;
  });
  const wfc = new Wfc(w, h, COVER_RULES, init, (t: number, k: number): number => 1 + hash(t, k + s) * 2, 100 + s);
  wfc.solveAll(64);
  violations += wfcViolations(wfc); forced += wfc.forced; restarts += wfc.restarts;
  for (let t = 0; t < w * h; t += 7) mix(wfc.tile(t));
}
check('the WFC answer breaks no adjacency rule (many sizes, chunk seams, holes)', violations === 0);
check('no cell had to break a rule', forced === 0);
console.log('hamlet generation: wfc repairs ' + restarts);

// ---- generated worlds ----
const sizes = [12, 24, 64, 128];
class Stat { ce: number[] = []; grouped: number = 0; total: number = 0; inner: number = 0; innerN: number = 0; outer: number = 0; outerN: number = 0; herd: number = 0; animals: number = 0; }
const stat: Stat[] = [new Stat(), new Stat()];       // scatter, clustered
function inGroup(xs: number[], ys: number[], k: number, reach: number): number {
  let n = 0;
  for (let a = 0; a < xs.length; a++) { let near = 0; for (let b = 0; b < xs.length; b++) if (b !== a && Math.abs(xs[a] - xs[b]) <= reach && Math.abs(ys[a] - ys[b]) <= reach) near++; if (near >= k) n++; }
  return n;
}
function judge(label: string): void {
  const n = world.size;
  for (let t = 0; t < n * n; t++) {
    const rock = world.rock[t], tree = world.tree[t], deco = world.deco[t], water = world.terrain[t] === TERRAIN_WATER, voidT = world.terrain[t] === TERRAIN_VOID;
    if ((rock > 0 || tree > 0 || deco > 0) && (voidT || water)) { if (bad.length < 8) bad.push(label + ': object on void/water at ' + t); }
    if (label.indexOf('clustered') === 0 && (rock >= ROCK_DEPOSIT || tree > 0) && world.height[t] >= MOUNTAIN_LEVEL) { if (bad.length < 8) bad.push(label + ': object on mountain rock at ' + t); }
    if (rock >= ROCK_DEPOSIT && world.lode[t] <= 0) { if (bad.length < 8) bad.push(label + ': deposit with no amount at ' + t); }
  }
  for (const d of world.deer) if (d.state !== DEER_GONE) mix(Math.round(d.x * 10) + Math.round(d.y * 10) * 7);
  for (let t = 0; t < n * n; t += 3) mix(world.tree[t] * 5 + world.rock[t] * 3 + world.deco[t] + world.height[t] * 17 + world.lode[t]);
}
function measure(style: number, size: number, seed: number, preset: number): void {
  const p = copyTerrainParams(PRESETS[preset].params);
  p.genStyle = style;
  generate(seed, size, p);
  judge((style === GEN_CLUSTERED ? 'clustered ' : 'scatter ') + PRESETS[preset].label + ' ' + size + ' seed ' + seed);
  const st = stat[style], n = world.size, gi = tileI(world.gate), gj = tileJ(world.gate);
  const kinds = economy.deposits.length;
  for (let k = 0; k < kinds; k++) {
    if (!economy.deposits[k].active) continue;
    const xs: number[] = [], ys: number[] = [];
    for (let t = 0; t < n * n; t++) if (world.rock[t] === ROCK_DEPOSIT + k) { xs.push(tileI(t)); ys.push(tileJ(t)); }
    if (xs.length >= 4) st.ce.push(clarkEvans(xs, ys, n * n));
    st.grouped += inGroup(xs, ys, 2, 2); st.total += xs.length;
    for (let a = 0; a < xs.length; a++) {                      // inner tiles (three same-kind tiles beside them) against the rim
      let near = 0;
      for (let b = 0; b < xs.length; b++) if (b !== a && Math.abs(xs[a] - xs[b]) <= 1 && Math.abs(ys[a] - ys[b]) <= 1) near++;
      const amount = world.lode[ys[a] * n + xs[a]] / economy.deposits[k].amount;
      if (near >= 3) { st.inner += amount; st.innerN++; } else if (near <= 1) { st.outer += amount; st.outerN++; }
    }
    if (economy.deposits[k].required && size >= 24) {            // a required deposit lies within reach of the gate
      let reach = false;
      for (let t = 0; t < n * n; t++) if (world.rock[t] === ROCK_DEPOSIT + k && Math.abs(tileI(t) - gi) + Math.abs(tileJ(t) - gj) <= LODE_REACH) reach = true;
      if (!reach) bad.push('required deposit ' + k + ' out of reach: ' + size + ' seed ' + seed + ' ' + PRESETS[preset].label);
    }
  }
  for (let sp = 0; sp < 3; sp++) {                             // animals: the share with two others of their species within four tiles
    const xs: number[] = [], ys: number[] = [];
    for (const d of world.deer) if (d.state !== DEER_GONE && d.species === sp) { xs.push(Math.floor((d.x + world.half) / 2)); ys.push(Math.floor((d.y + world.half) / 2)); }
    st.herd += inGroup(xs, ys, 2, 4); st.animals += xs.length;
  }
}
for (const size of sizes) for (const preset of [0, 1, 3, 5, 6]) for (let s = 0; s < (size >= 128 ? 1 : 2); s++) for (const style of [GEN_SCATTER, GEN_CLUSTERED]) measure(style, size, 7 + s * 131 + preset * 17, preset);
check('no object on void, water or mountain rock; every deposit has an amount; required deposits within reach', bad.length === 0);
for (const line of bad) console.log('hamlet generation: ' + line);
const mean = (v: number[]): number => v.length === 0 ? 1 : v.reduce((a: number, b: number): number => a + b, 0) / v.length;
const sc = stat[0], cl = stat[1];
console.log('hamlet generation: Clark-Evans R of deposits: scatter ' + mean(sc.ce).toFixed(2) + ' (' + sc.ce.length + ' sets), clustered ' + mean(cl.ce).toFixed(2) + ' (' + cl.ce.length + ' sets)');
console.log('hamlet generation: deposits in a patch of 3+: scatter ' + Math.round(100 * sc.grouped / Math.max(1, sc.total)) + '%, clustered ' + Math.round(100 * cl.grouped / Math.max(1, cl.total)) + '%');
console.log('hamlet generation: animals with two herd mates within 4 tiles: scatter ' + Math.round(100 * sc.herd / Math.max(1, sc.animals)) + '%, clustered ' + Math.round(100 * cl.herd / Math.max(1, cl.animals)) + '%');
check('clustered deposits are clumped (R well below the scatter one)', mean(cl.ce) < mean(sc.ce) - .15 && mean(cl.ce) < .85);
check('more deposits stand in patches than with the scatter style', cl.grouped / Math.max(1, cl.total) > sc.grouped / Math.max(1, sc.total) + .25);
check('animals stand in herds more than with the scatter style', cl.herd / Math.max(1, cl.animals) > sc.herd / Math.max(1, sc.animals) + .15);
const innerMean = cl.inner / Math.max(1, cl.innerN), outerMean = cl.outer / Math.max(1, cl.outerN);
console.log('hamlet generation: patch richness (share of the nominal amount): centre ' + innerMean.toFixed(2) + ' (' + cl.innerN + '), rim ' + outerMean.toFixed(2) + ' (' + cl.outerN + ')');
check('a patch is richest in the middle (richness gradient)', cl.innerN > 5 && cl.outerN > 5 && innerMean > outerMean + .1);

// ---- the cover solver left nothing broken on the real maps ----
let coverForced = 0, coverRestarts = 0;
for (const size of [24, 64, 128, 256]) for (const preset of [0, 6]) {
  const p = copyTerrainParams(PRESETS[preset].params);
  p.tile = 2; p.clearI = 0; p.clearJ = size >> 1; p.clearR = 2;
  const l = terrain(3 + size, size, size, p);
  coverForced += l.wfcForced; coverRestarts += l.wfcRestarts;
}
check('the cover of real maps (24 to 256) was solved with no rule broken', coverForced === 0);
console.log('hamlet generation: cover repairs on real maps ' + coverRestarts);

// ---- the start guarantee: flat bare buildable ground reachable from the gate, a grove, water or fields in reach, on every preset, size and style, and the six missions ----
function startProblems(label: string): string {
  const n = world.size, gi = tileI(world.gate), gj = tileJ(world.gate), level = world.height[world.gate];
  const seen: number[] = Array.from({ length: n * n }, (): number => 0), queue: number[] = [world.gate];
  seen[world.gate] = 1;
  let count = 0, land = 0;
  const flatAt = (t: number): boolean => { for (let d = 0; d < 4; d++) { const i = tileI(t) + (d === 0 ? 1 : d === 1 ? -1 : 0), j = tileJ(t) + (d === 2 ? 1 : d === 3 ? -1 : 0); if (i < 0 || j < 0 || i >= n || j >= n) continue; const u = j * n + i; if (world.terrain[u] === TERRAIN_GRASS && world.height[u] !== world.height[t]) return false; } return true; };
  for (let t = 0; t < n * n; t++) if (world.terrain[t] === TERRAIN_GRASS && Math.abs(tileI(t) - gi) + Math.abs(tileJ(t) - gj) <= START_RADIUS) land++;
  while (queue.length > 0) {
    const t = queue.pop() as number;
    if (world.tree[t] === 0 && world.rock[t] === 0 && flatAt(t)) count++;
    for (let d = 0; d < 4; d++) {
      const i = tileI(t) + (d === 0 ? 1 : d === 1 ? -1 : 0), j = tileJ(t) + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (i < 0 || j < 0 || i >= n || j >= n || Math.abs(i - gi) + Math.abs(j - gj) > START_RADIUS) continue;
      const u = j * n + i;
      if (seen[u] === 1 || world.terrain[u] !== TERRAIN_GRASS || world.tree[u] !== 0 || world.rock[u] !== 0 || world.height[u] !== level) continue;
      seen[u] = 1; queue.push(u);
    }
  }
  let trees = 0, water = 0, fields = 0;
  for (let t = 0; t < n * n; t++) {
    const d = Math.abs(tileI(t) - gi) + Math.abs(tileJ(t) - gj);
    if (d <= GROVE_REACH && world.tree[t] !== 0) trees++;
    if (d <= WATER_REACH && world.terrain[t] === TERRAIN_WATER) water++;
    if (d <= GROVE_REACH && world.biome[t] === BI_PLAIN && world.terrain[t] === TERRAIN_GRASS) fields++;
  }
  const need = Math.min(60 + Math.max(0, (n - 24) >> 3), Math.floor(Math.max(land, 1) * .45));
  const out: string[] = [];
  if (count < need) out.push('start area ' + count + ' < ' + need);
  if (trees < groveNeed(n)) out.push('no grove (' + trees + ' trees)');
  if (water === 0 && fields < FIELD_TILES) out.push('no water or fields');
  return out.length === 0 ? '' : label + ': ' + out.join(', ');
}
const startBad: string[] = [];
for (const size of [12, 24, 32, 48, 64, 128]) for (let preset = 0; preset < PRESETS.length; preset++) for (let s = 0; s < (size >= 128 ? (preset === 0 || preset === 6 ? 1 : 0) : 3); s++) for (const style of [GEN_SCATTER, GEN_CLUSTERED]) {
  const p = copyTerrainParams(PRESETS[preset].params);
  p.genStyle = style;
  generate(300 + s * 71 + preset * 13 + size, size, p);
  const why = startProblems((style === GEN_CLUSTERED ? 'clustered ' : 'scatter ') + PRESETS[preset].label + ' ' + size + ' seed ' + world.seed);
  if (why !== '' && startBad.length < 10) startBad.push(why);
}
for (const m of missions) {
  applyMission(m.id); generate(m.seed, m.size, copyTerrainParams(m.params));
  const why = startProblems('mission ' + m.id);
  if (why !== '' && startBad.length < 10) startBad.push(why);
}
applyMission('');
check('every preset, size, style and mission has a flat start area, a grove and water or fields in reach', startBad.length === 0);
for (const line of startBad) console.log('hamlet generation: ' + line);
let repairs = 0, flattened = 0;
const mountainTrials = 40;
for (const style of [GEN_SCATTER, GEN_CLUSTERED]) {
  repairs = 0; flattened = 0;
  for (let s = 0; s < mountainTrials; s++) {
    const size = [24, 32, 48, 64][s % 4], p = copyTerrainParams(PRESETS[6].params);
    p.genStyle = style; p.tile = 2; p.clearI = 0; p.clearJ = size >> 1; p.clearR = 2;
    const l = terrain(1000 + s * 37, size, size, p);
    if ((l.startRepair & 16) !== 0) repairs++;
    if ((l.startRepair & 3) === 2) flattened++;
  }
  console.log('hamlet generation: Montagnes start guarantee failed before the repair on ' + repairs + '/' + mountainTrials + ' (' + flattened + ' flattened) with the ' + (style === GEN_CLUSTERED ? 'clustered' : 'scatter') + ' style');
}

// ---- the scatter style is what it was: a pinned hash of the first villages, and a save keeps its style ----
let old = 0;
for (const [size, seed, preset] of [[24, 5, 8], [24, 9, 8], [64, 21, 8]]) {
  const p = copyTerrainParams(PRESETS[preset].params);
  generate(seed, size, p);
  for (let t = 0; t < size * size; t++) old = (Math.imul(old, 31) + world.tree[t] * 7 + world.rock[t] * 5 + world.deco[t] * 3 + world.lode[t] + world.height[t] * 11) >>> 0;
  old = (Math.imul(old, 31) + world.deer.length) >>> 0;
}
console.log('hamlet generation: scatter hash ' + old);
check('the scatter style still gives the villages it always gave', old === SCATTER_HASH);
const q = copyTerrainParams(PRESETS[0].params);
generate(11, 24, q);
const saved = snapshot(), h1 = stateHash() >>> 0;
generate(2, 24, copyTerrainParams(PRESETS[8].params));
check('a clustered village survives a save', restore(saved) && world.params.genStyle === GEN_CLUSTERED && (stateHash() >>> 0) === h1);
console.log('hamlet generation: hash ' + digest);
console.log(failures === 0 ? 'hamlet generation: ALL PASS' : 'hamlet generation: ' + failures + ' FAIL');
