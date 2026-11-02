// The Hamlet bot: a deterministic player that opens a village and works the campaign goals with plain heuristics, headless, at full simulation speed.
// It uses the rules API only (applyTool, the daily goal rewards) and prints a timeline: the day each goal is reached, the population, the stocks,
// who left, fires. A balance tool (docs/reports/hamlet-balance-2026-11-01.md) and the regression test of tests/t1/hamlet_bot.sh.
// Settings by environment: BOT_SEEDS="1,2,3" BOT_SIZES="24,40" BOT_PRESETS="0,3" BOT_DAYS=400 BOT_MODE=campaign|sandbox BOT_LEVEL=0|1|2 BOT_VERBOSE=1
import { env } from 'zinc:sys';
import * as fs from 'zinc:fs';
import { world, generate, tileIndex, tileI, tileJ, isOpen, neighbor } from '../../../examples/hamlet/src/world/world';
import { applyTool, checkTool, toolOf } from '../../../examples/hamlet/src/rules/build';
import { stepWorld } from '../../../examples/hamlet/src/engine/simulate';
import { population } from '../../../examples/hamlet/src/engine/villagers';
import { buildRoad, costOf } from '../../../examples/hamlet/src/rules/roadplan';
import { canPay } from '../../../examples/hamlet/src/rules/stock';
import { isUnlocked, scenarioWon } from '../../../examples/hamlet/src/rules/goals';
import { economy, loadEconomy, Bloom } from '../../../examples/hamlet/src/world/economy';
import { PRESETS } from '../../../examples/hamlet/src/gen/presets';
import { TOOL_ROAD, TOOL_ERASE, HOUSE, PLACE_OK, ROLE_NAMES, DAY_TICKS, DAY_SECONDS, BS_NO_SOURCE, DEER_GONE } from '../../../examples/hamlet/src/constants';
import { BI_PLAIN } from '../../../examples/hamlet/src/gen/terrain';
import { movePriority } from '../../../examples/hamlet/src/rules/labour';
import { capacityOf, housingReport } from '../../../examples/hamlet/src/rules/housing';

const ECONOMY_TEXT = fs.readText('examples/hamlet/assets/economy.json');
function modelIds(): string[] {                 // the model of each building, in file order (the part of the file after "buildings")
  const out: string[] = [];
  let at = ECONOMY_TEXT.indexOf('"buildings"');
  for (;;) {
    at = ECONOMY_TEXT.indexOf('"model": "', at);
    if (at < 0) break;
    at += 10;
    out.push(ECONOMY_TEXT.slice(at, ECONOMY_TEXT.indexOf('"', at)));
  }
  return out;
}
loadEconomy(ECONOMY_TEXT, modelIds(), ROLE_NAMES);
if (env('BOT_LABOUR') !== '') { economy.sim.labourShare = Number(env('BOT_LABOUR')); economy.sim.stopJobless = Number(env('BOT_STOPJOBLESS') === '' ? '100' : env('BOT_STOPJOBLESS')); }      // the labour pool of a Cité mission (sim.labourShare), to see the opening still works

const listOf = (name: string, fallback: string): number[] => (env(name) === '' ? fallback : env(name)).split(',').map((s: string): number => Number(s));
const MAX_DAYS = listOf('BOT_DAYS', '400')[0];
const SANDBOX = env('BOT_MODE') === 'sandbox';
const LEVEL = env('BOT_LEVEL') === '' ? 1 : Number(env('BOT_LEVEL'));       // economy.json difficulties: 0 easy, 1 normal, 2 hard
const VERBOSE = env('BOT_VERBOSE') === '1';

// ---- the plan: what the bot builds, in order. A house entry waits for the houses to fill; any other entry waits for its stock (and blocks the later ones) ----
class Want { id: string = ''; count: number = 0; constructor(id: string, count: number) { this.id = id; this.count = count; } }
const PLAN: Want[] = [
  new Want('house', 2), new Want('lumberhut', 1), new Want('sawmill', 1), new Want('house', 4), new Want('fishery', 1), new Want('house', 6), new Want('lumberhut', 2), new Want('farm', 1), new Want('lodge', 1), new Want('tannery', 1),
  new Want('smokehouse', 1), new Want('mill', 1), new Want('bakery', 1), new Want('market', 1), new Want('well', 1), new Want('house', 8), new Want('firehouse', 1),
  new Want('storehouse', 1), new Want('house', 10), new Want('forager', 1), new Want('apiary', 1), new Want('works', 1), new Want('watchpost', 1), new Want('chandlery', 1), new Want('meadery', 1), new Want('tavern', 1),
  new Want('house', 12), new Want('firehouse', 2), new Want('sawmill', 2), new Want('market', 2), new Want('well', 2), new Want('house', 14), new Want('lumberhut', 3), new Want('farm', 2), new Want('house', 16),
  new Want('works', 2), new Want('watchpost', 2), new Want('firehouse', 3), new Want('fishery', 2), new Want('mill', 2), new Want('house', 20), new Want('bakery', 2), new Want('smokehouse', 2), new Want('lodge', 2),
  new Want('apiary', 2), new Want('house', 24), new Want('market', 3), new Want('well', 3), new Want('farm', 3), new Want('house', 30), new Want('house', 36), new Want('claypit', 1), new Want('mine', 1), new Want('forge', 1), new Want('quarry', 1),
];

