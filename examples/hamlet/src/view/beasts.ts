import { Color, Vec3, capsule, sphere, plot, rgb, castShadow, Atlas, AtlasAxes, AtlasEntry } from '../pixel';
import { DEER_FLEE, DEER_CHARGE, DEER_DEAD, DEER_GONE, DEER_GRAZE, DEER_DRINK, DEER_REST, DEER_STALK, DEER_CHASE, DEER_EAT, DEER_HOWL } from '../constants';
import { Deer, tileX, tileY } from '../world/world';
import { season } from '../rules/season';
import { SPECIES, SP_RABBIT, SP_WOLF, KIND_HOPPER } from '../rules/species';
import { RABBIT_FUR, RABBIT_DARK, RABBIT_LIGHT, BOAR_FUR, BOAR_DARK, BOAR_LIGHT, WOLF_FUR, WOLF_DARK, WOLF_LIGHT, WOLF_WINTER, WOLF_WINTER_DARK, WOLF_ALPHA } from '../palettes';
import { winterCoat } from './seasons';

// The small wild species, rabbit and boar: one quadruped model with a few measures per species, painted live or once into the atlas like the deer
// (heading in eight steps, the stride in 8 and 6 steps, the head up or down, dead). A rabbit hops: all four legs together and the body leaving the ground.
const TAU = Math.PI * 2, YAW_STEPS = 8;
const WALK_FRAMES = 8, FLEE_FRAMES = 6;
const SLOT_FLEE = WALK_FRAMES, SLOT_STILL = SLOT_FLEE + FLEE_FRAMES, SLOT_DEAD = SLOT_STILL + 2, POSES = SLOT_DEAD + 1;
const M_WALK = 0, M_FLEE = 1, M_STILL = 2, M_DEAD = 3, M_CROUCH = 4, M_HOWL = 5;
// the wolf has two more kinds of pose after the common ones: the stalk (low, slow, in the walk's frames) and the howl
const CROUCH_FRAMES = 6, WOLF_POSES = POSES + CROUCH_FRAMES + 1, SLOT_CROUCH = POSES, SLOT_HOWL = SLOT_CROUCH + CROUCH_FRAMES;
const solid = (c: Color): ((z: number) => Color) => (): Color => c;
const stepOf = (angle: number, steps: number): number => { const k = Math.round(angle / TAU * steps) % steps; return k < 0 ? k + steps : k; };

class Build { wolf: boolean = false; fur: Color = [0, 0, 0]; dark: Color = [0, 0, 0]; light: Color = [0, 0, 0]; half: number = .4; r: number = .2; belly: number = .4; headR: number = .1; ear: number = .1; tusk: boolean = false; hop: boolean = false; }
function buildOf(species: number, winter: boolean = false, alpha: boolean = false): Build {
  const b = new Build();
  if (species === SP_WOLF) {
    b.wolf = true; b.fur = alpha ? WOLF_ALPHA : winter ? WOLF_WINTER : WOLF_FUR; b.dark = winter ? WOLF_WINTER_DARK : WOLF_DARK; b.light = WOLF_LIGHT;
    b.half = .46; b.r = .17; b.belly = .52; b.headR = .11; b.ear = .1;
    return b;
  }
  if (species === SP_RABBIT) { b.fur = RABBIT_FUR; b.dark = RABBIT_DARK; b.light = RABBIT_LIGHT; b.half = .17; b.r = .1; b.belly = .17; b.headR = .065; b.ear = .22; b.hop = true; }
  else { b.fur = BOAR_FUR; b.dark = BOAR_DARK; b.light = BOAR_LIGHT; b.half = .42; b.r = .26; b.belly = .45; b.headR = .15; b.ear = .08; b.tusk = true; }
  return b;
}

