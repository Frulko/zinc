import { sphere, capsule, plot, project, rgb, castShadow } from '../renderer.js';
import { game } from './state.js';

// These animals use the same lit spheres and tapered limbs as the original figures.
const CAT_FUR = [144, 118, 88];
const CAT_LIGHT = [174, 150, 115];
const CAT_STRIPE = [102, 85, 69];
const CAT_CHEST = [214, 200, 168];
const GULL_WHITE = [224, 224, 205];
const GULL_WING = [137, 152, 146];
const GULL_TIP = [70, 84, 85];
const GULL_BEAK = [182, 144, 80];
const FISH_BACK = [104, 143, 128];
const FISH_BELLY = [151, 173, 148];
const FISH_FIN = [91, 123, 113];
const catFur = () => CAT_FUR;
const catStripe = () => CAT_STRIPE;
const gullWhite = () => GULL_WHITE;
const gullWing = () => GULL_WING;
const gullTip = () => GULL_TIP;
const gullBeak = () => GULL_BEAK;
const fishBack = () => FISH_BACK;
const fishFin = () => FISH_FIN;

export const animalBounds = { cat: null, gull: null, fish: null };
export const animalReaction = { catUntil: 0, gullUntil: 0, fishUntil: 0 };

function boundsAt(x, y, z, width, height) {
  const point = project(x, y, z);
  return { x: point.sx - width / 2, y: point.sy - height, width, height: height + 4 };
}

function drawCat(time) {
  const x = -3.9, y = .5, floor = .91;
  const awake = animalReaction.catUntil > game.time;
  const stretch = awake ? Math.sin(time * 3) * .08 : 0;
  const head = .65 + stretch;
  for (const side of [-.18, .18]) {
    capsule([x - .42, y + side, floor + .06], [x - .31, y + side, floor + .37], .085, .15, catFur, 'solid');
    capsule([x + .31, y + side, floor + .06], [x + .27, y + side, floor + .46], .075, .12, catFur, 'solid');
  }
  capsule([x - .4, y, floor + .36], [x + .17, y, floor + .43], .28, .32, catFur, 'solid');
  sphere(x + .27, y, floor + .42, .22, CAT_CHEST, 'solid');
  sphere(x + .48, y, floor + head, .25, CAT_LIGHT, 'solid');
  sphere(x + .65, y, floor + head - .07, .11, CAT_CHEST, 'solid');
  for (const side of [-.16, .16]) {
    capsule([x + .46, y + side, floor + head + .15], [x + .48, y + side, floor + head + .36], .105, .02, catFur, 'solid');
  }
  // Broad tabby bands follow the body volume, without outlined facial features.
  for (const stripe of [-.3, -.06, .15]) {
    capsule([x + stripe, y + .22, floor + .39], [x + stripe - .03, y + .15, floor + .62], .052, .055, catStripe, 'solid');
  }
  const tail = Math.sin(time * (awake ? 4 : .9)) * (awake ? .23 : .09);
  capsule([x - .57, y, floor + .38], [x - .9, y + tail, floor + .57], .095, .065, catFur, 'solid');
  capsule([x - .9, y + tail, floor + .57], [x - 1, y + tail + .13, floor + .85], .065, .025, catFur, 'solid');
  if (Math.floor(time * 4) % 23 !== 0) plot(x + .62, y + .18, floor + head + .03, rgb(57, 62, 48));
  castShadow(x, y, floor + .35, .48);
  animalBounds.cat = boundsAt(x, y, floor, 22, 14);
}

