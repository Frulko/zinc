import { winterCoat } from './seasons';
import { Color, Palette, Pose, Vec3, figure, dynamicAdd, capsule, sphere, plot, rgb, lerp, castShadow, ripple, Atlas, AtlasAxes, AtlasEntry, AtlasDef, bakeAtlas, S, W, H, defHash, hashNumbers } from '../pixel';
import {
  ROLE_LUMBERJACK, ST_FISH, ST_CHOP, ST_MINE, ST_WORK, ST_AIM, ST_SHOT, ST_PICK, ARROW_SECONDS, AIM_SECONDS,
  DEER_GRAZE, DEER_FLEE, DEER_CHASE, DEER_DEAD, DEER_GONE, DEER_DRINK, ST_STALK, STALK_CROUCH,
} from '../constants';
import { sleepsIndoors } from '../engine/routine';
import { world, onMap, Person, Deer } from '../world/world';
import { SPECIES } from '../rules/species';
import { beastEntries, drawBeast } from './beasts';
import { isMoving } from '../engine/path';
import { SETTLER_PALETTE, RESIDENT_PALETTE, LUMBERJACK_PALETTE, HUNTER_PALETTE, FISHER_PALETTE, SAWYER_PALETTE, SMOKER_PALETTE, PORTER_PALETTE, FARMER_PALETTE, MILLER_PALETTE, BAKER_PALETTE, VENDOR_PALETTE, TANNER_PALETTE, QUARRYMAN_PALETTE, PEDDLER_PALETTE, FORAGER_PALETTE, SMITH_PALETTE, BEEKEEPER_PALETTE, CHANDLER_PALETTE, BREWER_PALETTE, INNKEEPER_PALETTE, FIREWARDEN_PALETTE, REPAIRMAN_PALETTE, WATCHMAN_PALETTE, ROBBER_PALETTE, RIOTER_PALETTE, HAIR_TONES, FUR, FUR_DARK, FUR_LIGHT, BARK } from '../palettes';

const SCALE = .62;
const PLANK: Color = [214, 180, 120], LOG: Color = [150, 112, 72], LOG_END: Color = [214, 186, 134], STEEL: Color = [176, 182, 180], ARROW: Color = [226, 212, 176];
const solid = (c: Color): ((z: number) => Color) => (): Color => c;

/** The palette of each role, indexed by ROLE_* (constants.ts). */
const ROLE_PALETTES: Palette[] = [SETTLER_PALETTE, RESIDENT_PALETTE, LUMBERJACK_PALETTE, HUNTER_PALETTE, FISHER_PALETTE, SAWYER_PALETTE, SMOKER_PALETTE, PORTER_PALETTE, FARMER_PALETTE, MILLER_PALETTE, BAKER_PALETTE, VENDOR_PALETTE, TANNER_PALETTE, QUARRYMAN_PALETTE, PEDDLER_PALETTE, FORAGER_PALETTE, SMITH_PALETTE, BEEKEEPER_PALETTE, CHANDLER_PALETTE, BREWER_PALETTE, INNKEEPER_PALETTE, FIREWARDEN_PALETTE, REPAIRMAN_PALETTE, WATCHMAN_PALETTE, ROBBER_PALETTE, RIOTER_PALETTE];
function paletteOf(role: number, hairTone: number): Palette {
  const base = ROLE_PALETTES[role] === undefined ? RESIDENT_PALETTE : ROLE_PALETTES[role];
  return { shirt: base.shirt, stripe: base.stripe, legs: base.legs, skin: base.skin, hair: HAIR_TONES[hairTone] };
}

// What a person looks like is a pose (kind and animation angle), a role and a hair tone. The same code paints it live (every bone every frame) or once into the
// atlas, from where it is stamped: a baked frame has the animation angle quantised to WALK_FRAMES or CHOP_FRAMES steps and the heading to eight directions.
const KIND_WALK = 0, KIND_CHOP = 1, KIND_AIM = 2, KIND_FISH = 3, KIND_PICK = 4, KIND_IDLE = 5, KIND_CREEP = 6;   // creeping up on game: painted live, never from the atlas
const WALK_FRAMES = 8, CHOP_FRAMES = 6, YAW_STEPS = 8, TAU = Math.PI * 2;
const SLOT_WALK = 0, SLOT_CHOP = WALK_FRAMES, SLOT_AIM = SLOT_CHOP + CHOP_FRAMES, SLOT_FISH = SLOT_AIM + 1, SLOT_PICK = SLOT_FISH + 1, SLOT_IDLE = SLOT_PICK + 1, PERSON_POSES = SLOT_IDLE + 1;
const HAIRS = HAIR_TONES.length, ROLES = ROLE_PALETTES.length;
interface Look { pose: Pose; axe: boolean; fishing: boolean; }

