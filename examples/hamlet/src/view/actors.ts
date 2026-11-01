import { Color, Palette, Pose, Vec3, figure, dynamicAdd, capsule, sphere, plot, rgb, lerp, castShadow, ripple } from '../pixel';
import {
  ROLE_SETTLER, ROLE_LUMBERJACK, ROLE_HUNTER, ROLE_FISHER, ST_FISH, ST_CHOP, ST_AIM, ST_SHOT, ST_PICK, ARROW_SECONDS, AIM_SECONDS,
  DEER_GRAZE, DEER_FLEE, DEER_DEAD, DEER_GONE,
} from '../constants';
import { Person, Deer } from '../world/world';
import { isMoving } from '../engine/path';
import { SETTLER_PALETTE, RESIDENT_PALETTE, LUMBERJACK_PALETTE, HUNTER_PALETTE, FISHER_PALETTE, HAIR_TONES, FUR, FUR_DARK, FUR_LIGHT, BARK } from '../palettes';

const SCALE = .62;
const LOG: Color = [150, 112, 72], LOG_END: Color = [214, 186, 134], STEEL: Color = [176, 182, 180], ARROW: Color = [226, 212, 176];
const solid = (c: Color): ((z: number) => Color) => (): Color => c;

function paletteOf(p: Person): Palette {
  const base = p.role === ROLE_SETTLER ? SETTLER_PALETTE : p.role === ROLE_LUMBERJACK ? LUMBERJACK_PALETTE : p.role === ROLE_HUNTER ? HUNTER_PALETTE : p.role === ROLE_FISHER ? FISHER_PALETTE : RESIDENT_PALETTE;
  return { shirt: base.shirt, stripe: base.stripe, legs: base.legs, skin: base.skin, hair: HAIR_TONES[p.hair] };
}