function drawGull(time) {
  const flying = animalReaction.gullUntil > game.time || time % 18 > 12;
  const travel = time * .75;
  const x = flying ? 1.3 + Math.sin(travel) * 2.5 : -1.7;
  const y = flying ? -3 + Math.cos(travel) * 1.5 : -3;
  const z = flying ? 4.2 + Math.sin(time * 2) * .25 : 1.28;
  capsule([x - .26, y, z + .2], [x + .2, y, z + .24], .16, .21, gullWhite, 'solid');
  sphere(x + .28, y, z + .46, .16, GULL_WHITE, 'solid');
  capsule([x + .4, y, z + .44], [x + .64, y, z + .42], .055, .018, gullBeak, 'solid');
  capsule([x - .22, y, z + .25], [x - .48, y, z + .22], .11, .025, gullTip, 'solid');
  if (flying) {
    const lift = Math.sin(Math.floor(time * 8) * Math.PI / 3) * .55;
    for (const side of [-1, 1]) {
      capsule([x, y + side * .10, z + .3], [x - .1, y + side * .67, z + .3 + lift], .15, .11, gullWhite, 'solid');
      capsule([x - .1, y + side * .67, z + .3 + lift], [x - .4, y + side * 1.12, z + .25 + lift], .11, .025, gullTip, 'solid');
    }
  } else {
    for (const side of [-.12, .12]) {
      capsule([x - .1, y + side, z + .27], [x - .34, y + side, z + .22], .12, .04, gullWing, 'solid');
      capsule([x + .03, y + side, z], [x + .03, y + side, z + .15], .025, .025, gullBeak, 'solid');
    }
  }
  plot(x + .37, y + .105, z + .5, rgb(48, 57, 54));
  castShadow(x, y, z + .2, .28);
  animalBounds.gull = boundsAt(x, y, z, flying ? 25 : 17, 10);
}

function fishModel(x, y, z, yaw, time, underwater) {
  const fx = Math.cos(yaw), fy = Math.sin(yaw);
  const sideX = -fy, sideY = fx;
  const tail = Math.sin(time * 7) * .12;
  capsule([x - fx * .28, y - fy * .28, z], [x + fx * .20, y + fy * .20, z], .095, .17, fishBack, 'solid');
  sphere(x + fx * .23, y + fy * .23, z, .15, underwater ? FISH_BACK : FISH_BELLY, 'solid');
  for (const side of [-1, 1]) {
    capsule([x - fx * .31, y - fy * .31, z], [x - fx * .58 + sideX * (side * .20 + tail), y - fy * .58 + sideY * (side * .20 + tail), z + side * .035], .05, .025, fishFin, 'solid');
  }
  capsule([x, y, z + .12], [x - fx * .13, y - fy * .13, z + .24], .06, .025, fishFin, 'solid');
}

export function drawFish(time) {
  const reacted = animalReaction.fishUntil > game.time;
  const cycle = (time + .2) % 8;
  const jumping = reacted || cycle < 1.1;
  const progress = reacted ? (animalReaction.fishUntil - game.time) / 1.1 : cycle / 1.1;
  const x = 8.9 + Math.sin(time * .4) * 1.2;
  const y = 4.8 + Math.sin(time * .6) * .6;
  const z = jumping ? .15 + Math.max(0, Math.sin(progress * Math.PI)) * 1.1 : .06;
  const yaw = Math.cos(time * .4) < 0 ? Math.PI : 0;
  fishModel(x, y, z, yaw, time, !jumping);
  if (jumping) castShadow(x, y, z, .16);
  animalBounds.fish = boundsAt(x, y, z, 17, 8);
  fishModel(9 + Math.sin(time * .35 + 2) * 1.8, -3.8, .06, Math.PI, time + 2, true);
}

export function drawLandAnimals(time) {
  drawCat(time);
  drawGull(time);
}

export function interactWithAnimal(point) {
  for (const name of ['cat', 'gull', 'fish']) {
    const bounds = animalBounds[name];
    if (!bounds) continue;
    if (point.x < bounds.x - 2 || point.x > bounds.x + bounds.width + 2 || point.y < bounds.y - 2 || point.y > bounds.y + bounds.height + 2) continue;
    animalReaction[name + 'Until'] = game.time + (name === 'fish' ? 1.1 : 2.5);
    game.revision++;
    return name;
  }
  return null;
}
