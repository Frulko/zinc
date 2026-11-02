import { drawImageRect, rect, polygon, stroke, clip, unclip } from 'zinc:gfx';
import { world } from '../world/world';
import { TILE, TERRAIN_VOID, TERRAIN_WATER, TERRAIN_GRASS, ST_SLEEP, ST_STROLL, ST_GO_WORK, ST_SEEK, ST_TO_TREE, ST_TO_SITE, ST_STALK, ST_TO_BODY, ST_TO_SHORE, ST_FETCH, ST_BRING, ST_ROAM, ST_ROAM_BACK, ST_TO_LODE, ST_HOME, ST_FREE, ST_RAID, ST_FLEE, ST_WALK_IN, DEER_GONE, DEER_DEAD, DEER_WALK, DEER_FLEE, DEER_STALK, DEER_CHASE } from '../constants';
import { monthStep } from '../view/seasons';
import { hash } from '../world/noise';
import { ui } from '../ui/state';
import { MODEL_IDS } from '../view/models';
import { economy } from '../world/economy';
import { HW, HH, PXH, cam, view, stats, sx, sy, tileFi, tileFj, heightIJ, cornersOf, corner, levelAtPoint } from './geom';
import * as A from './atlas';
import { drawGround } from './ground';

// The per-frame pass: the ground regions, then the things that stand on it (trees, rocks, buildings, people, animals) of the tiles in view only, back to front
// by tile diagonal (i + j): a tile's things first, then the actors whose position falls on that diagonal. Nothing is allocated: the actors are binned into
// arrays made once per map size.
const BG = 0x151a17;
const walkState: number[] = Array.from({ length: 40 }, (): number => 0);
function initWalk(): void { for (const s of [ST_STROLL, ST_GO_WORK, ST_SEEK, ST_TO_TREE, ST_TO_SITE, ST_STALK, ST_TO_BODY, ST_TO_SHORE, ST_FETCH, ST_BRING, ST_ROAM, ST_ROAM_BACK, ST_TO_LODE, ST_HOME, ST_FREE, ST_RAID, ST_FLEE, ST_WALK_IN]) walkState[s] = 1; }
let head: number[] = [], nextA: number[] = [];

function season(): number { const m = monthStep(); return Math.round(((m + 11) % 12) / 3) % 4; }

const TINTS = [0xffffff, 0xf2ebe0, 0xe9eef2, 0xf5f0e8];       // a row of the same house is not the same colour twice
function spr(id: number, fi: number, fj: number, level: number, alpha: number, tint: number, flip: number = 0): void {
  const z = cam.zoom, x = sx(fi, fj), y = sy(fi, fj, level), k = A.at.k;
  drawImageRect(A.at.images[A.sheetOf[id]], A.sx[id] * k, A.sy[id] * k, A.sw[id] * k, A.sh[id] * k, Math.round(x - A.ox[id] * z), Math.round(y - A.oy[id] * z), A.sw[id] * z, A.sh[id] * z, alpha, flip, 0, tint, 0);
  stats.sprites++;
}
/** Chimney smoke: three puffs a building, out of phase, rising and drifting with the wind while they swell and fade. */
function smoke(fi: number, fj: number, level: number, model: number, time: number, seed: number): void {
  const z = cam.zoom, c = A.chimney[Math.min(model, A.chimney.length - 1)], x = sx(fi, fj) + c[0] * z, y = sy(fi, fj, level) + c[1] * z;
  for (let p = 0; p < 3; p++) {
    const age = (time * .22 + p / 3 + seed * .37) % 1, f = Math.min(A.SMOKE_FRAMES - 1, Math.floor(age * A.SMOKE_FRAMES));
    const sid = A.fxId.smoke + f, px = x + (age * 9 + Math.sin(time * .5 + seed) * 2) * z, py = y - age * 30 * z;
    drawImageRect(A.at.images[A.sheetOf[sid]], A.sx[sid] * A.at.k, A.sy[sid] * A.at.k, A.sw[sid] * A.at.k, A.sh[sid] * A.at.k, Math.round(px - A.ox[sid] * z * 1.5), Math.round(py - A.oy[sid] * z * 1.5), A.sw[sid] * z * 1.5, A.sh[sid] * z * 1.5, Math.round(215 * (1 - age)), 0, 0, 0xffffff, 0);
    stats.sprites++;
  }
}

