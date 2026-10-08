// The rolling window (src/series.ts).
import * as assert from 'zinc:assert';
import { Series } from '../src/series';

const s = new Series(3);
assert.equal(s.last(), 0);
for (const v of [10, 20, 30, 40]) s.push(v);
assert.equal(s.values.join(','), '20,30,40');
assert.equal(s.min(), 20);
assert.equal(s.max(), 40);
assert.equal(s.mean(), 30);
assert.equal(s.trend(), 100);
console.log('series: ok');
