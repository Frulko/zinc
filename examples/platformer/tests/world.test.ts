// The rules (src/world.ts) without a window: `zinc test`, and `zinc test --profile ps2` with the f32 numbers of the
// consoles. A run that holds right and running and jumps at the steps below reaches the flag with its three lives; one
// that never jumps falls into the first pit three times and the game is over.
import * as assert from 'zinc:assert';
import { load } from 'zinc:tilemap';
import { World, Phase } from '../src/world';
import { Controls } from '../src/input';

const level = load('level.ldtk').level();
// the steps a jump starts on, and how many steps it is held (those of tests/t1/platformer.sh, 20 steps earlier: its title screen)
const JUMPS: i32[] = [94, 131, 217, 270, 401, 437, 479, 526, 606, 643];
const HOLD: i32[] = [14, 14, 14, 14, 14, 14, 14, 20, 20, 20];

function play(jumps: boolean, steps: i32): World {
  const w = new World(level), c = new Controls();
  c.start = true;
  w.step(c);
  c.start = false;
  for (let s = 2; s <= steps && w.phase === Phase.Play; s++) {
    c.right = s >= 11; c.run = s >= 11;
    c.jump = false; c.jumpPressed = false;
    if (jumps) for (let k = 0; k < JUMPS.length; k++) {
      const d = s - JUMPS[k];
      if (d >= 0 && d < HOLD[k]) { c.jump = true; c.jumpPressed = d === 0; }
    }
    w.step(c);
  }
  return w;
}

const won = play(true, 900);
assert.equal(won.phase, Phase.Won);
assert.equal(won.lives, 3);
assert.ok(won.taken >= 10);
console.log(`won after ${won.steps} steps, ${won.taken} coins, score ${won.score}`);

const lost = play(false, 600);
assert.equal(lost.phase, Phase.Over);
assert.equal(lost.lives, 0);
console.log(`lost after ${lost.steps} steps`);