/** People are the same lit volumes as the rest of the diorama (figure() of the shared renderer), never flat sprites. */
export function drawPerson(p: Person, time: number): void {
  const fx = Math.cos(p.yaw), fy = Math.sin(p.yaw), sx = -fy, sy = fx;
  const moving = isMoving(p);
  const pose: Pose = { scale: SCALE, stance: .12, z: 0 };
  let axe = false, bow = 0, fishing = false;
  if (moving) {
    const swing = Math.sin(p.phase);
    pose.stance = .08 + Math.abs(swing) * .16; pose.z = Math.abs(swing) * .035 * SCALE;
    pose.armR = swing * .55; pose.armL = .08 - swing * .55; pose.lean = .04;
  } else if (p.state === ST_CHOP) {
    pose.armR = 1.35 + Math.sin(p.phase * 4.2) * .85; pose.armL = 1.0; pose.lean = .16 + Math.max(0, Math.sin(p.phase * 4.2)) * .1; pose.crouch = .08;
    axe = true;
  } else if (p.state === ST_AIM || p.state === ST_SHOT) {
    pose.armR = 1.52; pose.armL = 1.5; pose.stance = .2; pose.lean = -.03;
    bow = p.state === ST_SHOT ? 0 : 1 - p.timer / AIM_SECONDS;
  } else if (p.state === ST_FISH) {
    pose.armR = 1.25; pose.armL = 1.1; pose.lean = .08; pose.crouch = .1; pose.stance = .14;
    fishing = true;
  } else if (p.state === ST_PICK) {
    pose.crouch = .5; pose.lean = .35; pose.armR = .9; pose.armL = .9;
  } else {
    pose.z = Math.sin(time * 1.6 + p.hair * 2) * .01;                 // breathing, barely
  }
  const hand = figure(p.x, p.y, p.yaw, pose, paletteOf(p), dynamicAdd);
  if (p.role === ROLE_LUMBERJACK && (axe || !moving)) {
    const a = (pose.armR === undefined ? 0 : pose.armR) + .18;
    const tip: Vec3 = [hand[0] + fx * Math.sin(a) * .5, hand[1] + fy * Math.sin(a) * .5, hand[2] - Math.cos(a) * .5];
    capsule(hand, tip, .035, .03, solid(BARK), 'solid');
    capsule(tip, [tip[0] + fx * Math.sin(a) * .12 + sx * .02, tip[1] + fy * Math.sin(a) * .12, tip[2] - Math.cos(a) * .12], .09, .045, solid(STEEL), 'solid');
  }
  if (bow !== 0 || p.state === ST_SHOT || p.state === ST_AIM) {
    const cx = p.x + fx * .55, cy = p.y + fy * .55, cz = 1.0;
    const top: Vec3 = [cx + sx * .4 - fx * .1, cy + sy * .4 - fy * .1, cz], mid: Vec3 = [cx + fx * .08, cy + fy * .08, cz], low: Vec3 = [cx - sx * .4 - fx * .1, cy - sy * .4 - fy * .1, cz];
    capsule(top, mid, .03, .03, solid(BARK), 'solid'); capsule(mid, low, .03, .03, solid(BARK), 'solid');
    const pull = p.state === ST_AIM ? bow * .3 : 0;
    for (let k = 0; k <= 12; k++) plot(lerp(top[0], low[0], k / 12) - fx * (.1 + pull * Math.sin(k / 12 * Math.PI)), lerp(top[1], low[1], k / 12) - fy * (.1 + pull * Math.sin(k / 12 * Math.PI)), cz, rgb(226, 220, 196));
  }
  if (fishing) {                                                      // a rod, a taut line, a bobber that dips now and then
    const tip: Vec3 = [hand[0] + fx * .9, hand[1] + fy * .9, hand[2] + .75];
    capsule(hand, tip, .03, .015, solid(BARK), 'solid');
    const bx = p.x + fx * 2.1, by = p.y + fy * 2.1, dip = Math.max(0, Math.sin(p.phase * 2.3 + p.hair)) > .92 ? -.05 : .02;
    for (let k = 0; k <= 14; k++) { const t = k / 14; plot(lerp(tip[0], bx, t), lerp(tip[1], by, t), lerp(tip[2], dip, t) - Math.sin(t * Math.PI) * .12, rgb(214, 212, 180)); }
    sphere(bx, by, dip + .05, .07, [165, 79, 56], 'solid');
    ripple(bx, by, .15 + (p.phase * .25) % .4, rgb(143, 177, 146), true);
  }
  if (p.carry === 3) {                                                // the catch in hand
    capsule([p.x + fx * .35 + sx * .3, p.y + fy * .35 + sy * .3, .75], [p.x + fx * .55 + sx * .3, p.y + fy * .55 + sy * .3, .7], .07, .04, solid([150, 178, 166]), 'solid');
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

/** A deer is built from the same capsules and spheres as the cat and the gull of the harbour. */
export function drawDeer(d: Deer, time: number): void {
  if (d.state === DEER_GONE) return;
  const fx = Math.cos(d.yaw), fy = Math.sin(d.yaw), sx = -fy, sy = fx;
  const P = (a: number, b: number, c: number): Vec3 => [d.x + fx * a + sx * b, d.y + fy * a + sy * b, c];
  const fur = solid(FUR), dark = solid(FUR_DARK), light = solid(FUR_LIGHT);
  if (d.state === DEER_DEAD) {
    capsule(P(-.4, 0, .26), P(.35, 0, .28), .26, .23, fur, 'solid');
    capsule(P(.35, 0, .3), P(.75, .15, .2), .12, .08, fur, 'solid'); sphere(d.x + fx * .85 + sx * .2, d.y + fy * .85 + sy * .2, .17, .1, FUR_DARK, 'solid');
    for (const [a, b] of [[-.35, .26], [.3, .26]]) capsule(P(a, b, .22), P(a + .1, b + .5, .16), .06, .04, dark, 'solid');
    castShadow(d.x, d.y, .3, .55);
    return;
  }
  const flee = d.state === DEER_FLEE, grazing = d.state === DEER_GRAZE;
  const stride = flee ? .5 : .28, bob = Math.abs(Math.sin(d.phase)) * (flee ? .08 : .03);
  const head = grazing ? Math.max(0, Math.sin(time * .7 + d.phase)) * .6 : 0;       // now and then the head goes down to the grass
  capsule(P(-.45, 0, .85 + bob), P(.3, 0, .88 + bob), .27, .24, fur, 'solid');
  sphere(d.x + fx * .02 + sx * 0, d.y + fy * .02, .72 + bob, .2, FUR_LIGHT, 'solid');
  capsule(P(.3, 0, .95 + bob), P(.62, 0, 1.4 - head + bob), .13, .1, fur, 'solid');
  const h = P(.68, 0, 1.42 - head * 1.15 + bob);
  sphere(h[0], h[1], h[2], .12, FUR, 'solid');
  capsule(h, P(.88, 0, 1.3 - head * 1.15 + bob), .08, .045, light, 'solid');
  for (const s of [-.1, .1]) capsule(P(.6, s, h[2] + .08), P(.58, s * 2.2, h[2] + .26), .05, .015, dark, 'solid');
  if (d.stag) for (const s of [-.07, .07]) {
    const base = P(.62, s, h[2] + .1), tip = P(.55, s * 3.2, h[2] + .62);
    capsule(base, tip, .02, .015, light, 'solid');
    capsule(P(.585, s * 2, h[2] + .36), P(.74, s * 2.8, h[2] + .5), .015, .01, light, 'solid');
  }
  capsule(P(-.5, 0, .95 + bob), P(-.62, 0, 1.02 + bob), .07, .05, light, 'solid');
  const legs: number[][] = [[.3, .12, 0], [.3, -.12, 3.14], [-.38, .12, 3.14], [-.38, -.12, 0]];
  for (const [a, b, off] of legs) {
    const swing = d.state === DEER_GRAZE || (!flee && d.path.length === 0) ? 0 : Math.sin(d.phase + off) * stride;
    capsule(P(a, b, .78 + bob), P(a + swing * .5, b, .38 + bob * .5), .08, .05, dark, 'solid');
    capsule(P(a + swing * .5, b, .38 + bob * .5), P(a + swing, b, .05), .05, .035, dark, 'solid');
  }
  castShadow(d.x, d.y, .5, .55);
}

/** Thin smoke over a chimney: a few pixels that drift up and fade, out of phase. */
export function drawSmoke(x: number, y: number, z: number, time: number, seed: number): void {
  for (let k = 0; k < 5; k++) {
    const age = (time * .13 + k * .2 + seed * .37) % 1;
    plot(x + age * .7 + Math.sin(time * .6 + seed) * .1, y - age * .2, z + age * 2, rgb(210 + age * 28, 211 + age * 25, 199 + age * 26));
  }
}