class Reach { dist: number[] = []; par: number[] = []; }
/** Distance in open tiles from the road network (roads are 0), and the tile each one is reached from. */
function reach(): Reach {
  const r = new Reach(), n = world.size * world.size, queue: number[] = [];
  for (let t = 0; t < n; t++) { r.dist.push(-1); r.par.push(-1); }
  for (let t = 0; t < n; t++) if (world.road[t] !== 0) { r.dist[t] = 0; queue.push(t); }
  for (let h = 0; h < queue.length; h++) {
    const t = queue[h];
    if (r.dist[t] >= 16) continue;
    for (let d = 0; d < 4; d++) {
      const v = neighbor(t, d);
      if (v < 0 || r.dist[v] >= 0 || !isOpen(v)) continue;
      r.dist[v] = r.dist[t] + 1; r.par[v] = t; queue.push(v);
    }
  }
  return r;
}
const near = (a: number, b: number): number => Math.abs(tileI(a) - tileI(b)) + Math.abs(tileJ(a) - tileJ(b));
function treesAround(t: number, rad: number): number {
  let n = 0;
  for (let j = tileJ(t) - rad; j <= tileJ(t) + rad; j++) for (let i = tileI(t) - rad; i <= tileI(t) + rad; i++) if (i >= 0 && j >= 0 && i < world.size && j < world.size && world.tree[tileIndex(i, j)] > 0) n++;
  return n;
}
/** Trees near the tile that a worker could walk up to: some open ground beside them is reached from the road (a forest behind rock or water is no wood). */
let scoring: Reach = new Reach();
function treesWithin(t: number, rad: number): number {
  let n = 0;
  for (let j = tileJ(t) - rad; j <= tileJ(t) + rad; j++) for (let i = tileI(t) - rad; i <= tileI(t) + rad; i++) {
    if (i < 0 || j < 0 || i >= world.size || j >= world.size) continue;
    const u = tileIndex(i, j);
    if (world.tree[u] === 0) continue;
    for (let d = 0; d < 4; d++) { const v = neighbor(u, d); if (v >= 0 && (scoring.dist[v] >= 0 || v === t)) { n++; break; } }
  }
  return n;
}
function housesAround(t: number, rad: number): number {
  let n = 0;
  for (const b of world.buildings) if (b.alive && b.type === HOUSE && Math.abs(b.i - tileI(t)) + Math.abs(b.j - tileJ(t)) <= rad) n++;
  return n;
}
function centre(): number {
  let si = 0, sj = 0, n = 0;
  for (const b of world.buildings) if (b.alive && b.type === HOUSE) { si += b.i; sj += b.j; n++; }
  return n === 0 ? world.gate : tileIndex(Math.round(si / n), Math.round(sj / n));
}
function score(id: string, t: number, d: number): number {
  const c = centre();
  if (id === 'house') return -d * 6 - near(t, world.gate) * .5 + world.appeal[t] * 5;
  if (id === 'lumberhut') return treesWithin(t, 5) * 3 - d * 4 - near(t, world.gate) * .3;
  if (id === 'well') return housesAround(t, 4) * 6 - d - near(t, c) * .2;
  if (id === 'apiary') { const rad = (economy.buildings[economy.typeOf(id)].bloom as Bloom).radius; let n = 0; for (let j = tileJ(t) - rad; j <= tileJ(t) + rad; j++) for (let i = tileI(t) - rad; i <= tileI(t) + rad; i++) if (i >= 0 && j >= 0 && i < world.size && j < world.size && (world.deco[tileIndex(i, j)] === 1 || world.deco[tileIndex(i, j)] === 2)) n++; return n * 4 - d * 3; }   // hives want flowers
  if (id === 'farm') { const rad = (economy.buildings[economy.typeOf(id)].soil as Bloom).radius; let n = 0; for (let j = tileJ(t) - rad; j <= tileJ(t) + rad; j++) for (let i = tileI(t) - rad; i <= tileI(t) + rad; i++) if (i >= 0 && j >= 0 && i < world.size && j < world.size && world.biome[tileIndex(i, j)] === BI_PLAIN) n++; return n * 1.5 - d * 3; }   // fields want fertile plain
  if (id === 'market') return -near(t, c) * 2 - d;
  return -d * 4 - near(t, world.gate) * .5 - (economy.buildings[economy.typeOf(id)].appeal.length > 0 && economy.buildings[economy.typeOf(id)].appeal[0] < 0 ? housesAround(t, 4) * 4 : 0);   // dirty trades keep away from homes
}
/** Open ground the road network can reach (tiles within 16 steps of a road). */
function openCount(): number { const r = reach(); let n = 0; for (let t = 0; t < world.size * world.size; t++) if (r.dist[t] > 0) n++; return n; }
/** True when a building on the tile would cut the road network off from most of the ground it could grow into (the village walled itself in on a mountain or in a forest). */
function shutsIn(t: number, base: number): boolean {
  if (base < 30) return false;
  const was = world.build[t]; world.build[t] = 0;
  const left = openCount();
  world.build[t] = was;
  return left < Math.min(base, 60) * .6;
}
/** True when a building on the tile would shut in a dead end of the road (the bot used to wall its own village in: no tree, no room, nothing reachable). */
function sealsRoad(t: number): boolean {
  for (let d = 0; d < 4; d++) {
    const v = neighbor(t, d);
    if (v < 0 || world.road[v] === 0) continue;
    let links = 0, free = 0;
    for (let e = 0; e < 4; e++) { const w = neighbor(v, e); if (w < 0) continue; if (world.road[w] !== 0) links++; else if (w !== t && isOpen(w)) free++; }
    if (links <= 1 && free === 0) return true;
  }
  return false;
}
/** Places a building of the plan at the best tile, laying a road to it when needed. False when it cannot be afforded or has no place. */
function tryPlace(id: string): boolean {
  const type = economy.typeOf(id), tool = toolOf(id), def = economy.buildings[type];
  if (!isUnlocked(type) || !canPay(def.cost)) return false;
  const r = reach(); scoring = r;
  let best = -1e9, bt = -1;
  const cands: number[][] = [];
  for (let t = 0; t < world.size * world.size; t++) {
    const d = r.dist[t];
    if (d < 1) continue;
    let ok: boolean;
    if (d === 1 || !def.needsRoad) ok = checkTool(tool, t) === PLACE_OK;
    else { const p = r.par[t]; world.road[p] = 1; ok = checkTool(tool, t) === PLACE_OK; world.road[p] = 0; }
    if (!ok || (env("BOT_NOSEAL") !== "1" && sealsRoad(t))) continue;
    if (d > 1 && def.needsRoad) {                                            // the road to it is paid in planks too: the whole bill must be in the stores
      const chain: number[] = [];
      for (let p = r.par[t]; p >= 0 && world.road[p] === 0; p = r.par[p]) chain.push(p);
      const bill = costOf(chain);
      const keep = id === 'lumberhut' && count('sawmill') === 0 ? 5 : 0;      // the first hut leaves a sawmill and a house to pay
      if (!canPay(def.cost.map((v: number, k: number): number => v + bill[k] + (k === economy.resourceOf('plank') ? keep : 0)))) continue;
    }
    cands.push([score(id, t, d), t]);
  }
  cands.sort((a: number[], b: number[]): number => b[0] - a[0] || a[1] - b[1]);
  const base = openCount();
  for (const c of cands) { if (!shutsIn(c[1], base)) { best = c[0]; bt = c[1]; break; } }
  if (bt < 0) return false;
  const laid: number[] = [];
  if (def.needsRoad) for (let p = r.par[bt]; p >= 0 && world.road[p] === 0; p = r.par[p]) laid.push(p);
  const road = costOf(laid);
  if (!canPay(def.cost.map((c: number, k: number): number => c + road[k]))) return false;      // the road and the building are paid together
  buildRoad(laid);
  return applyTool(tool, bt) === PLACE_OK;
}
const count = (id: string): number => { const type = economy.typeOf(id); let n = 0; for (const b of world.buildings) if (b.alive && b.type === type && !b.fixed) n++; return n; };
function freeRoom(): number { let room = 0; for (const b of world.buildings) if (b.alive && b.type === HOUSE) room += capacityOf(b) - b.residents; return room; }
function idlePeople(): number { let n = 0; for (const p of world.people) if (p.job < 0 && (p.role === 0 || p.role === 1)) n++; return n; }
function openJobs(): number {
  let slots = 0, held = 0;
  for (const b of world.buildings) if (b.alive && b.type !== HOUSE && !b.fixed) slots += economy.buildings[b.type].workers;
  for (const p of world.people) if (p.job >= 0) held++;
  return slots - held;
}
/** Demolishes the rubble of fires and collapses (the tile stays blocked otherwise). */
function clearRuins(): void {
  for (const b of world.buildings) if (b.alive && b.type === economy.risk.ruin && b.burn <= 0) applyTool(TOOL_ERASE, tileIndex(b.i, b.j));
}
/** True when paying `cost` would leave too little for the building the bot is saving for. */
function touches(cost: number[], blocker: number[]): boolean { for (let k = 0; k < cost.length; k++) if (cost[k] > 0 && world.stock[k] - cost[k] < blocker[k]) return true; return false; }

