import { Color, Palette, Pose, Vec3, figure, dynamicAdd, capsule, sphere, plot, rgb, lerp, castShadow, ripple, Atlas, AtlasAxes, AtlasEntry, AtlasDef, bakeAtlas, headerKey, headerOf } from '../pixel';
import {
  ROLE_SETTLER, ROLE_LUMBERJACK, ROLE_HUNTER, ROLE_FISHER, ROLE_SAWYER, ROLE_SMOKER, ROLE_PORTER, ST_FISH, ST_CHOP, ST_WORK, ST_AIM, ST_SHOT, ST_PICK, ARROW_SECONDS, AIM_SECONDS,
  DEER_GRAZE, DEER_FLEE, DEER_DEAD, DEER_GONE,
} from '../constants';
import { Person, Deer } from '../world/world';
import { isMoving } from '../engine/path';
import { SETTLER_PALETTE, RESIDENT_PALETTE, LUMBERJACK_PALETTE, HUNTER_PALETTE, FISHER_PALETTE, SAWYER_PALETTE, SMOKER_PALETTE, PORTER_PALETTE, HAIR_TONES, FUR, FUR_DARK, FUR_LIGHT, BARK } from '../palettes';

const SCALE = .62;
const PLANK: Color = [214, 180, 120], LOG: Color = [150, 112, 72], LOG_END: Color = [214, 186, 134], STEEL: Color = [176, 182, 180], ARROW: Color = [226, 212, 176];
const solid = (c: Color): ((z: number) => Color) => (): Color => c;

function paletteOf(role: number, hairTone: number): Palette {
  const base = role === ROLE_SETTLER ? SETTLER_PALETTE : role === ROLE_LUMBERJACK ? LUMBERJACK_PALETTE : role === ROLE_HUNTER ? HUNTER_PALETTE : role === ROLE_FISHER ? FISHER_PALETTE : role === ROLE_SAWYER ? SAWYER_PALETTE : role === ROLE_SMOKER ? SMOKER_PALETTE : role === ROLE_PORTER ? PORTER_PALETTE : RESIDENT_PALETTE;
  return { shirt: base.shirt, stripe: base.stripe, legs: base.legs, skin: base.skin, hair: HAIR_TONES[hairTone] };
}

