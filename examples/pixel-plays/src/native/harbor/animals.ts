import { cat, gull, fish as fishModel } from '../models/animals';
import { Point } from './state';
interface Bounds {x:number;y:number;width:number;height:number;}
import { sphere, capsule, plot, project, rgb, castShadow } from '../renderer';
import { game } from './state';

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

export const animalBounds = new Map<string, Bounds>();
export const animalReaction = { catUntil: 0, gullUntil: 0, fishUntil: 0 };

function boundsAt(x: number, y: number, z: number, width: number, height: number): Bounds {
  const point = project(x, y, z);
  return { x: point.sx - width / 2, y: point.sy - height, width, height: height + 4 };
}







export function drawFish(time: number) {
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
  animalBounds.set('fish',boundsAt(x,y,z,17,8));
  fishModel(9 + Math.sin(time * .35 + 2) * 1.8, -3.8, .06, Math.PI, time + 2, true);
}

export function drawLandAnimals(time: number) {
  cat(-3.9,.5,.91,time,animalReaction.catUntil>game.time);
  animalBounds.set('cat',boundsAt(-3.9,.5,.91,22,14));
  const flying=animalReaction.gullUntil>game.time||time%18>12;
  const x=flying?1.3+Math.sin(time*.75)*2.5:-1.7;
  const y=flying?-3+Math.cos(time*.75)*1.5:-3;
  const z=flying?4.2+Math.sin(time*2)*.25:1.28;
  gull(x,y,z,time,flying);
  animalBounds.set('gull',boundsAt(x,y,z,flying?25:17,10));
}

export function interactWithAnimal(point: Point) {
  for (const name of ['cat', 'gull', 'fish']) {
    const found = animalBounds.get(name);
    if (found === undefined) continue;
    const bounds = found as Bounds;
    if (point.x < bounds.x - 2 || point.x > bounds.x + bounds.width + 2 || point.y < bounds.y - 2 || point.y > bounds.y + bounds.height + 2) continue;
    if(name==='cat')animalReaction.catUntil=game.time+2.5;
    else if(name==='gull')animalReaction.gullUntil=game.time+2.5;
    else animalReaction.fishUntil=game.time+1.1;
    game.revision++;
    return name;
  }
  return null;
}
