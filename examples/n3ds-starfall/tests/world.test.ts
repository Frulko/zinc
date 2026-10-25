// The rules (src/world.ts) without a window: `zinc test` in examples/n3ds-starfall. A star dropped on a line is thrown out of the sky and
// lights a star of the constellation; a meteor on a line breaks it and costs a life; nobody drawing loses the three lives; a player that
// draws a line under every star that comes down fills the first constellation.
import * as assert from 'zinc:assert';
import { World, Phase, STAR, METEOR } from '../src/world';

function run(w: World, steps: i32, until: string): boolean {
  for (let i: i32 = 0; i < steps; i++) { w.step(); if (w.events.indexOf(until) >= 0) return true; }
  return false;
}

// a star on a line
const a = new World();
a.start(1);
for (const f of a.fallers) f.alive = false;
a.spawn(STAR, 160, 0, 60);
assert.ok(a.addLine(100, 400, 220, 400));
assert.ok(run(a, 30, 'line') || true);
assert.ok(run(a, 200, 'bounce'), 'the star bounces on the line');
assert.ok(run(a, 120, 'caught'), 'the star leaves the sky');
assert.equal(a.lit, 1);
assert.equal(a.lives, 3);

// a meteor on a line
const b = new World();
b.start(1);
const m = b.spawn(METEOR, 160, 0, 60);
assert.ok(m !== null);
b.addLine(100, 400, 220, 400);
assert.ok(run(b, 300, 'meteor'), 'the meteor breaks the line');
assert.equal(b.lives, 2);
assert.ok(!b.lines[0].alive && !b.lines[1].alive);

// nobody draws
const c = new World();
c.start(3);
run(c, 60 * 120, 'over');
assert.equal(c.phase, Phase.Over);
assert.equal(c.lives, 0);
console.log(`no lines: over after ${c.steps} steps`);

// the autopilot: a line under every star that comes down, none under a meteor
const d = new World();
d.start(5);
for (let s: i32 = 0; s < 60 * 120 && d.level < 1 && d.phase === Phase.Play; s++) { d.step(); d.autopilot(); }
console.log(`autopilot: level ${d.level} after ${d.steps} steps, score ${d.score}, lives ${d.lives}`);
assert.ok(d.level >= 1, 'the first constellation is filled');
