// The pad: gamepad 0 (a console's own pad) and zinc:gfx's buttons (a console's pad, or the keyboard on a desktop).
import { isDown, Btn, gamepadConnected, gamepadButton, gamepadAxis, GamepadButton, GamepadAxis } from 'zinc:gfx';

function dead(v: number): number { return Math.abs(v) < 0.2 ? 0 : v; }
function pressed(b: GamepadButton, k: Btn): boolean { return (gamepadConnected(0) && gamepadButton(0, b)) || isDown(k); }

export class Pad {
  /** -1..1: orbit left/right, up/down. */
  turnX = 0;
  turnY = 0;
  /** -1 zoom in, 1 zoom out. */
  zoom = 0;
  /** Start was pressed this frame: the next view. */
  nextView = false;
  /** Triangle / Y was pressed this frame: show or hide the readout. */
  toggleHud = false;
  private startWas = false;
  private hudWas = false;

  read(): void {
    const stickX = gamepadConnected(0) ? dead(gamepadAxis(0, GamepadAxis.LeftX)) : 0;
    const stickY = gamepadConnected(0) ? dead(gamepadAxis(0, GamepadAxis.LeftY)) : 0;
    this.turnX = stickX + (pressed(GamepadButton.Right, Btn.Right) ? 1 : 0) - (pressed(GamepadButton.Left, Btn.Left) ? 1 : 0);
    this.turnY = stickY + (pressed(GamepadButton.Down, Btn.Down) ? 1 : 0) - (pressed(GamepadButton.Up, Btn.Up) ? 1 : 0);
    this.zoom = (pressed(GamepadButton.RightShoulder, Btn.R) ? 1 : 0) - (pressed(GamepadButton.LeftShoulder, Btn.L) ? 1 : 0);
    const start = pressed(GamepadButton.Start, Btn.Start), hud = pressed(GamepadButton.North, Btn.Y);
    this.nextView = start && !this.startWas;
    this.toggleHud = hud && !this.hudWas;
    this.startWas = start; this.hudWas = hud;
  }
  /** Whether anything is held (the camera stops drifting). */
  active(): boolean { return this.turnX !== 0 || this.turnY !== 0 || this.zoom !== 0; }
}