/** `a` is the stride angle, `head` how far the head is down, `young` paints the piglet or the kit smaller. */
function paintBeast(species: number, x: number, y: number, yaw: number, mode: number, a: number, head: number, young: boolean, winter: boolean = false, alpha: boolean = false): void {
  const b = buildOf(species, winter, alpha), fx = Math.cos(yaw), fy = Math.sin(yaw), sx = -fy, sy = fx, k = young ? .65 : alpha ? 1.15 : 1;
  const T = (p: Vec3): Vec3 => [x + (p[0] - x) * k, y + (p[1] - y) * k, p[2] * k];
  const cap = (p: Vec3, q: Vec3, r1: number, r2: number, c: Color): void => capsule(T(p), T(q), r1 * k, r2 * k, solid(c), 'solid');
  const ball = (p: Vec3, r: number, c: Color): void => { const q = T(p); sphere(q[0], q[1], q[2], r * k, c, 'solid'); };
  const P = (u: number, v: number, z: number): Vec3 => [x + fx * u + sx * v, y + fy * u + sy * v, z];
  if (mode === M_DEAD) {
    cap(P(-b.half, 0, b.r), P(b.half, 0, b.r * 1.1), b.r, b.r * .9, b.fur); ball(P(b.half + b.headR, b.r * .5, b.headR), b.headR, b.fur);
    for (const u of [-b.half * .6, b.half * .6]) cap(P(u, b.r * .8, b.r * .7), P(u + .05, b.r * 1.6, b.r * .4), b.r * .3, b.r * .2, b.dark);
    return;
  }
  if (b.wolf) { paintWolf(b, P, cap, ball, mode, a, head); return; }
  const flee = mode === M_FLEE, swingK = b.hop ? .5 : flee ? .5 : .28;
  const bob = b.hop ? Math.max(0, Math.sin(a)) * (flee ? .2 : .13) : Math.abs(Math.sin(a)) * (flee ? .06 : .025);
  const z = b.belly + bob;
  cap(P(-b.half, 0, z), P(b.half * .7, 0, z + b.r * .15), b.r, b.r * .9, b.fur);
  const hz = z + b.r * .2 - head * b.half, hu = b.half * .7 + b.headR * 1.2;
  ball(P(hu, 0, hz), b.headR, b.fur);
  cap(P(hu, 0, hz - b.headR * .1), P(hu + b.headR * 1.4, 0, hz - b.headR * .4), b.headR * .6, b.headR * .35, b.light);
  for (const s of [-1, 1]) {
    if (b.hop) cap(P(hu - b.headR * .4, s * b.headR * .5, hz + b.headR * .6), P(hu - b.headR * 1.6, s * b.headR * .8, hz + b.ear + b.headR), b.headR * .35, b.headR * .25, b.fur);
    else cap(P(hu - b.headR * .2, s * b.headR * .7, hz + b.headR * .7), P(hu - b.headR * .5, s * b.headR * 1.2, hz + b.headR * 1.4), b.headR * .4, b.headR * .15, b.dark);
    if (b.tusk) cap(P(hu + b.headR * 1.1, s * b.headR * .55, hz - b.headR * .55), P(hu + b.headR * 1.5, s * b.headR * .7, hz - b.headR * .1), b.headR * .13, b.headR * .06, b.light);
  }
  if (b.hop) ball(P(-b.half - b.r * .6, 0, z + b.r * .3), b.r * .5, b.light);
  else cap(P(-b.half, 0, z + b.r * .2), P(-b.half - .12, 0, z - b.r * .2), .03, .02, b.dark);
  const legs: number[][] = [[b.half * .6, b.r * .6, 0], [b.half * .6, -b.r * .6, b.hop ? 0 : 3.14], [-b.half * .6, b.r * .6, b.hop ? 0 : 3.14], [-b.half * .6, -b.r * .6, 0]];
  for (const [u, v, off] of legs) {
    const swing = mode === M_STILL ? 0 : Math.sin(a + off) * swingK * b.belly;
    const knee = Math.max(.05, z * .5 - (b.hop ? bob * .5 : 0));
    cap(P(u, v, z - b.r * .2), P(u + swing * .5, v, knee), b.r * .35, b.r * .22, b.dark);
    cap(P(u + swing * .5, v, knee), P(u + swing, v, b.hop && bob > .02 ? knee * .6 : .03), b.r * .22, b.r * .16, b.dark);
  }
}

