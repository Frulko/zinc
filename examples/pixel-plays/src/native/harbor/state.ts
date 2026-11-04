export interface Point {x:number;y:number;}
export interface Position {x:number;y:number;z:number;}
export interface Flight {duration:number;origin:Position;vx:number;vy:number;vz:number;age:number;bounced:boolean;}
interface Outcome {kind:string;x:number;y:number;at:number;}
interface Discovery {name:string;until:number;}
export const ROUND_SECONDS = 45;
export const PARCELS = 5;
export const GRAVITY = 8.5;
export const LAUNCH = { x: .3, y: .1, z: 2.25 };
export const DECK_HEIGHT = .55;
export const HULL = { halfLength: 3.2, halfWidth: 1.03 };
export const CARGO = { left: .15, right: 2.05, halfWidth: .82 };

export const game = {
  time: 0,
  elapsed: 0,
  phase: 'ready',
  paused: false,
  muted: false,
  remaining: PARCELS,
  delivered: 0,
  aim: { x: 6, y: 0 },
  aiming: false,
  projectile: null as Flight | null,
  cargo: [] as Point[],
  outcome: null as Outcome | null,
  discovery: null as Discovery | null,
  lastThrowAt: -100,
  feedbackUntil: 0,
  endedAt: 0,
  revision: 0,
};

// The route is predictable: the player learns to lead the moving cargo deck.
export function boatPosition(elapsed: number, ambientTime: number = elapsed): Position {
  return {
    x: 4.8 + Math.sin(elapsed * .2) * .35,
    y: Math.sin(elapsed * .37 - .8) * 4.4,
    z: Math.round(Math.sin(ambientTime * 1.7)) / 10,
  };
}

export function startRound() {
  game.elapsed = 0;
  game.phase = 'aim';
  game.paused = false;
  game.remaining = PARCELS;
  game.delivered = 0;
  game.aim.x = 6;
  game.aim.y = 0;
  game.aiming = false;
  game.projectile = null;
  game.cargo.length = 0;
  game.outcome = null;
  game.discovery = null;
  game.lastThrowAt = -100;
  game.revision++;
}

export function setAim(x: number, y: number) {
  if (game.paused || game.phase !== 'aim' || !Number.isFinite(x) || !Number.isFinite(y)) return;
  game.aim.x = Math.max(1.5, Math.min(11.5, x));
  game.aim.y = Math.max(-7.5, Math.min(7.5, y));
  game.revision++;
}

export function flightTo(x: number, y: number): Flight {
  const distance = Math.hypot(x - LAUNCH.x, y - LAUNCH.y);
  const duration = Math.min(1.65, .65 + distance * .09);
  return {
    duration, age: 0, bounced: false,
    origin: LAUNCH,
    vx: (x - LAUNCH.x) / duration,
    vy: (y - LAUNCH.y) / duration,
    vz: (DECK_HEIGHT - LAUNCH.z + .5 * GRAVITY * duration * duration) / duration,
  };
}

export function parcelPosition(flight: Flight, seconds: number): Position {
  const origin = flight.origin;
  return {
    x: origin.x + flight.vx * seconds,
    y: origin.y + flight.vy * seconds,
    z: origin.z + flight.vz * seconds - .5 * GRAVITY * seconds * seconds,
  };
}

export function throwParcel() {
  if (game.paused || game.phase !== 'aim' || game.remaining === 0) return false;
  game.projectile = { ...flightTo(game.aim.x, game.aim.y), age: 0 };
  game.remaining--;
  game.phase = 'flight';
  game.aiming = false;
  game.lastThrowAt = game.time;
  game.revision++;
  return true;
}

function finishRound() {
  game.phase = 'over';
  game.aiming = false;
  game.endedAt = game.time;
  game.revision++;
}

