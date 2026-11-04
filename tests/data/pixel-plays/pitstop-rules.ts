import { ok, equal } from 'zinc:assert';
import { pit, startRun, setBrake, pressGo, advancePit, stageOf, STAGE_TIME, JACK_UP } from '../../../examples/pixel-plays/src/native/pitstop/state';

const dt = 1 / 60;
function run(seconds: number): void { for (let i = 0; i < seconds * 60; i++) advancePit(dt); }

// 1. A driver who never brakes is stopped by instinct before the front jack and pays for it.
startRun();
run(8);
ok(pit.phase === 'service' || pit.phase === 'release', 'the car stops on its own past the jack: ' + pit.phase);
ok(pit.offset > 3 && pit.penalty > .5, 'overshooting costs time: offset ' + pit.offset + ' penalty ' + pit.penalty);

// 2. A clean stop: brake at the right place and land on the mark.
startRun();
let guard = 0;
while (pit.phase === 'approach' && guard++ < 2000) {
  const stopsAt = pit.x + pit.speed * pit.speed / (2 * 8.35);
  setBrake(stopsAt >= -.7);
  advancePit(dt);
}
ok(pit.phase === 'service', 'the car stopped');
ok(Math.abs(pit.offset) < 1.8, 'a careful driver lands near the mark: ' + pit.offset);

// 3. The four wheel changes finish in order, then the light turns green after the hands are up.
let seen = 0;
for (let i = 0; i < 600 && pit.phase === 'service'; i++) {
  advancePit(dt);
  for (let c = 0; c < 4; c++) seen = Math.max(seen, stageOf(c, pit.service).stage);
}
equal(pit.phase, 'release', 'the light is green');
equal(seen, 5, 'every wheel was changed');
ok(pit.service >= pit.greenAt - .02 && pit.greenAt >= JACK_UP + STAGE_TIME[0] + STAGE_TIME[1] + STAGE_TIME[2] + STAGE_TIME[3], 'the green comes after the work');

// 4. Going on the green: the reaction counts, the car leaves, the result is recorded.
run(.3);
ok(pressGo(), 'the driver goes on green');
equal(pit.phase, 'launch', 'launching');
run(6);
equal(pit.phase, 'over', 'the car left the lane');
ok(pit.result > 2 && pit.result < 8, 'a plausible stop time: ' + pit.result);
ok(pit.best === pit.result && pit.newBest, 'the first result is the record');

// 5. Leaving before the green costs a second and does not move the car.
startRun();
guard = 0;
while (pit.phase === 'approach' && guard++ < 2000) { setBrake(pit.x + pit.speed * pit.speed / (2 * 8.35) >= -.7); advancePit(dt); }
const before = pit.penalty;
run(.8);
ok(!pressGo(), 'too early: the car stays');
equal(pit.falseStarts, 1, 'a false start is counted');
ok(Math.abs(pit.penalty - before - 1) < 1e-9, 'one second of penalty');
console.log('pitstop-rules: PASS');
