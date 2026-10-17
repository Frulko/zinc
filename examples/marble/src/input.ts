// The controls: the left stick (or the d-pad, or the arrow keys) tilts the board up to 12 degrees; Start (Enter) or Cross
// (Space) starts. The tilt eases towards what is held, so the d-pad and the keys tilt as smoothly as a stick.
import { isDown, wasPressed, gamepadAxis, GamepadAxis, Btn } from 'zinc:gfx';
import { MAX_TILT } from './course';
import { Autopilot } from './autopilot';

export class Controls {
  tiltX = 0;   // radians: + rolls the ball towards +x (right)
  tiltZ = 0;   // + rolls it towards +z (towards the camera)
  start = false;
}

const DEAD = 0.15;

/** `pilot`: the demo player's buttons instead of the pad's. */
export function readControls(c: Controls, dt: number, pilot: Autopilot | null): Controls {
  let x = pilot === null ? gamepadAxis(0, GamepadAxis.LeftX) : 0, y = pilot === null ? gamepadAxis(0, GamepadAxis.LeftY) : 0;
  if (Math.abs(x) < DEAD) x = 0;
  if (Math.abs(y) < DEAD) y = 0;
  const up = pilot === null ? isDown(Btn.Up) : pilot.held[0], down = pilot === null ? isDown(Btn.Down) : pilot.held[1];
  const left = pilot === null ? isDown(Btn.Left) : pilot.held[2], right = pilot === null ? isDown(Btn.Right) : pilot.held[3];
  x += (right ? 1 : 0) - (left ? 1 : 0);
  y += (down ? 1 : 0) - (up ? 1 : 0);
  const len = Math.sqrt(x * x + y * y);
  if (len > 1) { x /= len; y /= len; }
  const k = Math.min(1, dt * 8);
  c.tiltX += (x * MAX_TILT - c.tiltX) * k;
  c.tiltZ += (y * MAX_TILT - c.tiltZ) * k;
  c.start = pilot === null ? wasPressed(Btn.Start) || wasPressed(Btn.A) : pilot.start;
  return c;
}