function resolveParcel(kind: string, position: Point, boat: Point) {
  game.outcome = { kind, x: position.x, y: position.y, at: game.time };
  if (kind === 'delivered') {
    game.delivered++;
    game.cargo.push({ x: position.x - boat.x, y: position.y - boat.y });
  }
  game.projectile = null;
  game.phase = 'feedback';
  game.feedbackUntil = game.time + 1;
  game.revision++;
}

function bounceParcel(flight: Flight, position: Position, boat: Point) {
  const side = position.y >= boat.y ? 1 : -1;
  flight.origin = position;
  flight.age = 0;
  flight.vx *= .25;
  flight.vy = side * 2.7;
  flight.vz = 1.2;
  flight.bounced = true;
  game.outcome = { kind: 'bump', x: position.x, y: position.y, at: game.time };
  game.revision++;
}

function advanceParcel(seconds: number, previousElapsed: number) {
  const flight = game.projectile!;
  const before = parcelPosition(flight, flight.age);
  flight.age += seconds;
  const after = parcelPosition(flight, flight.age);
  const boat = boatPosition(game.elapsed, game.time);
  const previousBoat = boatPosition(previousElapsed, game.time - seconds);
  // Sweep the descending parcel through the cabin roof before testing the open deck.
  const beforeRoof = before.z - previousBoat.z - 2.04;
  const afterRoof = after.z - boat.z - 2.04;
  if (!flight.bounced && beforeRoof >= 0 && afterRoof <= 0) {
    const fraction = beforeRoof / (beforeRoof - afterRoof);
    const x = before.x + (after.x - before.x) * fraction;
    const y = before.y + (after.y - before.y) * fraction;
    if (x >= boat.x - 2 && x <= boat.x - .4 && Math.abs(y - boat.y) <= .82) {
      bounceParcel(flight, { x, y, z: boat.z + 2.08 }, boat);
      return;
    }
  }
  const beforeDeck = before.z - previousBoat.z - DECK_HEIGHT;
  const afterDeck = after.z - boat.z - DECK_HEIGHT;
  if (!flight.bounced && beforeDeck >= 0 && afterDeck <= 0) {
    const fraction = beforeDeck / (beforeDeck - afterDeck);
    const x = before.x + (after.x - before.x) * fraction;
    const y = before.y + (after.y - before.y) * fraction;
    const boatX = previousBoat.x + (boat.x - previousBoat.x) * fraction;
    const boatY = previousBoat.y + (boat.y - previousBoat.y) * fraction;
    if (x >= boatX + CARGO.left && x <= boatX + CARGO.right && Math.abs(y - boatY) <= CARGO.halfWidth) {
      resolveParcel('delivered', { x, y }, { x: boatX, y: boatY });
      return;
    }
    const localX = x - boatX;
    const hullWidth = HULL.halfWidth * (1 - Math.pow(Math.abs(localX) / HULL.halfLength, 4));
    if (Math.abs(localX) <= HULL.halfLength && Math.abs(y - boatY) <= hullWidth) {
      bounceParcel(flight, { x, y, z: boat.z + .6 }, boat);
      return;
    }
  }
  if (after.z <= 0) resolveParcel('splash', after, boat);
}

export function advanceGame(seconds: number) {
  if (game.paused) return;
  const dt = Math.max(0, Math.min(.04, seconds));
  game.time += dt;
  const active = game.phase !== 'ready' && game.phase !== 'over';
  const previousElapsed = game.elapsed;
  if (active) game.elapsed += dt;
  if (game.projectile) advanceParcel(dt, previousElapsed);
  if (game.phase === 'feedback' && game.time >= game.feedbackUntil) {
    if (game.remaining === 0 || game.elapsed >= ROUND_SECONDS) finishRound();
    else game.phase = 'aim';
  }
  if (game.phase === 'aim' && game.elapsed >= ROUND_SECONDS) finishRound();
}

export function togglePause() {
  game.paused = !game.paused;
  game.aiming = false;
  game.revision++;
}
