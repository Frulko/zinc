// The controls, read once per frame: the d-pad or the left stick moves, Cross jumps, Square runs, Start starts and pauses.
// On a keyboard (the desktop HAL's mapping): arrows or A / D, Space or Z jump, C runs, Enter is Start.
import { isDown, wasPressed, gamepadAxis, GamepadAxis, Btn } from 'zinc:gfx';

export class Controls {
  left = false;
  right = false;
  jump = false;          // held: a longer jump
  jumpPressed = false;   // this frame
  run = false;
  start = false;
}

const STICK = 0.35;   // the stick's dead zone

export function readControls(c: Controls): Controls {
  const x = gamepadAxis(0, GamepadAxis.LeftX);
  c.left = isDown(Btn.Left) || x < -STICK;
  c.right = isDown(Btn.Right) || x > STICK;
  c.jump = isDown(Btn.A);
  c.jumpPressed = wasPressed(Btn.A);
  c.run = isDown(Btn.X);
  c.start = wasPressed(Btn.Start);
  return c;
}