/** `a` is the walk phase for KIND_WALK and the chop angle (phase * 4.2) for KIND_CHOP; `idleZ` the breathing offset. */
function lookOf(role: number, kind: number, a: number, idleZ: number): Look {
  const pose: Pose = { scale: SCALE, stance: .12, z: 0 };
  let fishing = false;
  if (kind === KIND_WALK) {
    const swing = Math.sin(a);
    pose.stance = .08 + Math.abs(swing) * .16; pose.z = Math.abs(swing) * .035 * SCALE;
    pose.armR = swing * .55; pose.armL = .08 - swing * .55; pose.lean = .04;
  } else if (kind === KIND_CHOP) {
    pose.armR = 1.35 + Math.sin(a) * .85; pose.armL = 1.0; pose.lean = .16 + Math.max(0, Math.sin(a)) * .1; pose.crouch = .08;
  } else if (kind === KIND_AIM) {
    pose.armR = 1.52; pose.armL = 1.5; pose.stance = .2; pose.lean = -.03;
  } else if (kind === KIND_FISH) {
    pose.armR = 1.25; pose.armL = 1.1; pose.lean = .08; pose.crouch = .1; pose.stance = .14;
    fishing = true;
  } else if (kind === KIND_CREEP) {
    const swing = Math.sin(a);
    pose.crouch = .5; pose.lean = .32; pose.stance = .1 + Math.abs(swing) * .1; pose.armR = .9 + swing * .25; pose.armL = .9 - swing * .25;
  } else if (kind === KIND_PICK) {
    pose.crouch = .5; pose.lean = .35; pose.armR = .9; pose.armL = .9;
  } else pose.z = idleZ;
  return { pose, axe: role === ROLE_LUMBERJACK && kind !== KIND_WALK, fishing };
}
/** A hunter close to his quarry creeps: low, slowly (the same distance engine/villagers.ts slows him at). */
function creeping(p: Person): boolean {
  if (p.state !== ST_STALK || p.target < 0 || p.target >= world.deer.length) return false;
  const d = world.deer[p.target];
  return Math.abs(d.x - p.x) + Math.abs(d.y - p.y) < STALK_CROUCH * 1.2;
}
function kindOf(p: Person): number {
  if (isMoving(p)) return creeping(p) ? KIND_CREEP : KIND_WALK;
  return p.state === ST_CHOP || p.state === ST_WORK || p.state === ST_MINE ? KIND_CHOP : p.state === ST_AIM || p.state === ST_SHOT ? KIND_AIM : p.state === ST_FISH ? KIND_FISH : p.state === ST_PICK ? KIND_PICK : KIND_IDLE;
}
const stepOf = (angle: number, steps: number): number => { const k = Math.round(angle / TAU * steps) % steps; return k < 0 ? k + steps : k; };
function slotOf(p: Person, kind: number): number {
  if (kind === KIND_WALK) return SLOT_WALK + stepOf(p.phase, WALK_FRAMES);
  if (kind === KIND_CHOP) return SLOT_CHOP + stepOf(p.phase * 4.2, CHOP_FRAMES);
  return kind === KIND_AIM ? SLOT_AIM : kind === KIND_FISH ? SLOT_FISH : kind === KIND_PICK ? SLOT_PICK : SLOT_IDLE;
}
/** The look of a baked slot: the same numbers as `lookOf` with the angle at the middle of its step. */
function lookOfSlot(role: number, slot: number): Look {
  if (slot < SLOT_CHOP) return lookOf(role, KIND_WALK, (slot - SLOT_WALK) * TAU / WALK_FRAMES, 0);
  if (slot < SLOT_AIM) return lookOf(role, KIND_CHOP, (slot - SLOT_CHOP) * TAU / CHOP_FRAMES, 0);
  return lookOf(role, slot === SLOT_AIM ? KIND_AIM : slot === SLOT_FISH ? KIND_FISH : slot === SLOT_PICK ? KIND_PICK : KIND_IDLE, 0, 0);
}
const solidBone = (a: Vec3, b: Vec3, r0: number, r1: number, f: (z: number) => Color): void => capsule(a, b, r0, r1, f, 'solid');
const noBone = (_a: Vec3, _b: Vec3, _r0: number, _r1: number, _f: (z: number) => Color): void => {};

