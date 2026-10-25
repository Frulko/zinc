// The controls of one frame on a 3DS: the d-pad or the circle pad moves, A or B jumps, Y or X runs, START pauses; a tap on the bottom
// screen starts a game (the bottom screen's own taps arrive through `tapped`). On a keyboard: arrows, Space / Z (A), X (B), C (X), V (Y), Enter.
import { isDown, wasPressed, gamepadAxis, GamepadAxis, Btn } from 'zinc:gfx';
import { Controls } from '../../platformer/src/input';

const STICK = 0.35;   // the circle pad's dead zone

export function readControls(c: Controls, tapped: boolean): Controls {
  const x = gamepadAxis(0, GamepadAxis.LeftX);
  c.left = isDown(Btn.Left) || x < -STICK;
  c.right = isDown(Btn.Right) || x > STICK;
  c.jump = isDown(Btn.A) || isDown(Btn.B);
  c.jumpPressed = c.jumpPressed || wasPressed(Btn.A) || wasPressed(Btn.B);   // kept until a step uses it (stereo frames step every other call)
  c.run = isDown(Btn.Y) || isDown(Btn.X);
  c.start = c.start || wasPressed(Btn.Start) || tapped;
  return c;
}
