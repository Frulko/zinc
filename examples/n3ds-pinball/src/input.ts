// The controls of one frame on a 3DS, into the desktop table's Controls (examples/pinball/src/input.ts):
//   L or the d-pad's left: left flipper; R or A: right flipper; B or the d-pad's down: the plunger (hold, release); X or the d-pad's up:
//   bump the table; START: start a game, add a player before the first launch, else pause; SELECT: pause.
//   The stylus on the bottom screen: the left half holds the left flipper, the right half the right one, the strip right of the table the
//   plunger (the bottom screen's window reads it into `Touch`).
// On a keyboard (the desktop HAL's buttons): Q (L), E (R), Space / Z (A), X (B), C (X), arrows, Enter (START), Tab (SELECT).
import { isDown, wasPressed, Btn } from 'zinc:gfx';
import { Controls } from '../../pinball/src/input';

/** The stylus on the bottom screen this frame. */
export class Touch {
  left = false;
  right = false;
  plunger = false;
  tap = false;
}

let prevLeft = false, prevRight = false;

/** Reads the buttons on every frame (a stereo pair calls it twice): the held ones are this frame's, the presses stay set until the
 *  frame that uses them clears them (clearPresses), so a press seen on a right eye's frame is not lost. */
export function readControls(c: Controls, t: Touch): void {
  c.left = isDown(Btn.L) || isDown(Btn.Left) || t.left;
  c.right = isDown(Btn.R) || isDown(Btn.A) || t.right;
  c.plunger = isDown(Btn.B) || isDown(Btn.Down) || t.plunger;
  c.leftPressed = c.leftPressed || (c.left && !prevLeft);
  c.rightPressed = c.rightPressed || (c.right && !prevRight);
  prevLeft = c.left; prevRight = c.right;
  c.nudgeUp = c.nudgeUp || wasPressed(Btn.X) || wasPressed(Btn.Up);
  c.up = c.up || wasPressed(Btn.Up);
  c.down = c.down || wasPressed(Btn.Down);
  c.start = c.start || wasPressed(Btn.Start);
  c.pause = c.pause || wasPressed(Btn.Select);
  c.tap = c.tap || t.tap;
  t.tap = false;
}

export function clearPresses(c: Controls): void {
  c.leftPressed = false; c.rightPressed = false; c.nudgeUp = false; c.nudgeLeft = false; c.nudgeRight = false;
  c.up = false; c.down = false; c.start = false; c.pause = false; c.tap = false; c.confirm = false;
}