/** The body, the axe in hand and the fishing rod: everything of a person that depends only on role, hair, heading and pose. Returns the right hand. */
function paintFigure(x: number, y: number, yaw: number, role: number, hairTone: number, look: Look, add: (a: Vec3, b: Vec3, r0: number, r1: number, f: (z: number) => Color) => void): Vec3 {
  const fx = Math.cos(yaw), fy = Math.sin(yaw), sx = -fy;
  const hand = figure(x, y, yaw, look.pose, paletteOf(role, hairTone), add);
  if (look.axe) {
    const a = (look.pose.armR === undefined ? 0 : look.pose.armR) + .18;
    const tip: Vec3 = [hand[0] + fx * Math.sin(a) * .5, hand[1] + fy * Math.sin(a) * .5, hand[2] - Math.cos(a) * .5];
    capsule(hand, tip, .035, .03, solid(BARK), 'solid');
    capsule(tip, [tip[0] + fx * Math.sin(a) * .12 + sx * .02, tip[1] + fy * Math.sin(a) * .12, tip[2] - Math.cos(a) * .12], .09, .045, solid(STEEL), 'solid');
  }
  if (look.fishing) capsule(hand, [hand[0] + fx * .9, hand[1] + fy * .9, hand[2] + .75], .03, .015, solid(BARK), 'solid');
  return hand;
}

