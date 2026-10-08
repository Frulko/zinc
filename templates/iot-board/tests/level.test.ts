// The level's maths (src/level.ts).
import * as assert from 'zinc:assert';
import { Level } from '../src/level';

const l = new Level();
assert.ok(Math.abs(l.angleX(0.5) - 30) < 1e-9);          // sin 30 deg = 0.5
assert.ok(l.isLevel(l.angleX(0), l.angleY(0)));
l.calibrate(0.1, -0.2);                                  // the board rests a little tilted: that is level now
assert.ok(l.isLevel(l.angleX(0.1), l.angleY(-0.2)));
assert.ok(!l.isLevel(l.angleX(0.3), l.angleY(-0.2)));
assert.equal(l.bubble(0, 18), 0);
assert.equal(l.bubble(90, 18), -18);                      // kept inside the ring
assert.equal(l.bubble(-15, 18), 9);                       // the bubble goes to the high side
console.log('level: ok');