// What a person looks like is a pose (kind and animation angle), a role and a hair tone. The same code paints it live (every bone every frame) or once into the
// atlas, from where it is stamped: a baked frame has the animation angle quantised to WALK_FRAMES or CHOP_FRAMES steps and the heading to eight directions.
const KIND_WALK = 0, KIND_CHOP = 1, KIND_AIM = 2, KIND_FISH = 3, KIND_PICK = 4, KIND_IDLE = 5;
const WALK_FRAMES = 8, CHOP_FRAMES = 6, YAW_STEPS = 8, TAU = Math.PI * 2;
const SLOT_WALK = 0, SLOT_CHOP = WALK_FRAMES, SLOT_AIM = SLOT_CHOP + CHOP_FRAMES, SLOT_FISH = SLOT_AIM + 1, SLOT_PICK = SLOT_FISH + 1, SLOT_IDLE = SLOT_PICK + 1, PERSON_POSES = SLOT_IDLE + 1;
const HAIRS = HAIR_TONES.length, ROLES = 8;
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
  } else if (kind === KIND_PICK) {
    pose.crouch = .5; pose.lean = .35; pose.armR = .9; pose.armL = .9;
  } else pose.z = idleZ;
  return { pose, axe: role === ROLE_LUMBERJACK && kind !== KIND_WALK, fishing };
}
function kindOf(p: Person): number {
  if (isMoving(p)) return KIND_WALK;
  return p.state === ST_CHOP || p.state === ST_WORK ? KIND_CHOP : p.state === ST_AIM || p.state === ST_SHOT ? KIND_AIM : p.state === ST_FISH ? KIND_FISH : p.state === ST_PICK ? KIND_PICK : KIND_IDLE;
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
  if (p.carry === 5 || p.carry === 6) {                              // a folded hide, or a ham, held in front
    const hide = p.carry === 5, c = solid(hide ? [186, 150, 108] : [168, 92, 72]);
    capsule([p.x + fx * .45 + sx * .15, p.y + fy * .45 + sy * .15, .85], [p.x + fx * .45 - sx * .15, p.y + fy * .45 - sy * .15, .85], hide ? .13 : .1, hide ? .13 : .08, c, 'solid');
    if (!hide) sphere(p.x + fx * .45 - sx * .2, p.y + fy * .45 - sy * .2, .85, .12, [150, 78, 62], 'solid');
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
const ACTOR_DEF_VERSION = 1;
export function actorAtlas(): Atlas {
  const def: AtlasDef = { version: ACTOR_DEF_VERSION, season: 0, entries: [personEntry(), deerEntry()] };
  const key = headerKey(headerOf(def));
  const have = actorAtlases.get(key);
  if (have !== undefined) return have;
  if (actorAtlases.size >= 3) actorAtlases.clear();
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
  const kind = kindOf(p), hairTone = p.hair;
  if (atlas === null) {
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
const DM_WALK = 0, DM_FLEE = 1, DM_STILL = 2, DM_DEAD = 3;
const DEER_WALK_FRAMES = 8, DEER_FLEE_FRAMES = 6, DEER_GRAZE_LEVELS = 4, GRAZE_HEAD = .6;
const DSLOT_WALK = 0, DSLOT_FLEE = DEER_WALK_FRAMES, DSLOT_GRAZE = DSLOT_FLEE + DEER_FLEE_FRAMES, DSLOT_DEAD = DSLOT_GRAZE + DEER_GRAZE_LEVELS, DEER_POSES = DSLOT_DEAD + 1;

/** One deer from the same capsules and spheres as the cat and the gull of the harbour. `a` is the stride angle, `head` how far the head is down to the grass. */
function paintDeer(x: number, y: number, yaw: number, stag: boolean, mode: number, a: number, head: number): void {
  const fx = Math.cos(yaw), fy = Math.sin(yaw), sx = -fy, sy = fx;
  const P = (u: number, v: number, c: number): Vec3 => [x + fx * u + sx * v, y + fy * u + sy * v, c];
  const fur = solid(FUR), dark = solid(FUR_DARK), light = solid(FUR_LIGHT);
  if (mode === DM_DEAD) {
    capsule(P(-.4, 0, .26), P(.35, 0, .28), .26, .23, fur, 'solid');
    capsule(P(.35, 0, .3), P(.75, .15, .2), .12, .08, fur, 'solid'); sphere(x + fx * .85 + sx * .2, y + fy * .85 + sy * .2, .17, .1, FUR_DARK, 'solid');
    for (const [u, v] of [[-.35, .26], [.3, .26]]) capsule(P(u, v, .22), P(u + .1, v + .5, .16), .06, .04, dark, 'solid');
    return;
  }
  const flee = mode === DM_FLEE;
  const stride = flee ? .5 : .28, bob = Math.abs(Math.sin(a)) * (flee ? .08 : .03);
  capsule(P(-.45, 0, .85 + bob), P(.3, 0, .88 + bob), .27, .24, fur, 'solid');
  sphere(x + fx * .02, y + fy * .02, .72 + bob, .2, FUR_LIGHT, 'solid');
  capsule(P(.3, 0, .95 + bob), P(.62, 0, 1.4 - head + bob), .13, .1, fur, 'solid');
  const h = P(.68, 0, 1.42 - head * 1.15 + bob);
  sphere(h[0], h[1], h[2], .12, FUR, 'solid');
  capsule(h, P(.88, 0, 1.3 - head * 1.15 + bob), .08, .045, light, 'solid');
  for (const s of [-.1, .1]) capsule(P(.6, s, h[2] + .08), P(.58, s * 2.2, h[2] + .26), .05, .015, dark, 'solid');
  if (stag) for (const s of [-.07, .07]) {
    const base = P(.62, s, h[2] + .1), tip = P(.55, s * 3.2, h[2] + .62);
    capsule(base, tip, .02, .015, light, 'solid');
    capsule(P(.585, s * 2, h[2] + .36), P(.74, s * 2.8, h[2] + .5), .015, .01, light, 'solid');
  }
  capsule(P(-.5, 0, .95 + bob), P(-.62, 0, 1.02 + bob), .07, .05, light, 'solid');
  const legs: number[][] = [[.3, .12, 0], [.3, -.12, 3.14], [-.38, .12, 3.14], [-.38, -.12, 0]];
  for (const [u, v, off] of legs) {
    const swing = mode === DM_STILL ? 0 : Math.sin(a + off) * stride;
    capsule(P(u, v, .78 + bob), P(u + swing * .5, v, .38 + bob * .5), .08, .05, dark, 'solid');
    capsule(P(u + swing * .5, v, .38 + bob * .5), P(u + swing, v, .05), .05, .035, dark, 'solid');
  }
}
function deerEntry(): AtlasEntry {
  return { name: 'deer', variants: 2, yaws: YAW_STEPS, poses: DEER_POSES, draw: (a: AtlasAxes, x: number, y: number, z: number): void => {
    const yaw = a.yaw8 * TAU / YAW_STEPS, stag = a.variant === 1, s = a.pose;
    if (s < DSLOT_FLEE) paintDeer(x, y, yaw, stag, DM_WALK, (s - DSLOT_WALK) * TAU / DEER_WALK_FRAMES, 0);
    else if (s < DSLOT_GRAZE) paintDeer(x, y, yaw, stag, DM_FLEE, (s - DSLOT_FLEE) * TAU / DEER_FLEE_FRAMES, 0);
    else if (s < DSLOT_DEAD) paintDeer(x, y, yaw, stag, DM_STILL, 0, (s - DSLOT_GRAZE) / (DEER_GRAZE_LEVELS - 1) * GRAZE_HEAD);
    else paintDeer(x, y, yaw, stag, DM_DEAD, 0, 0);
  } };
}

export function drawDeer(d: Deer, time: number, atlas: Atlas | null): void {
  if (d.state === DEER_GONE) return;
  const dead = d.state === DEER_DEAD, flee = d.state === DEER_FLEE, grazing = d.state === DEER_GRAZE;
  const mode = dead ? DM_DEAD : flee ? DM_FLEE : !grazing && d.path.length > 0 ? DM_WALK : DM_STILL;
  const head = grazing ? Math.max(0, Math.sin(time * .7 + d.phase)) * GRAZE_HEAD : 0;     // now and then the head goes down to the grass
  if (atlas === null) paintDeer(d.x, d.y, d.yaw, d.stag, mode, d.phase, head);
  else {
    const yaw8 = stepOf(d.yaw, YAW_STEPS);
    const pose = mode === DM_DEAD ? DSLOT_DEAD : mode === DM_FLEE ? DSLOT_FLEE + stepOf(d.phase, DEER_FLEE_FRAMES) : mode === DM_WALK ? DSLOT_WALK + stepOf(d.phase, DEER_WALK_FRAMES)
      : DSLOT_GRAZE + Math.round(head / GRAZE_HEAD * (DEER_GRAZE_LEVELS - 1));
    atlas.stamp('deer', { variant: d.stag ? 1 : 0, yaw8, pose }, d.x, d.y, 0);
  }
  if (dead) castShadow(d.x, d.y, .3, .55); else castShadow(d.x, d.y, .5, .55);
}

/** Thin smoke over a chimney: a few pixels that drift up and fade, out of phase. */
export function drawSmoke(x: number, y: number, z: number, time: number, seed: number): void {
  for (let k = 0; k < 5; k++) {
    const age = (time * .13 + k * .2 + seed * .37) % 1;
    plot(x + age * .7 + Math.sin(time * .6 + seed) * .1, y - age * .2, z + age * 2, rgb(210 + age * 28, 211 + age * 25, 199 + age * 26));
  }
}