/** The parts that change with the state, not the pose: the bow and its string, the line and bobber, the load carried, the arrow in flight. */
function paintProps(p: Person, yaw: number, hand: Vec3): void {
  const fx = Math.cos(yaw), fy = Math.sin(yaw), sx = -fy, sy = fx;
  if (p.state === ST_SHOT || p.state === ST_AIM) {
    const bow = p.state === ST_SHOT ? 0 : 1 - p.timer / AIM_SECONDS;
    const cx = p.x + fx * .55, cy = p.y + fy * .55, cz = 1.0;
    const top: Vec3 = [cx + sx * .4 - fx * .1, cy + sy * .4 - fy * .1, cz], mid: Vec3 = [cx + fx * .08, cy + fy * .08, cz], low: Vec3 = [cx - sx * .4 - fx * .1, cy - sy * .4 - fy * .1, cz];
    capsule(top, mid, .03, .03, solid(BARK), 'solid'); capsule(mid, low, .03, .03, solid(BARK), 'solid');
    const pull = p.state === ST_AIM ? bow * .3 : 0;
    for (let k = 0; k <= 12; k++) plot(lerp(top[0], low[0], k / 12) - fx * (.1 + pull * Math.sin(k / 12 * Math.PI)), lerp(top[1], low[1], k / 12) - fy * (.1 + pull * Math.sin(k / 12 * Math.PI)), cz, rgb(226, 220, 196));
  }
  if (p.state === ST_FISH && !isMoving(p)) {                          // a taut line from the rod's tip, a bobber that dips now and then
    const tip: Vec3 = [hand[0] + fx * .9, hand[1] + fy * .9, hand[2] + .75];
    const bx = p.x + fx * 2.1, by = p.y + fy * 2.1, dip = Math.max(0, Math.sin(p.phase * 2.3 + p.hair)) > .92 ? -.05 : .02;
    for (let k = 0; k <= 14; k++) { const t = k / 14; plot(lerp(tip[0], bx, t), lerp(tip[1], by, t), lerp(tip[2], dip, t) - Math.sin(t * Math.PI) * .12, rgb(214, 212, 180)); }
    sphere(bx, by, dip + .05, .07, [165, 79, 56], 'solid');
    ripple(bx, by, .15 + (p.phase * .25) % .4, rgb(143, 177, 146), true);
  }
  if (p.carry === 3) {                                                // the catch in hand
    capsule([p.x + fx * .35 + sx * .3, p.y + fy * .35 + sy * .3, .75], [p.x + fx * .55 + sx * .3, p.y + fy * .55 + sy * .3, .7], .07, .04, solid([150, 178, 166]), 'solid');
  }
  if (p.carry === 7 || p.carry === 8 || p.carry === 9) {              // a sack of wheat or flour, or loaves of bread
    const c = solid(p.carry === 7 ? [206, 178, 96] : p.carry === 8 ? [232, 226, 210] : [190, 132, 84]);
    sphere(p.x + fx * .45, p.y + fy * .45, .88, p.carry === 9 ? .1 : .16, p.carry === 7 ? [206, 178, 96] : p.carry === 8 ? [232, 226, 210] : [190, 132, 84], 'solid');
    capsule([p.x + fx * .45 + sx * .1, p.y + fy * .45 + sy * .1, .8], [p.x + fx * .45 - sx * .1, p.y + fy * .45 - sy * .1, .8], .1, .1, c, 'solid');
  }
  if (p.carry === 5 || p.carry === 6) {                              // a folded hide, or a ham, held in front
    const hide = p.carry === 5, c = solid(hide ? [186, 150, 108] : [168, 92, 72]);
    capsule([p.x + fx * .45 + sx * .15, p.y + fy * .45 + sy * .15, .85], [p.x + fx * .45 - sx * .15, p.y + fy * .45 - sy * .15, .85], hide ? .13 : .1, hide ? .13 : .08, c, 'solid');
    if (!hide) sphere(p.x + fx * .45 - sx * .2, p.y + fy * .45 - sy * .2, .85, .12, [150, 78, 62], 'solid');
  }
  if (p.carry >= 10 && p.carry <= 16) {                              // leather folded, a block of stone, clay or ore, a handful of berries (the order of economy.json)
    const c: Color = p.carry === 10 ? [150, 104, 64] : p.carry === 11 ? [176, 170, 156] : p.carry === 12 ? [168, 98, 70] : p.carry === 13 ? [86, 86, 92] : p.carry === 16 ? [120, 126, 136] : [196, 56, 70];
    if (p.carry === 10) capsule([p.x + fx * .45 + sx * .15, p.y + fy * .45 + sy * .15, .85], [p.x + fx * .45 - sx * .15, p.y + fy * .45 - sy * .15, .85], .13, .13, solid(c), 'solid');
    else if (p.carry === 14) { for (let k = 0; k < 4; k++) sphere(p.x + fx * .45 + sx * (k - 1.5) * .07, p.y + fy * .45 + sy * (k - 1.5) * .07, .86 + (k % 2) * .05, .06, c, 'solid'); }
    else { sphere(p.x + fx * .42, p.y + fy * .42, .86, .17, c, 'solid'); sphere(p.x + fx * .5 + sx * .1, p.y + fy * .5 + sy * .1, .94, .1, [c[0] + 20, c[1] + 18, c[2] + 14], 'solid'); }
  }
  if (p.carry >= 17 && p.carry <= 20) {                              // a honey jar, a block of wax, a candle, a mead jug (the order of economy.json)
    const hx = p.x + fx * .45, hy = p.y + fy * .45;
    if (p.carry === 17) { capsule([hx, hy, .8], [hx, hy, .96], .15, .14, solid([226, 160, 36]), 'solid'); capsule([hx, hy, .97], [hx, hy, 1.01], .12, .12, solid([150, 104, 60]), 'solid'); }
    else if (p.carry === 18) capsule([hx + sx * .12, hy + sy * .12, .86], [hx - sx * .12, hy - sy * .12, .86], .13, .13, solid([240, 214, 128]), 'solid');
    else if (p.carry === 19) { capsule([hx + sx * .1, hy + sy * .1, .8], [hx + sx * .1, hy + sy * .1, 1.02], .05, .05, solid([246, 238, 210]), 'solid'); capsule([hx - sx * .1, hy - sy * .1, .8], [hx - sx * .1, hy - sy * .1, .96], .05, .05, solid([246, 238, 210]), 'solid'); sphere(hx + sx * .1, hy + sy * .1, 1.06, .04, [255, 200, 80], 'solid'); }
    else { capsule([hx, hy, .78], [hx, hy, .98], .15, .12, solid([158, 96, 52]), 'solid'); capsule([hx, hy, .99], [hx, hy, 1.06], .07, .07, solid([110, 70, 44]), 'solid'); }
  }
  if (p.carry === 4) {                                                // a bundle of planks held in front
    capsule([p.x + fx * .4 + sx * .2, p.y + fy * .4 + sy * .2, .85], [p.x + fx * .4 - sx * .2, p.y + fy * .4 - sy * .2, .85], .1, .1, solid(PLANK), 'solid');
    capsule([p.x + fx * .4 + sx * .2, p.y + fy * .4 + sy * .2, .98], [p.x + fx * .4 - sx * .2, p.y + fy * .4 - sy * .2, .98], .1, .1, solid(PLANK), 'solid');
  }
  if (p.carry === 1) {                                                // a log across the shoulder
    const a: Vec3 = [p.x + sx * .55, p.y + sy * .55, 1.5], b: Vec3 = [p.x - sx * .55, p.y - sy * .55, 1.42];
    capsule(a, b, .13, .13, solid(LOG), 'solid'); sphere(a[0], a[1], a[2], .1, LOG_END, 'solid');
  } else if (p.carry === 2) {                                         // a deer slung over the back
    capsule([p.x - fx * .5, p.y - fy * .5, 1.45], [p.x + fx * .35, p.y + fy * .35, 1.5], .2, .17, solid(FUR), 'solid');
    sphere(p.x + fx * .5, p.y + fy * .5, 1.35, .11, FUR_DARK, 'solid');
  }
  if (p.state === ST_SHOT) {                                          // the arrow, with a small arc
    const t = 1 - p.timer / ARROW_SECONDS, ox = p.x + fx * .6, oy = p.y + fy * .6;
    const x = lerp(ox, p.shotX, t), y = lerp(oy, p.shotY, t), z = 1.0 + Math.sin(t * Math.PI) * .5 - t * .3;
    capsule([x, y, z], [x - fx * .3, y - fy * .3, z + .04], .025, .02, solid(ARROW), 'solid');
  }
}

