import { ok, equal } from 'zinc:assert';
import { rocket, startCount, pressFire, advanceRocket, COUNT_FROM, ZONE, MISSES, WINDOW } from '../../../examples/pixel-plays/src/native/rocket/state';

const dt = 1 / 60;
function run(seconds: number): void { for (let i = 0; i < seconds * 60; i++) advanceRocket(dt); }

// 1. The window opens at zero, never before: Space during the countdown does nothing.
startCount();
run(2);
equal(rocket.phase, 'count', 'still counting');
ok(!pressFire(), 'Space does nothing during the countdown');
run(COUNT_FROM - 2 + .1);
equal(rocket.phase, 'window', 'the window opens at zero');

// 2. A press with the needle outside the green zone misses; the third miss scrubs the launch.
let guard = 0;
while (Math.abs(rocket.needle - rocket.centre) <= ZONE * 1.5 && guard++ < 600) advanceRocket(dt);
ok(!pressFire(), 'outside the zone: no ignition');
equal(rocket.misses, 1, 'one miss');
for (let k = 1; k < MISSES; k++) {
  guard = 0;
  while (Math.abs(rocket.needle - rocket.centre) <= ZONE * 1.5 && guard++ < 600) advanceRocket(dt);
  pressFire();
}
equal(rocket.phase, 'over', 'three misses scrub the launch');
ok(!rocket.launched, 'nothing took off');

// 3. A window nobody uses closes by itself.
startCount();
run(COUNT_FROM + WINDOW + .5);
equal(rocket.phase, 'over', 'the window timed out');
ok(!rocket.launched && rocket.z === 0, 'the rocket stays on the pad');

// 4. Pressing inside the green zone lights the engines; the rocket then leaves the picture.
startCount();
run(COUNT_FROM + .05);
guard = 0;
while (Math.abs(rocket.needle - rocket.centre) > ZONE * .4 && guard++ < 600) advanceRocket(dt);
ok(pressFire(), 'inside the zone: ignition');
equal(rocket.phase, 'ignition', 'engines building up');
ok(rocket.sync >= 80 && rocket.sync <= 100, 'a centred press scores high: ' + rocket.sync);
ok(rocket.z === 0, 'the foot stays on the pad during the build-up');
run(2.5);
equal(rocket.phase, 'flight', 'lift-off');
ok(rocket.z > 0, 'the rocket climbs');
run(12);
ok(rocket.phase === 'gone' || rocket.phase === 'over', 'the rocket left the picture: ' + rocket.phase);
run(2);
equal(rocket.phase, 'over', 'the smoke settles');
ok(rocket.launched && rocket.best === rocket.sync && rocket.newBest, 'the first launch is the record');

// 5. The edge of the zone still counts, but scores less than the centre.
const centred = rocket.sync;
startCount();
run(COUNT_FROM + .05);
guard = 0;
while (Math.abs(rocket.needle - rocket.centre) > ZONE * .95 && guard++ < 1200) advanceRocket(dt);
if (Math.abs(rocket.needle - rocket.centre) <= ZONE) { pressFire(); ok(rocket.sync < centred, 'an edge press scores less: ' + rocket.sync + ' < ' + centred); }
console.log('rocket-rules: PASS');
