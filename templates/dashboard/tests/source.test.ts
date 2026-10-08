// The mock source (src/source.ts): four samples a second, the same ones for the same seed, values in range.
import * as assert from 'zinc:assert';
import { MockSource, RATE } from '../src/source';

const a = new MockSource(7), b = new MockSource(7);
const sa = a.poll(2.0), sb = b.poll(2.0);
assert.equal(sa.length, 2 * RATE);
assert.equal(sa[3].cpu, sb[3].cpu);
assert.equal(a.poll(0.1).length, 0);
for (const s of sa) { assert.ok(s.cpu >= 2 && s.cpu <= 99); assert.ok(s.memory >= 20 && s.memory <= 95); assert.ok(s.requests >= 0 && s.requests <= 400); }
console.log('source: ok');