/** The atlas of the actors for the current light, size and zoom (one per header, a few kept). */
const actorAtlases = new Map<number, Atlas>();
function personEntry(): AtlasEntry {
  return { name: 'person', variants: ROLES * HAIRS, yaws: YAW_STEPS, poses: PERSON_POSES, draw: (a: AtlasAxes, x: number, y: number, z: number): void => {
    paintFigure(x, y, a.yaw8 * TAU / YAW_STEPS, Math.floor(a.variant / HAIRS), a.variant % HAIRS, lookOfSlot(Math.floor(a.variant / HAIRS), a.pose), solidBone);
  } };
}
const ACTOR_DEF_VERSION = 4;
export function actorAtlas(): Atlas {
  const def: AtlasDef = { version: ACTOR_DEF_VERSION, season: 0, entries: [personEntry(), deerEntry(), ...beastEntries()] };
  const key = hashNumbers([S, defHash(def), (W / 2) % 4, (H * .6) % 4]);   // a frame is offsets from the bake origin and the light never changes here: only the scale, the dither phase of the origin (the pattern is anchored on buffer pixels) and the definition make another atlas, a window's size does not
  const have = actorAtlases.get(key);
  if (have !== undefined) return have;
  if (actorAtlases.size >= 24) actorAtlases.clear();                  // a few per art scale
  const made = bakeAtlas(def);
  actorAtlases.set(key, made);
  return made;
}

/** Soft shadow of a baked person: a few casts along the body instead of one per bone (the shadow slants away from the light with height). */
function personShadow(x: number, y: number): void {
  castShadow(x, y, .3, .13); castShadow(x, y, .75, .16); castShadow(x, y, 1.15, .15); castShadow(x, y, 1.5, .13);
  castShadow(x, y, 0, .2, 2, 0);
}