/** The reachable ground has no tree at its edge: the bot's own houses wall the road in. A person bulldozes the nearest house that has the forest behind it. */
function unwall(r: Reach): void {
  let open = 0;
  for (let t = 0; t < world.size * world.size; t++) if (r.dist[t] >= 0) open++;
  if (open > 40) return;                                  // only a pocket is walled in: a wide village just waits for the trees to grow
  let best = -1, bs = 1e9;
  for (let id = 0; id < world.buildings.length; id++) {
    const b = world.buildings[id];
    if (!b.alive || b.fixed || b.type !== HOUSE) continue;
    const t = tileIndex(b.i, b.j);
    let road = false, forest = false;
    for (let d = 0; d < 4; d++) { const v = neighbor(t, d); if (v < 0) continue; if (world.road[v] !== 0) road = true; if (world.tree[v] > 0) forest = true; }
    if (road && forest && b.residents < bs) { bs = b.residents; best = id; }
  }
  if (best >= 0) applyTool(TOOL_ERASE, tileIndex(world.buildings[best].i, world.buildings[best].j));
}
/** A gatherer walled in by its own buildings (BS_NO_SOURCE): razes the trees that touch the reachable ground, the ones with the most forest behind them (the gomme brings no wood). */
function openForest(): void {
  let stuck = false;
  for (const b of world.buildings) if (b.alive && b.state === BS_NO_SOURCE && economy.buildings[b.type].gather === 'tree') stuck = true;
  if (!stuck) return;
  const r = reach();
  for (let n = 0; n < 3; n++) {
    let best = -1, bs = -1;
    for (let t = 0; t < world.size * world.size; t++) {
      if (world.tree[t] === 0) continue;
      let touches = false;
      for (let d = 0; d < 4; d++) { const v = neighbor(t, d); if (v >= 0 && r.dist[v] >= 0 && isOpen(v) || v >= 0 && world.road[v] !== 0) touches = true; }
      if (touches && treesAround(t, 2) > bs) { bs = treesAround(t, 2); best = t; }
    }
    if (best < 0) { unwall(r); return; }
    applyTool(TOOL_ERASE, best);
  }
}