function levelHere(fi: number, fj: number): number { return stats.hmax === 0 ? 0 : levelAtPoint(fi, fj); }

function dirOf(yaw: number): number {
  const c = Math.cos(yaw), s = Math.sin(yaw), a = Math.atan2((c + s) * HH, (c - s) * HW);
  return ((Math.round(a / .785398) % 8) + 8) % 8;
}

function ensureBins(): void {
  if (walkState[ST_STROLL] === 0) initWalk();
  const need = 2 * world.size + 4;
  if (head.length !== need) head = Array.from({ length: need }, (): number => -1);
  const total = world.people.length + world.deer.length + world.crime.outlaws.length;
  if (nextA.length < total) nextA = Array.from({ length: total + 64 }, (): number => -1);
}

function tileThings(t: number, i: number, j: number, time: number, sea: number): void {
  const R = A.at.ready, v = world.tree[t], r = world.rock[t], id = world.build[t];
  if (R.all && v === 0 && r === 0 && id < 0) {                    // the ground's own life: glints on the water, grass that sways in the wind
    const q = hash(t, 21);
    if (world.terrain[t] === TERRAIN_WATER) { if (q < .3) spr(A.fxId.ripple + (Math.floor(time * 2.2 + q * 40) & 3), i + .3 + hash(t, 22) * .4, j + .3 + hash(t, 23) * .4, 0, 150, 0xffffff); }
    else if (q < .14 && world.terrain[t] === TERRAIN_GRASS && world.road[t] === 0) spr(A.fxId.tuft + sea * A.SWAYS + (Math.floor(time * 1.6 + q * 50) & 3), i + .2 + hash(t, 22) * .6, j + .2 + hash(t, 23) * .6, levelHere(i + .5, j + .5), 255, 0xffffff, q < .07 ? 1 : 0);
  }
  if (v > 0 && R.trees[sea]) {
    const fi = i + .5 + (hash(t, 7) - .5) * .7, fj = j + .5 + (hash(t, 8) - .5) * .7;
    spr(A.treeId(Math.min(3, v - 1), sea, (Math.floor(time * 1.4 + hash(t, 5) * 6) & 3)), fi, fj, levelHere(fi, fj), 255, 0xffffff, hash(t, 9) < .5 ? 1 : 0);
  }
  if (r > 0 && R.rocks) spr(A.rockIds[Math.min(5, r - 1)], i + .5, j + .5, levelHere(i + .5, j + .5), 255, 0xffffff, hash(t, 9) < .5 ? 1 : 0);
  if (id >= 0 && R.buildings) {
    const b = world.buildings[id], lv = levelHere(i + .5, j + .5), h = hash(t, 11);
    const sid = b.type === 0 && b.level > 0 ? A.buildIds[A.GATE_MODEL + Math.min(b.level, 2)] : A.buildIds[Math.min(b.type, MODEL_IDS.length - 1)];
    spr(sid, i + .5, j + .5, lv, 255, TINTS[Math.floor(hash(t, 12) * 4) & 3], h < .5 ? 1 : 0);
    if (R.all && b.alive && (b.type === 0 ? b.residents > 0 : b.workers > 0) && economy.buildings[b.type].smoke.length > 0) smoke(i + .5, j + .5, lv, b.type, time, b.i * 7 + b.j);
  } else if (t === world.gate && R.buildings) spr(A.buildIds[A.GATE_MODEL], i + .5, j + .5, levelHere(i + .5, j + .5), 255, 0xffffff);
}