/** People are the same lit volumes as the rest of the diorama (figure() of the shared renderer), never flat sprites: live bone by bone, or stamped from the atlas. */
export function drawPerson(p: Person, time: number, atlas: Atlas | null): void {
  if (sleepsIndoors(p) || !onMap(p.x, p.y)) return;                   // asleep in his house, or off the map
  const kind = kindOf(p), hairTone = p.hair;
  if (atlas === null || kind === KIND_CREEP) {
    const look = lookOf(p.role, kind, kind === KIND_CHOP ? p.phase * 4.2 : p.phase, Math.sin(time * 1.6 + p.hair * 2) * .01);
    paintProps(p, p.yaw, paintFigure(p.x, p.y, p.yaw, p.role, hairTone, look, dynamicAdd));
    return;
  }
  const yaw8 = stepOf(p.yaw, YAW_STEPS), yaw = yaw8 * TAU / YAW_STEPS, slot = slotOf(p, kind);
  atlas.stamp('person', { variant: p.role * HAIRS + hairTone, yaw8, pose: slot }, p.x, p.y, 0);
  personShadow(p.x, p.y);
  paintProps(p, yaw, kind === KIND_FISH ? figure(p.x, p.y, yaw, lookOfSlot(p.role, slot).pose, paletteOf(p.role, hairTone), noBone) : [0, 0, 0]);
}

// A deer is walking, fleeing, grazing or standing, or dead. Like a person it is painted live or once into the atlas (heading in eight steps; the stride angle
// of walking and fleeing in 8 and 6 steps, the head of grazing in 4 levels).
const WINTER_FUR: Color = [182, 158, 122], WINTER_DARK: Color = [142, 120, 94];
const DM_WALK = 0, DM_FLEE = 1, DM_STILL = 2, DM_DEAD = 3;
const DEER_WALK_FRAMES = 8, DEER_FLEE_FRAMES = 6, DEER_GRAZE_LEVELS = 4, GRAZE_HEAD = .6;
const DM_FALL = 4, DEER_FALL_FRAMES = 3, FALL_SECONDS = .9;     // the collapse: the legs buckle, the body goes down on its side, the head drops
const DSLOT_WALK = 0, DSLOT_FLEE = DEER_WALK_FRAMES, DSLOT_GRAZE = DSLOT_FLEE + DEER_FLEE_FRAMES, DSLOT_DEAD = DSLOT_GRAZE + DEER_GRAZE_LEVELS, DSLOT_DEAD2 = DSLOT_DEAD + 1, DSLOT_FALL = DSLOT_DEAD2 + 1, DEER_POSES = DSLOT_FALL + DEER_FALL_FRAMES;   // DEAD2: no arrow in it (a wolf's kill)

