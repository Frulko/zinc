// The rules of the game (src/world.ts), checked without a window: `zinc test`.
import * as assert from 'zinc:assert';
import { World, SPEED, PLAYER, ROUND } from '../src/world';

// the same seed gives the same coins
const a = new World(640, 400, 7), b = new World(640, 400, 7);
assert.equal(a.coins.length, 5);
assert.equal(a.coins[0].x, b.coins[0].x);

// moving right for half a second covers SPEED / 2 px, and the player stays inside the screen
const w = new World(640, 400, 7);
const x0 = w.x;
w.coins.length = 0;
w.step(1, 0, 0.5);
assert.equal(w.x, x0 + SPEED / 2);
for (let i = 0; i < 20; i++) w.step(1, 1, 0.5);
assert.equal(w.x, 640 - PLAYER);
assert.equal(w.y, 400 - PLAYER);

// touching a coin scores it and puts a new one elsewhere
const c = new World(640, 400, 7);
c.coins[0].x = c.x; c.coins[0].y = c.y;
c.step(0, 0, 0.016);
assert.equal(c.score, 1);
assert.ok(c.coins[0].x !== c.x || c.coins[0].y !== c.y);

// the round ends after ROUND seconds
const t = new World(640, 400, 7);
assert.ok(t.step(0, 0, ROUND - 1));
assert.ok(!t.step(0, 0, 1));
console.log('world: ok');
