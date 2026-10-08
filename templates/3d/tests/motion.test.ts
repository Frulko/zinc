// The motion (src/motion.ts): orbits keep their radius, bob around their height, and the ring turns once per period.
import * as assert from 'zinc:assert';
import { ORBITS, spin } from '../src/motion';

for (const o of ORBITS) for (const t of [0, 1.3, 7.9]) {
  const r = Math.sqrt(o.x(t) * o.x(t) + o.z(t) * o.z(t));
  assert.ok(Math.abs(r - o.radius) < 1e-9);
  assert.ok(Math.abs(o.y(t) - o.height) <= 0.15 + 1e-9);
}
assert.ok(Math.abs(spin(8, 8) - Math.PI * 2) < 1e-12);
assert.equal(spin(0, 8), 0);
console.log('motion: ok');
