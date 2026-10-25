// The controls, read once a frame. Pad: d-pad up/down or the stick moves, left/right or the stick turns, L/R strafe, Cross (A) shoots.
// Keyboard (the desktop HAL's mapping): W/S or the arrows move, A/D or the arrows turn, Q/E strafe, Space or Z shoots, Enter is Start.
import { isDown, wasPressed, gamepadAxis, GamepadAxis, Btn } from 'zinc:gfx';

export class Controls {
  forward = 0.0;   // -1 back .. 1 forward
  turn = 0.0;      // -1 left .. 1 right
  strafe = 0.0;    // -1 left .. 1 right
  fire = false;    // held: shoots again as soon as the gun is ready
  start = false;   // pressed this frame
  up = false;
  down = false;
  confirm = false; // Cross pressed this frame
  host = false;    // Triangle pressed this frame
}

const DEAD_ZONE = 0.25;
function stick(v: number): number { return Math.abs(v) < DEAD_ZONE ? 0 : v; }

export function readControls(c: Controls): Controls {
  const sx = stick(gamepadAxis(0, GamepadAxis.LeftX)), sy = stick(gamepadAxis(0, GamepadAxis.LeftY));
  c.forward = (isDown(Btn.Up) ? 1 : 0) - (isDown(Btn.Down) ? 1 : 0) - sy;
  c.turn = (isDown(Btn.Right) ? 1 : 0) - (isDown(Btn.Left) ? 1 : 0) + sx;
  c.strafe = (isDown(Btn.R) ? 1 : 0) - (isDown(Btn.L) ? 1 : 0);
  c.forward = Math.max(-1, Math.min(1, c.forward));
  c.turn = Math.max(-1, Math.min(1, c.turn));
  c.fire = isDown(Btn.A);
  c.start = wasPressed(Btn.Start);
  c.up = wasPressed(Btn.Up);
  c.down = wasPressed(Btn.Down);
  c.confirm = wasPressed(Btn.A);
  c.host = wasPressed(Btn.Y);
  return c;
}