function drawActor(k: number, time: number): void {
  const nP = world.people.length, nD = world.deer.length;
  const z = cam.zoom;
  if (k < nP) {
    const p = world.people[k];
    drawPerson(p.x, p.y, p.yaw, p.role, p.state, p.phase, p.carry, time);
  } else if (k < nP + nD) {
    const d = world.deer[k - nP];
    const kind = d.species === 0 ? (d.stag ? 1 : 0) : d.species === 1 ? 2 : d.species === 2 ? 3 : 4;
    if (!A.at.ready.animals[kind]) return;
    const fi = (d.x + world.half) / TILE, fj = (d.y + world.half) / TILE;
    const walking = d.state === DEER_WALK || d.state === DEER_FLEE || d.state === DEER_STALK || d.state === DEER_CHASE;
    const fr = walking ? Math.floor(time * (d.state === DEER_FLEE || d.state === DEER_CHASE ? 11 : 6) + d.phase) & 3 : 0;
    spr(A.animalId(kind, dirOf(d.yaw), fr), fi, fj, levelHere(fi, fj), 255, 0xffffff);
  } else {
    const p = world.crime.outlaws[k - nP - nD];
    drawPerson(p.x, p.y, p.yaw, p.role, p.state, p.phase, p.carry, time);
  }
}
function drawPerson(x: number, y: number, yaw: number, role: number, state: number, phase: number, carry: number, time: number): void {
  const r = Math.min(A.ROLES - 1, role);
  if (!A.at.ready.people[r]) return;
  const fi = (x + world.half) / TILE, fj = (y + world.half) / TILE, lv = levelHere(fi, fj);
  const fr = walkState[state] === 1 ? Math.floor(time * 8 + phase * 2) & 3 : 0;
  spr(A.personId(r, dirOf(yaw), fr), fi, fj, lv, 255, 0xffffff);
  if (carry > 0 && A.at.ready.all) spr(A.carryId.box, fi, fj, lv + 1.9, 255, 0xffffff);
}

/** Draws the whole map for this frame. `time` drives the frame choice of every animation. */
export function drawMap(time: number, budgetMs: number): void {
  stats.quads = 0; stats.sprites = 0;
  const z = cam.zoom, n = world.size;
  rect(view.x, view.y, view.w, view.h, BG);
  clip(view.x, view.y, view.w, view.h);
  const sea = season();
  A.chooseSet(z);
  A.bakeStep(10, sea);
  drawGround(budgetMs);
  if (z >= .7 && A.at.images.length > 0) {
    ensureBins();
    const cx = view.x + view.w / 2, cy = view.y + view.h / 2, ci = cam.ci, cj = cam.cj;
    const lift = stats.hmax * PXH * z;
    const sMin = Math.max(0, Math.ceil((view.y - 24 * z - cy) / (HH * z) + ci + cj - 1)), sMax = Math.min(2 * n - 2, Math.floor((view.y + view.h + 100 * z + lift - cy) / (HH * z) + ci + cj - 1));
    const dMin = Math.ceil((view.x - 40 * z - cx) / (HW * z) + ci - cj), dMax = Math.floor((view.x + view.w + 40 * z - cx) / (HW * z) + ci - cj);
    // bin the actors that fall in the window of diagonals and columns
    const nP = world.people.length, nD = world.deer.length, nO = world.crime.outlaws.length;
    for (let s = 0; s < head.length; s++) head[s] = -1;
    const total = nP + nD + nO;
    for (let k = 0; k < total; k++) {
      let ax = 0, ay = 0;
      if (k < nP) { const p = world.people[k]; if (p.state === ST_SLEEP) continue; ax = p.x; ay = p.y; }
      else if (k < nP + nD) { const d = world.deer[k - nP]; if (d.state === DEER_GONE || d.state === DEER_DEAD) continue; ax = d.x; ay = d.y; }
      else { const p = world.crime.outlaws[k - nP - nD]; ax = p.x; ay = p.y; }
      const fi = (ax + world.half) / TILE, fj = (ay + world.half) / TILE, s = Math.floor(fi + fj);
      if (s < sMin || s > sMax) continue;
      const dd = fi - fj;
      if (dd < dMin - 1 || dd > dMax + 1) continue;
      nextA[k] = head[s]; head[s] = k;
    }
    for (let s = sMin; s <= sMax; s++) {
      let d = dMin; if (((d + s) & 1) !== 0) d++;
      for (; d <= dMax; d += 2) {
        const i = (s + d) >> 1, j = (s - d) >> 1;
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        tileThings(j * n + i, i, j, time, sea);
      }
      for (let k = head[s]; k >= 0; k = nextA[k]) drawActor(k, time);
    }
  }
  unclip();
}

