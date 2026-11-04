import {
  game, startRound, setAim, throwParcel, advanceGame, boatPosition,
  flightTo, togglePause, ROUND_SECONDS, PARCELS,
} from '../../../examples/pixel-plays/src/harbor/state.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function freshRound() {
  game.time = 0;
  startRound();
}
function until(condition, message, step = 1 / 60) {
  for (let i = 0; i < 6000 && !condition(); i++) advanceGame(step);
  assert(condition(), message);
}
function leadTarget() {
  let duration = 1;
  let target;
  for (let i = 0; i < 12; i++) {
    target = boatPosition(game.elapsed + duration, game.time + duration);
    target.x += 1.1;
    duration = flightTo(target.x, target.y).duration;
  }
  return target;
}

assert(!throwParcel(), 'intro consumed a parcel');
freshRound();
const current = boatPosition(game.elapsed, game.time);
setAim(current.x + 1.1, current.y);
assert(throwParcel(), 'first throw rejected');
assert(!throwParcel() && game.remaining === 4, 'double throw consumed inventory');
until(() => game.phase === 'aim', 'unled throw never resolved');
assert(game.delivered === 0 && game.outcome.kind === 'splash', 'aiming at the current boat should miss its moving deck');
console.log('last-boat rules: moving target requires anticipation PASS');

for (const step of [1 / 60, .04]) {
  freshRound();
  for (let i = 0; i < PARCELS; i++) {
    const target = leadTarget();
    setAim(target.x, target.y);
    assert(throwParcel(), 'led throw rejected');
    until(() => game.phase === 'aim' || game.phase === 'over', 'led throw never resolved', step);
    assert(game.delivered === i + 1, 'led parcel missed at step ' + step + ', parcel ' + i);
  }
  assert(game.phase === 'over' && game.remaining === 0 && game.cargo.length === 5, 'perfect round did not finish');
}
console.log('last-boat rules: five physical catches and finished round at two step sizes PASS');

freshRound();
setAim(11.5, 7.5);
throwParcel();
until(() => game.projectile === null, 'water miss never resolved');
assert(game.outcome.kind === 'splash' && game.delivered === 0, 'water miss counted as delivery');
console.log('last-boat rules: water misses and inventory PASS');

freshRound();
// A descending parcel over the cabin must bounce instead of passing through its roof.
let boat = boatPosition(0, 0);
game.projectile = { origin: { x: boat.x - 1.1, y: boat.y, z: 2.3 }, vx: 0, vy: 0, vz: -2, age: 0 };
game.phase = 'flight';
until(() => game.projectile && game.projectile.bounced, 'cabin roof did not bounce parcel');
assert(game.outcome.kind === 'bump' && game.delivered === 0, 'cabin counted as cargo');
until(() => game.projectile === null, 'bounced parcel never landed');
assert(game.outcome.kind === 'splash', 'roof rebound did not end in water');
console.log('last-boat rules: cabin collision and rebound PASS');

freshRound();
setAim(6, 0);
throwParcel();
advanceGame(.04);
const paused = { time: game.time, elapsed: game.elapsed, age: game.projectile.age, remaining: game.remaining };
togglePause();
for (let i = 0; i < 300; i++) advanceGame(1 / 60);
assert(game.time === paused.time && game.elapsed === paused.elapsed && game.projectile.age === paused.age, 'pause moved the simulation');
assert(!throwParcel() && game.remaining === paused.remaining, 'paused input consumed inventory');
togglePause();
advanceGame(.04);
assert(game.projectile.age > paused.age, 'resume did not continue flight');
console.log('last-boat rules: pause freezes flight and clock PASS');

freshRound();
until(() => game.phase === 'over', 'idle clock never ended the round');
assert(game.elapsed >= ROUND_SECONDS && game.remaining === PARCELS && game.delivered === 0, 'timeout lost unthrown inventory state');
freshRound();
game.elapsed = ROUND_SECONDS - .01;
setAim(11, 7);
throwParcel();
advanceGame(.04);
assert(game.phase === 'flight' && game.elapsed > ROUND_SECONDS, 'deadline deleted the in-flight parcel');
until(() => game.phase === 'over', 'last-chance parcel did not resolve');
assert(game.outcome.kind === 'splash', 'last-chance miss was not resolved');
startRound();
assert(game.remaining === PARCELS && game.delivered === 0 && game.cargo.length === 0 && game.elapsed === 0 && !game.paused, 'restart retained a previous round');
const beforeX = game.aim.x;
setAim(NaN, Infinity);
assert(game.aim.x === beforeX, 'nonfinite aim entered physics');
console.log('last-boat rules: timeout, final flight, restart and aim validation PASS');