const FOOD = ['tannery', 'farm', 'fishery', 'forager', 'lodge', 'smokehouse', 'mill', 'bakery'];
/** The stores hold little to eat and nobody makes it yet at the pace of the village. */
function foodShort(): boolean {
  let n = 0;
  for (const id of ['bread', 'fish', 'smoked_meat', 'meat', 'berries', 'honey']) n += world.stock[economy.resourceOf(id)];
  return world.waitingForFood || n < 12;
}
/** The hands go to the food first (the Travail tab of the advisor does the same: farm, fishery, lodge and their mills at the top of the order). */
function feedFirst(): void {
  movePriority(economy.typeOf('tannery'), 100);                           // the tannery only has to stand: its hands go to food first
  const order = ['farm', 'fishery', 'lodge', 'forager', 'mill', 'bakery', 'smokehouse'];
  for (let k = order.length - 1; k >= 0; k--) { const type = economy.typeOf(order[k]); movePriority(type, -100); }
}
/** Deer that are alive on the map (the lodge's game). */
function gameNear(): number { let n = 0; for (const d of world.deer) if (d.species === 0 && d.state !== DEER_GONE) n++; return n; }
/** A gatherer that has found nothing for ten days is pulled down: its hands and its place are better used elsewhere (the plan builds it again where the game is). */
const idleFor: number[] = [];
function abandon(): void {
  for (let id = 0; id < world.buildings.length; id++) {
    while (idleFor.length <= id) idleFor.push(0);
    const b = world.buildings[id];
    if (b.alive && !b.fixed && b.state === BS_NO_SOURCE && economy.buildings[b.type].gather !== '') idleFor[id]++; else idleFor[id] = 0;
    if (idleFor[id] > 40 && !(openCount() < 30 && economy.buildings[b.type].gather === 'tree')) { applyTool(TOOL_ERASE, tileIndex(b.i, b.j)); idleFor[id] = 0; if (VERBOSE) console.log('  day ' + Math.floor(world.tick / DAY_TICKS) + ' abandon ' + economy.buildings[b.type].id); }
  }
}
let roadsLaid = false;
function decide(): void {
  if (!roadsLaid) { { const east: number[] = []; for (let k = 0; k < 4 && isOpen(world.gate + 1 + k); k++) east.push(world.gate + 1 + k); buildRoad(east); /* a road east of the gate, as far as the ground is open */ } roadsLaid = true; }
  clearRuins();
  abandon();
  openForest();
  if (economy.sim.labourShare < 100) movePriority(economy.typeOf('sawmill'), -100);   // a small labour pool (a Cité mission): the planks come before a second log hut; the food goes in front of it when short
  if (foodShort()) feedFirst();
  let blocker: number[] | null = null;
  for (const w of PLAN) {
    const type = economy.typeOf(w.id), def = economy.buildings[type];
    if (count(w.id) >= w.count) continue;
    if (!isUnlocked(type)) { if (blocker === null && w.id !== 'house') blocker = def.cost; continue; }   // a goal will open it: save for it
    if (w.id === 'house' && (freeRoom() > 1 || (count('house') >= 3 && openJobs() <= idlePeople() && world.stock[economy.resourceOf('plank')] < 20))) continue;   // houses follow the jobs
    if (w.id === 'fishery' && !world.hasWater) continue;
    if (w.id === 'lodge' && gameNear() < 4) continue;                      // no deer around: a lodge would only hold two workers
    if (w.id === 'smokehouse' && count('lodge') === 0) continue;
    if (w.id !== 'house' && def.workers > 0 && openJobs() > idlePeople() + 2 && !(FOOD.indexOf(w.id) >= 0 && foodShort())) continue;   // food first: people come only where there is bread      // people first: no new workplace while the ones built wait for hands
    if (blocker !== null && touches(def.cost, blocker)) continue;
    if (tryPlace(w.id)) { if (VERBOSE) console.log('  day ' + Math.floor(world.tick / DAY_TICKS) + ' build ' + w.id + ' planks left ' + world.stock[economy.resourceOf('plank')]); continue; }
    if (!canPay(def.cost)) { if (blocker === null && w.id !== 'house') blocker = def.cost; }   // wait for the stock
  }
}