// ---- tile overlays: hover, ghost, selection ----
/** A tile as a diamond on the ground, on its corner heights. */
export function tileDiamond(t: number, color: number, alpha: number, ring: boolean): void {
  const n = world.size, i = t % n, j = Math.floor(t / n);
  cornersOf(i, j);
  const x0 = sx(i, j), y0 = sy(i, j, corner[0]), x1 = sx(i + 1, j), y1 = sy(i + 1, j, corner[1]), x2 = sx(i + 1, j + 1), y2 = sy(i + 1, j + 1, corner[2]), x3 = sx(i, j + 1), y3 = sy(i, j + 1, corner[3]);
  if (ring) stroke([x0, y0, x1, y1, x2, y2, x3, y3], 2, color, alpha, true);
  else polygon([x0, y0, x1, y1, x2, y2, x3, y3], color, alpha);
}
export function ghost(t: number, type: number, ok: boolean): void {
  if (t < 0) return;
  const n = world.size, i = t % n, j = Math.floor(t / n);
  tileDiamond(t, ok ? 0x6ad06a : 0xd05a4a, ok ? 110 : 130, false);
  if (type >= 0 && A.at.ready.buildings) {
    clip(view.x, view.y, view.w, view.h);
    spr(A.buildIds[Math.min(type, MODEL_IDS.length - 1)], i + .5, j + .5, levelHere(i + .5, j + .5), 150, ok ? 0xffffff : 0xff9a8a);
    unclip();
  }
}
export function selection(): void {
  clip(view.x, view.y, view.w, view.h);
  if (ui.selKind === 1 && ui.selId >= 0 && ui.selId < world.buildings.length) { const b = world.buildings[ui.selId]; tileDiamond(b.j * world.size + b.i, 0xffd60a, 255, true); }
  else if (ui.selKind === 2 && ui.selId >= 0 && ui.selId < world.people.length) {
    const p = world.people[ui.selId], fi = (p.x + world.half) / TILE, fj = (p.y + world.half) / TILE, lv = levelHere(fi, fj), x = sx(fi, fj), y = sy(fi, fj, lv), r = 11 * cam.zoom;
    const pts: number[] = [];
    for (let k = 0; k < 16; k++) { const a = k / 16 * 6.2832; pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r * .5); }
    stroke(pts, 2, 0xffd60a, 255, true);
  }
  unclip();
}

// ---- picking ----
export const pick = { t: -1, x: 0, y: 0 };
/** The tile under a screen point, with the world point there; heights respected (the frontmost surface the ray meets). Fills `pick` and returns the tile or -1. */
export function pickAt(px: number, py: number): number {
  pick.t = -1;
  if (px < view.x || py < view.y || px >= view.x + view.w || py >= view.y + view.h) return -1;
  const fi0 = tileFi(px, py, 0), fj0 = tileFj(px, py, 0), n = world.size;
  for (let L = Math.ceil(stats.hmax); L >= 0; L--) {
    const e = L * PXH / (2 * HH), fi = fi0 + e, fj = fj0 + e;
    const i = Math.floor(fi), j = Math.floor(fj);
    if (i < 0 || j < 0 || i >= n || j >= n) continue;
    if (L > 0 && levelAtPoint(fi, fj) < L - .51) continue;
    if (L < Math.ceil(stats.hmax) && levelAtPoint(fi, fj) > L + .51 + 1) continue;
    const t = j * n + i;
    if (world.terrain[t] === TERRAIN_VOID) continue;
    pick.t = t; pick.x = fi * TILE - world.half; pick.y = fj * TILE - world.half;
    return t;
  }
  return -1;
}