/** One deer from the same capsules and spheres as the cat and the gull of the harbour. `a` is the stride angle, `head` how far the head is down to the grass. */
function paintDeer(x: number, y: number, yaw: number, stag: boolean, mode: number, a: number, head: number, fawn: boolean = false, winter: boolean = false, arrow: boolean = true): void {
  const fx = Math.cos(yaw), fy = Math.sin(yaw), sx = -fy, sy = fx;
  const k = fawn ? .62 : 1;                         // a fawn is the same model smaller, about its own feet
  const T = (p: Vec3): Vec3 => [x + (p[0] - x) * k, y + (p[1] - y) * k, p[2] * k];
  const cap = (p: Vec3, q: Vec3, r1: number, r2: number, c: (z: number) => Color, m: string): void => capsule(T(p), T(q), r1 * k, r2 * k, c, m);
  const ball = (px: number, py: number, pz: number, r: number, c: Color, m: string): void => sphere(x + (px - x) * k, y + (py - y) * k, pz * k, r * k, c, m);
  const P = (u: number, v: number, c: number): Vec3 => [x + fx * u + sx * v, y + fy * u + sy * v, c];
  const fur = solid(winter ? WINTER_FUR : FUR), dark = solid(winter ? WINTER_DARK : FUR_DARK), light = solid(FUR_LIGHT);      // the winter coat is thicker and paler
  if (mode === DM_DEAD) {
    cap(P(-.4, 0, .26), P(.35, 0, .28), .26, .23, fur, 'solid');
    cap(P(.35, 0, .3), P(.75, .15, .2), .12, .08, fur, 'solid'); ball(x + fx * .85 + sx * .2, y + fy * .85 + sy * .2, .17, .1, winter ? WINTER_DARK : FUR_DARK, 'solid');
    for (const [u, v] of [[-.35, .26], [.3, .26]]) cap(P(u, v, .22), P(u + .1, v + .5, .16), .06, .04, dark, 'solid');
    if (arrow) { cap(P(.05, -.12, .42), P(-.18, -.34, .86), .018, .014, solid(ARROW), 'solid'); cap(P(-.18, -.34, .86), P(-.26, -.4, .98), .03, .02, solid(STEEL), 'solid'); }   // the arrow stands in its flank
    return;
  }
  if (mode === DM_FALL) {                                                // `a` is how far down it is, 0 to 1
    const p = a, zb = .85 - .59 * p, hz = Math.max(.3, 1.42 - 1.15 * p);
    cap(P(-.45, p * .12, zb + .02), P(.3, p * .12, zb + .02 - .03 * p), .27, .24, fur, 'solid');
    const h = P(.68 + .17 * p, p * .22, hz);
    cap(P(.3, p * .12, zb + .1), h, .13, .1, fur, 'solid'); ball(h[0], h[1], h[2], .12, winter ? WINTER_FUR : FUR, 'solid');
    cap(h, P(.88 + .1 * p, p * .22, hz - .1), .08, .045, light, 'solid');
    for (const [u, v, off] of [[.3, .12, 0], [.3, -.12, 1], [-.38, .12, 1], [-.38, -.12, 0]]) {   // the legs fold and splay to the side as it goes down
      const hip = P(u, v + p * .12, zb - .05), foot = P(u + off * .08 * p, v + p * (.2 + .32 * (v < 0 ? 1.5 : 1)), .05 + p * .1), knee = P(u + .1 * p, v + p * .2, Math.max(.1, (zb + .05) * .55));
      cap(hip, knee, .08, .05, dark, 'solid'); cap(knee, foot, .05, .035, dark, 'solid');
    }
    return;
  }
  const flee = mode === DM_FLEE;
  const stride = flee ? .5 : .28, bob = Math.abs(Math.sin(a)) * (flee ? .08 : .03);
  cap(P(-.45, 0, .85 + bob), P(.3, 0, .88 + bob), .27, .24, fur, 'solid');
  ball(x + fx * .02, y + fy * .02, .72 + bob, .2, FUR_LIGHT, 'solid');
  cap(P(.3, 0, .95 + bob), P(.62, 0, 1.4 - head + bob), .13, .1, fur, 'solid');
  const h = P(.68, 0, 1.42 - head * 1.15 + bob);
  ball(h[0], h[1], h[2], .12, winter ? WINTER_FUR : FUR, 'solid');
  cap(h, P(.88, 0, 1.3 - head * 1.15 + bob), .08, .045, light, 'solid');
  for (const s of [-.1, .1]) cap(P(.6, s, h[2] + .08), P(.58, s * 2.2, h[2] + .26), .05, .015, dark, 'solid');
  if (stag) for (const s of [-.07, .07]) {
    const base = P(.62, s, h[2] + .1), tip = P(.55, s * 3.2, h[2] + .62);
    cap(base, tip, .02, .015, light, 'solid');
    cap(P(.585, s * 2, h[2] + .36), P(.74, s * 2.8, h[2] + .5), .015, .01, light, 'solid');
  }
  cap(P(-.5, 0, .95 + bob), P(-.62, 0, 1.02 + bob), .07, .05, light, 'solid');
  const legs: number[][] = [[.3, .12, 0], [.3, -.12, 3.14], [-.38, .12, 3.14], [-.38, -.12, 0]];
  for (const [u, v, off] of legs) {
    const swing = mode === DM_STILL ? 0 : Math.sin(a + off) * stride;
    cap(P(u, v, .78 + bob), P(u + swing * .5, v, .38 + bob * .5), .08, .05, dark, 'solid');
    cap(P(u + swing * .5, v, .38 + bob * .5), P(u + swing, v, .05), .05, .035, dark, 'solid');
  }
}
function deerEntry(): AtlasEntry {
  return { name: 'deer', variants: 6, yaws: YAW_STEPS, poses: DEER_POSES, draw: (a: AtlasAxes, x: number, y: number, z: number): void => {      // variants 0 to 2: doe, stag, fawn; 3 to 5 the same in the winter coat
    const yaw = a.yaw8 * TAU / YAW_STEPS, kind = a.variant % 3, stag = kind === 1, fawn = kind === 2, winter = a.variant >= 3, s = a.pose;
    if (s < DSLOT_FLEE) paintDeer(x, y, yaw, stag, DM_WALK, (s - DSLOT_WALK) * TAU / DEER_WALK_FRAMES, 0, fawn, winter);
    else if (s < DSLOT_GRAZE) paintDeer(x, y, yaw, stag, DM_FLEE, (s - DSLOT_FLEE) * TAU / DEER_FLEE_FRAMES, 0, fawn, winter);
    else if (s < DSLOT_DEAD) paintDeer(x, y, yaw, stag, DM_STILL, 0, (s - DSLOT_GRAZE) / (DEER_GRAZE_LEVELS - 1) * GRAZE_HEAD, fawn, winter);
    else if (s === DSLOT_DEAD) paintDeer(x, y, yaw, stag, DM_DEAD, 0, 0, fawn, winter, true);
    else if (s === DSLOT_DEAD2) paintDeer(x, y, yaw, stag, DM_DEAD, 0, 0, fawn, winter, false);
    else paintDeer(x, y, yaw, stag, DM_FALL, (s - DSLOT_FALL + 1) / (DEER_FALL_FRAMES + 1) * 1.15, 0, fawn, winter);
  } };
}