/** The wolf: long legs, a deep chest, a long muzzle, upright ears and a brush that hangs (it is held out stiff when running). Crouching drops the body and the head; howling lifts the head to the sky. */
function paintWolf(b: Build, P: (u: number, v: number, z: number) => Vec3, cap: (p: Vec3, q: Vec3, r1: number, r2: number, c: Color) => void, ball: (p: Vec3, r: number, c: Color) => void, mode: number, a: number, head: number): void {
  const flee = mode === M_FLEE, crouch = mode === M_CROUCH, howl = mode === M_HOWL, still = mode === M_STILL || howl;
  const bob = crouch ? 0 : Math.abs(Math.sin(a)) * (flee ? .07 : .02), z = b.belly - (crouch ? .24 : 0) + bob;
  cap(P(-b.half, 0, z), P(b.half * .8, 0, z + b.r * .3), b.r * .95, b.r * 1.1, b.fur);                    // the body, the chest deeper than the haunch
  ball(P(b.half * .55, 0, z + b.r * .35), b.r * 1.05, b.light);                                         // the pale chest
  const hz = howl ? z + b.r * 1.7 : crouch ? z - b.r * .3 : z + b.r * .5 - head * b.half * .6, hu = b.half + b.headR * (howl ? .5 : crouch ? 1.4 : 1.1);
  cap(P(b.half * .7, 0, z + b.r * .5), P(hu, 0, hz), b.r * .6, b.headR * .9, b.fur);                    // the neck
  ball(P(hu, 0, hz), b.headR, b.fur);
  const snout = howl ? [.7, .9] : [1.6, -.2];
  cap(P(hu, 0, hz - b.headR * .1), P(hu + b.headR * snout[0], 0, hz + b.headR * snout[1]), b.headR * .6, b.headR * .32, b.light);   // the long muzzle, up when it howls
  for (const s of [-1, 1]) cap(P(hu - b.headR * .3, s * b.headR * .6, hz + b.headR * .7), P(hu - b.headR * .55, s * b.headR * .85, hz + b.headR * 2), b.headR * .4, b.headR * .1, b.dark);
  const tailUp = flee ? .1 : crouch ? -.05 : -.2;
  cap(P(-b.half, 0, z + b.r * .1), P(-b.half - .35, 0, z + b.r * .1 + tailUp * 1.2 - (flee ? 0 : .15)), .05, .035, b.fur);
  const legs: number[][] = [[b.half * .6, b.r * .6, 0], [b.half * .6, -b.r * .6, 3.14], [-b.half * .6, b.r * .6, 3.14], [-b.half * .6, -b.r * .6, 0]];
  for (const [u, v, off] of legs) {
    const swing = still ? 0 : Math.sin(a + off) * (flee ? .5 : crouch ? .12 : .26) * b.belly, knee = Math.max(.05, z * .5);
    cap(P(u, v, z - b.r * .2), P(u + swing * .5, v, knee), b.r * .35, b.r * .22, b.dark);
    cap(P(u + swing * .5, v, knee), P(u + swing, v, .03), b.r * .22, b.r * .15, b.dark);
  }
}