// ---- the run ----
class Run {
  seed: number = 0; size: number = 0; preset: number = 0; won: number = -1; goalDay: number[] = []; maxPop: number = 0; left: number = 0; fires: number = 0; collapses: number = 0; thefts: number = 0;
  hungryDays: number = 0; minMood: number = 100; popAt: number[] = []; endDay: number = 0; dead: boolean = false;
}
function stockLine(): string {
  const out: string[] = [];
  for (const id of ['log', 'plank', 'meat', 'fish', 'bread', 'smoked_meat', 'stone', 'coin']) out.push(id + ' ' + world.stock[economy.resourceOf(id)]);
  return out.join(' ');
}
function play(seed: number, size: number, preset: number): Run {
  const run = new Run(), params = PRESETS[preset].params;   // the generator only sets its tile and clearing fields: the same every time
  world.autosave = false; world.unlimited = SANDBOX; world.difficulty = SANDBOX ? -1 : LEVEL; generate(seed, size, params);
  world.progression = !SANDBOX; world.risks = !SANDBOX; roadsLaid = false; idleFor.length = 0;
  run.seed = seed; run.size = size; run.preset = preset;
  for (const g of economy.goals) run.goalDay.push(-1);
  let everPeople = false;
  const total = MAX_DAYS * DAY_TICKS;
  for (let k = 0; k < total; k++) {
    if (k % 160 === 0) decide();
    stepWorld();
    if (world.tick % DAY_TICKS !== 0) continue;
    const day = world.tick / DAY_TICKS, pop = population();
    run.endDay = day; run.maxPop = Math.max(run.maxPop, pop); if (pop > 0) everPeople = true;
    if (day % 15 === 0) run.popAt.push(pop);
    if (pop > 8 && world.mood < run.minMood) run.minMood = world.mood;
    if (world.waitingForFood) run.hungryDays++;
    for (let g = 0; g < economy.goals.length; g++) if (world.goals[g] === 1 && run.goalDay[g] < 0) { run.goalDay[g] = day; if (VERBOSE) console.log('  day ' + day + ' goal ' + economy.goals[g].id + ' pop ' + pop); }
    for (const line of world.news) { if (line.indexOf('quitte') >= 0) { const m = Number(line.split(' ')[0]); run.left += m > 0 ? m : 1; } }
    for (const a of world.alerts) { if (a.kind === 'fire') run.fires++; else if (a.kind === 'collapse') run.collapses++; else if (a.kind === 'theft') run.thefts++; if (VERBOSE) console.log('  day ' + day + ' ' + a.text); }
    world.news = []; world.alerts = [];
    if (VERBOSE && day % 30 === 0) { let best = -1; for (let id = 0; id < world.buildings.length; id++) { const b = world.buildings[id]; if (b.alive && b.type === HOUSE && (best < 0 || b.level > world.buildings[best].level)) best = id; } if (best >= 0) console.log('   best house: ' + housingReport(world.buildings[best]).text); const gaps: string[] = []; for (const b of world.buildings) if (b.alive && b.type === HOUSE && b.level === 1) for (const q of housingReport(b).missing) gaps.push(q.id); console.log('   level-1 houses lack: ' + gaps.join(',')); let lv = 0; for (const b of world.buildings) if (b.alive && b.type === HOUSE && b.level >= 2) lv++; console.log('   lvl2 houses ' + lv + ' ' + ['market', 'well', 'tavern', 'meadery', 'chandlery', 'bakery', 'farm', 'fishery', 'smokehouse', 'firehouse'].map((id: string): string => id + ' ' + count(id)).join(' ') + ' mead ' + world.stock[economy.resourceOf('mead')] + ' candle ' + world.stock[economy.resourceOf('candle')]); }
    if (VERBOSE && (day === 12 || day === 60)) for (const b of world.buildings) console.log('   b ' + economy.buildings[b.type].id + ' @' + b.i + ',' + b.j + ' workers ' + b.workers + ' state ' + b.state + ' res ' + b.residents + ' stock ' + b.stock.join(','));
    if (VERBOSE && day % 10 === 0) console.log('  d' + day + ' pop ' + pop + ' mood ' + world.mood + ' jobless ' + world.jobless + '% houses ' + count('house') + ' trees ' + world.tree.filter((v: number): boolean => v > 0).length + ' felled ' + world.felledCount + ' ' + stockLine());
    if (!SANDBOX && scenarioWon()) { run.won = day; break; }
    if (everPeople && pop === 0) { run.dead = true; break; }
  }
  return run;
}
const minutes = (day: number): string => day < 0 ? '-' : String(Math.round(day * DAY_SECONDS / 60));
function report(r: Run): void {
  let goals = '';
  for (let g = 0; g < economy.goals.length; g++) goals += ' ' + economy.goals[g].id + '@' + minutes(r.goalDay[g]);
  console.log('bot seed ' + r.seed + ' size ' + r.size + ' preset ' + PRESETS[r.preset].label + ': ' + (r.won >= 0 ? 'WON at day ' + r.won + ' (' + minutes(r.won) + ' min)' : r.dead ? 'DEAD day ' + r.endDay : 'not won in ' + r.endDay + ' days') +
    ' | maxPop ' + r.maxPop + ' minMood ' + r.minMood + ' left ' + r.left + ' fires ' + r.fires + ' collapses ' + r.collapses + ' thefts ' + r.thefts + ' foodWait ' + r.hungryDays + ' | pop/15d ' + r.popAt.join(',') + ' | goals(min)' + goals);
}
let wins = 0, runs = 0;
for (const preset of listOf('BOT_PRESETS', '0')) for (const size of listOf('BOT_SIZES', '24')) for (const seed of listOf('BOT_SEEDS', '1')) {
  const r = play(seed, size, preset); report(r); runs++; if (r.won >= 0) wins++;
}
console.log('bot: ' + wins + '/' + runs + ' won');