export function drawDeer(d: Deer, time: number, atlas: Atlas | null): void {
  if (d.state === DEER_GONE || !onMap(d.x, d.y)) return;
  if (d.species !== 0) { drawBeast(d, time, atlas); return; }
  const dead = d.state === DEER_DEAD, flee = d.state === DEER_FLEE || d.state === DEER_CHASE, grazing = d.state === DEER_GRAZE || d.state === DEER_DRINK;
  const falling = dead && d.timer < FALL_SECONDS, arrow = d.errand !== 9, down = Math.min(1, d.timer / FALL_SECONDS);   // d.timer is the time since it fell
  const mode = falling ? DM_FALL : dead ? DM_DEAD : flee ? DM_FLEE : !grazing && d.path.length > 0 ? DM_WALK : DM_STILL;
  const head = grazing ? Math.max(0, Math.sin(time * .7 + d.phase)) * GRAZE_HEAD : 0;     // now and then the head goes down to the grass
  const fawn = d.age < SPECIES[d.species].adultDays;      // a young deer is drawn smaller
  const coat = winterCoat();
  if (atlas === null) paintDeer(d.x, d.y, d.yaw, d.stag, mode, mode === DM_FALL ? down * down * (3 - 2 * down) : d.phase, head, fawn, coat, arrow);
  else {
    const yaw8 = stepOf(d.yaw, YAW_STEPS);
    const pose = mode === DM_FALL ? DSLOT_FALL + Math.min(DEER_FALL_FRAMES - 1, Math.floor(down * DEER_FALL_FRAMES)) : mode === DM_DEAD ? (arrow ? DSLOT_DEAD : DSLOT_DEAD2) : mode === DM_FLEE ? DSLOT_FLEE + stepOf(d.phase, DEER_FLEE_FRAMES) : mode === DM_WALK ? DSLOT_WALK + stepOf(d.phase, DEER_WALK_FRAMES)
      : DSLOT_GRAZE + Math.round(head / GRAZE_HEAD * (DEER_GRAZE_LEVELS - 1));
    atlas.stamp('deer', { variant: (fawn ? 2 : d.stag ? 1 : 0) + (coat ? 3 : 0), yaw8, pose }, d.x, d.y, 0);
  }
  if (dead) castShadow(d.x, d.y, .3, fawn ? .35 : .55); else castShadow(d.x, d.y, fawn ? .3 : .5, fawn ? .35 : .55);
}

/** The load of a carrier at the world origin, facing `yaw` (the Cite atlas bakes it apart from the body). */
export function paintCarry(carry: number, yaw: number): void { const p = new Person(); p.carry = carry; paintProps(p, yaw, [0, 0, 0]); }
/** Forgets the baked frames of the actors (the Cite baker draws them live; a cached frame would be stamped instead). */
export function forgetActorAtlases(): void { actorAtlases.clear(); }
