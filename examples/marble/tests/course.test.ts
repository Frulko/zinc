// The rules (src/course.ts) without a window: `zinc test`, and `zinc test --profile ps2` with the f32 numbers of the
// consoles. The demo player rolls to the ring with its three lives; holding up and left from the start falls off three
// times and the game is over.
import * as assert from 'zinc:assert';
import { load } from 'zinc:tilemap';
import { Course, Phase, STEP } from '../src/course';
import { Controls, readControls } from '../src/input';
import { Autopilot } from '../src/autopilot';

const level = load('level.ldtk').level();

/** The frame loop of src/main.ts at 60 fps: the pilot's buttons (or up and left held from frame 30), two steps a frame. */
function play(pilot: Autopilot, upLeft: boolean, frames: i32): Course {
  const course = new Course(level), c = new Controls();
  for (let f = 0; f < frames && course.phase !== Phase.Won && course.phase !== Phase.Over; f++) {
    pilot.drive(course, f);
    if (upLeft && f >= 30) { pilot.held[0] = true; pilot.held[2] = true; }
    readControls(c, 1 / 60, pilot);
    for (let i = 0; i < Math.round(1 / 60 / STEP); i++) { course.step(c.tiltX, c.tiltZ, c.start); c.start = false; }
  }
  return course;
}

const won = play(new Autopilot(false), false, 3000);
assert.equal(won.phase, Phase.Won);
assert.equal(won.lives, 3);
assert.ok(won.taken >= 6);
console.log(`won after ${won.steps} steps with ${won.taken} gems, ${Math.ceil(won.time)} s left`);

const lost = play(new Autopilot(false), true, 3000);
assert.equal(lost.phase, Phase.Over);
assert.equal(lost.lives, 0);
console.log(`lost after ${lost.steps} steps`);
