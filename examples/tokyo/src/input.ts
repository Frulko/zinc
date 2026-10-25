// The pad as the flight reads it: gamepad 0 (a console's own pad) and zinc:gfx's buttons (a console's pad, or the keyboard on a desktop).
// Stick or d-pad: ahead and turn. Right stick (Vita): look and step aside. Triangle / Cross: look up / down. R / L: climb / descend.
// Square: faster. Circle: turn the clock. Start: the tour on or off. Select: the readout.
import { isDown, Btn, gamepadConnected, gamepadButton, gamepadAxis, GamepadButton, GamepadAxis } from 'zinc:gfx';

function dead(v: number): number { return Math.abs(v) < 0.2 ? 0 : v; }
function held(b: GamepadButton, k: Btn): boolean { return (gamepadConnected(0) && gamepadButton(0, b)) || isDown(k); }
function axis(a: GamepadAxis): number { return gamepadConnected(0) ? dead(gamepadAxis(0, a)) : 0; }
function one(v: number): number { return v > 1 ? 1 : v < -1 ? -1 : v; }

export class Pad {
  /** -1..1: forward, to the right, turn right, look up, climb. */
  ahead = 0;
  side = 0;
  turn = 0;
  tilt = 0;
  climb = 0;
  fast = false;
  /** 1 while the clock is turned forward. */
  clock = 0;
  toggleTour = false;
  toggleHud = false;
  private startWas = false;
  private selectWas = false;

  read(): void {
    this.ahead = one(-axis(GamepadAxis.LeftY) + (held(GamepadButton.Up, Btn.Up) ? 1 : 0) - (held(GamepadButton.Down, Btn.Down) ? 1 : 0));
    this.turn = one(axis(GamepadAxis.LeftX) + axis(GamepadAxis.RightX) + (held(GamepadButton.Right, Btn.Right) ? 1 : 0) - (held(GamepadButton.Left, Btn.Left) ? 1 : 0));
    this.tilt = one(-axis(GamepadAxis.RightY) + (held(GamepadButton.North, Btn.Y) ? 1 : 0) - (held(GamepadButton.South, Btn.A) ? 1 : 0));
    this.side = 0;
    this.climb = (held(GamepadButton.RightShoulder, Btn.R) ? 1 : 0) - (held(GamepadButton.LeftShoulder, Btn.L) ? 1 : 0);
    this.fast = held(GamepadButton.West, Btn.X);
    this.clock = held(GamepadButton.East, Btn.B) ? 1 : 0;
    const start = held(GamepadButton.Start, Btn.Start), select = held(GamepadButton.Back, Btn.Select);
    this.toggleTour = start && !this.startWas;
    this.toggleHud = select && !this.selectWas;
    this.startWas = start; this.selectWas = select;
  }

  /** The pad moves the eye: the flight leaves the tour. */
  flying(): boolean { return this.ahead !== 0 || this.turn !== 0 || this.tilt !== 0 || this.climb !== 0; }
}