export function beastEntries(): AtlasEntry[] {
  const make = (name: string, species: number, variants: number, poses: number): AtlasEntry => ({ name, variants, yaws: YAW_STEPS, poses, draw: (a: AtlasAxes, x: number, y: number, z: number): void => {
    const yaw = a.yaw8 * TAU / YAW_STEPS, young = a.variant % 3 === 1, alpha = a.variant % 3 === 2, winter = a.variant >= 3, s = a.pose;     // variants: adult, young (and for the wolf alpha), the same in the winter coat
    if (s < SLOT_FLEE) paintBeast(species, x, y, yaw, M_WALK, s * TAU / WALK_FRAMES, 0, young, winter, alpha);
    else if (s < SLOT_STILL) paintBeast(species, x, y, yaw, M_FLEE, (s - SLOT_FLEE) * TAU / FLEE_FRAMES, 0, young, winter, alpha);
    else if (s < SLOT_DEAD) paintBeast(species, x, y, yaw, M_STILL, 0, s - SLOT_STILL === 0 ? 0 : .8, young, winter, alpha);
    else if (s < POSES) paintBeast(species, x, y, yaw, M_DEAD, 0, 0, young, winter, alpha);
    else if (s < SLOT_HOWL) paintBeast(species, x, y, yaw, M_CROUCH, (s - SLOT_CROUCH) * TAU / CROUCH_FRAMES, .6, young, winter, alpha);
    else paintBeast(species, x, y, yaw, M_HOWL, 0, 0, young, winter, alpha);
  } });
  return [make('rabbit', 1, 2, POSES), make('boar', 2, 2, POSES), make('wolf', 3, 6, WOLF_POSES)];
}

/** The rabbit's burrow: a low mound of earth with a dark mouth, at its home tile; in winter the rabbit sits in it, out of sight (engine/deer.ts). */
function drawBurrow(d: Deer): void {
  const x = tileX(d.home) + (d.id % 5 - 2) * .1, y = tileY(d.home) + (d.id % 3 - 1) * .1;
  sphere(x, y, -.04, .26, [112, 88, 62], 'solid'); sphere(x + .05, y - .05, .02, .12, [86, 66, 46], 'solid'); plot(x + .12, y - .1, .1, rgb(16, 12, 10));
}
export function drawBeast(d: Deer, time: number, atlas: Atlas | null): void {
  if (d.state === DEER_GONE) return;
  const sp = SPECIES[d.species], wolf = d.species === SP_WOLF;
  if (d.species === SP_RABBIT && d.home >= 0) {
    drawBurrow(d);
    if (season() === 3 && d.state === DEER_REST && Math.abs(d.x - tileX(d.home)) + Math.abs(d.y - tileY(d.home)) < 1.6) return;      // in its burrow
  }
  const dead = d.state === DEER_DEAD, flee = d.state === DEER_FLEE || d.state === DEER_CHARGE || d.state === DEER_CHASE, grazing = d.state === DEER_GRAZE || d.state === DEER_DRINK || d.state === DEER_EAT;
  const crouch = d.state === DEER_STALK, howl = d.state === DEER_HOWL;
  const mode = dead ? M_DEAD : howl ? M_HOWL : crouch ? M_CROUCH : flee ? M_FLEE : !grazing && d.speed > .05 ? M_WALK : M_STILL;
  const down = grazing && (d.state === DEER_EAT || Math.sin(time * .9 + d.phase) > .2) ? .8 : 0, young = d.age < sp.adultDays, hopper = sp.kind === KIND_HOPPER;
  const alpha = wolf && d.stag, winter = wolf && winterCoat();
  if (atlas === null) paintBeast(d.species, d.x, d.y, d.yaw, mode, mode === M_CROUCH ? d.phase * .5 : d.phase, down, young, winter, alpha);
  else {
    const yaw8 = stepOf(d.yaw, YAW_STEPS), name = wolf ? 'wolf' : hopper ? 'rabbit' : 'boar';
    const pose = mode === M_DEAD ? SLOT_DEAD : mode === M_HOWL ? SLOT_HOWL : mode === M_CROUCH ? SLOT_CROUCH + stepOf(d.phase * .5, CROUCH_FRAMES) : mode === M_FLEE ? SLOT_FLEE + stepOf(d.phase, FLEE_FRAMES) : mode === M_WALK ? stepOf(d.phase, WALK_FRAMES) : SLOT_STILL + (down > 0 ? 1 : 0);
    atlas.stamp(name, { variant: (young ? 1 : alpha ? 2 : 0) + (winter ? 3 : 0), yaw8, pose }, d.x, d.y, 0);
  }
  const r = hopper ? .15 : wolf ? .32 : .4;
  castShadow(d.x, d.y, young ? r * .4 : r * .6, young ? r * .7 : r);
}
