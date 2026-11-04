import { Position } from './state';
import { rgbColor } from '../renderer';
import { plot, box, project, rgb, hash, pix, W, H, castShadow } from '../renderer';
import { ROPE, CREAM } from './palette';
import { game, DECK_HEIGHT, CARGO, flightTo, parcelPosition } from './state';
import { waterRing } from './water';

const PARCEL = [190, 144, 89];
const GOLD = rgb(242, 196, 83);
const WHITE = rgb(255, 246, 209);

export function drawParcel(x: number, y: number, z: number) {
  box(x - .23, y - .23, z, x + .23, y + .23, z + .43, PARCEL);
  box(x - .04, y - .24, z, x + .04, y + .24, z + .44, ROPE);
}

export function drawCargo(boat: Position) {
  for (let i = 0; i < game.remaining; i++) {
    drawParcel(-3.8 + i % 2 * .64, 2.7 + Math.floor(i / 2) * .61, .9);
  }
  for (let i = 0; i < game.cargo.length; i++) {
    const parcel = game.cargo[i];
    drawParcel(boat.x + parcel.x, boat.y + parcel.y, boat.z + DECK_HEIGHT + Math.floor(i / 2) * .18);
  }
}

export function drawCargoTarget(boat: Position) {
  if (game.phase === 'over') return;
  for (let x = CARGO.left; x <= CARGO.right; x += .08) {
    plot(boat.x + x, boat.y - CARGO.halfWidth, boat.z + .61, GOLD);
    plot(boat.x + x, boat.y + CARGO.halfWidth, boat.z + .61, GOLD);
  }
  for (let y = -CARGO.halfWidth; y <= CARGO.halfWidth; y += .08) {
    plot(boat.x + CARGO.left, boat.y + y, boat.z + .61, GOLD);
    plot(boat.x + CARGO.right, boat.y + y, boat.z + .61, GOLD);
  }
}

export function drawFlight() {
  if (!game.projectile) return;
  const parcel = parcelPosition(game.projectile!, game.projectile!.age);
  drawParcel(parcel.x, parcel.y, parcel.z);
  castShadow(parcel.x, parcel.y, parcel.z, .3);
}

export function drawAim() {
  if (game.phase !== 'aim') return;
  const flight = flightTo(game.aim.x, game.aim.y);
  for (let k = 1; k < 17; k++) {
    const position = parcelPosition(flight, flight.duration * k / 17);
    plot(position.x, position.y, position.z, k % 2 ? WHITE : GOLD);
  }
  const target = project(game.aim.x, game.aim.y, DECK_HEIGHT);
  // The cursor stays readable even when the aim overlaps the hull's rail.
  const radius = 5 + Math.floor(game.time * 4) % 2;
  for (let k = 0; k < 32; k++) {
    const angle = k * Math.PI / 16;
    const x = Math.round(target.sx + Math.cos(angle) * radius);
    const y = Math.round(target.sy + Math.sin(angle) * radius * .5);
    if (x >= 0 && x < W && y >= 0 && y < H) pix[y * W + x] = GOLD;
  }
  for (let k = -2; k <= 2; k++) {
    const x = Math.round(target.sx) + k, y = Math.round(target.sy);
    if (x >= 0 && x < W && y >= 0 && y < H) pix[y * W + x] = WHITE;
  }
}

export function drawSplash() {
  const outcome = game.outcome;
  if (!outcome || outcome.kind !== 'splash') return;
  const age = game.time - outcome.at;
  if (age > 2) return;
  for (let k = 0; k < 3; k++) waterRing(outcome.x, outcome.y, .15 + age * (1.1 + k * .35), age > .6);
  for (let k = 0; k < 16; k++) {
    const angle = k * Math.PI / 8;
    const speed = .5 + hash(k, 7) * 1.5;
    const z = age * (2 + hash(k, 8) * 2) - 3.5 * age * age;
    if (z < 0) continue;
    plot(outcome.x + Math.cos(angle) * age * speed, outcome.y + Math.sin(angle) * age * speed, z, rgbColor(CREAM));
  }
}
