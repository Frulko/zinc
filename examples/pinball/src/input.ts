// Controls, read once per frame before the physics runs, so a flipper press moves the flipper in the same frame.
//   keyboard: Z / Left / A: left flipper; / / Right / D: right flipper; Space / Down: plunger (hold, release);
//             X: bump from the left, . (period): bump from the right, Up: bump from the front; Esc / P: pause;
//             Enter: start, add a player before the first launch, else pause.
//   gamepad (zinc:gfx buttons): L or D-pad left / R or D-pad right: flippers; A or D-pad down: plunger;
//             B / Y / D-pad up: bumps; Start: like Enter; Select: back.
//   touch (or mouse): left half of the table: left flipper; right half: right flipper; the side panel: plunger.
// The gfx buttons map Z and Space both to A on keyboards, so the plunger ignores A while Z is held.
import { isDown, keyCount, keyKind, keyName, KeyKind, touchCount, touchX, touchY, pointerDown, pointerX, pointerY, Btn } from 'zinc:gfx';

export class Controls {
  left: boolean = false;
  right: boolean = false;
  plunger: boolean = false;
  /** Edges (pressed this frame). */
  leftPressed: boolean = false;
  rightPressed: boolean = false;
  nudgeLeft: boolean = false;
  nudgeRight: boolean = false;
  nudgeUp: boolean = false;
  start: boolean = false;
  pause: boolean = false;
  up: boolean = false;
  down: boolean = false;
  confirm: boolean = false;
  back: boolean = false;
  /** A tap (touch or click) this frame and where. */
  tap: boolean = false;
  tapX: number = 0;
  tapY: number = 0;
  /** Anything pressed this frame (ends the attract mode's idle wait). */
  any: boolean = false;
}

const held = new Map<string, boolean>();
let prevButtons: i32 = 0;
let prevLeft = false, prevRight = false, prevTouching = false;

function key(name: string): boolean { return held.get(name) === true; }
function btnEdge(b: Btn, now: i32): boolean { return ((now >> (b as i32)) & 1) === 1 && ((prevButtons >> (b as i32)) & 1) === 0; }

/** `tableRight`: the x where the side panel starts (touches beyond it pull the plunger). */
export function readControls(c: Controls, tableRight: number): void {
  let pressedKey = false;
  c.nudgeLeft = false; c.nudgeRight = false; c.pause = false; c.start = false; c.back = false; c.confirm = false;
  c.up = false; c.down = false;
  for (let i: i32 = 0; i < keyCount(); i++) {
    const kind = keyKind(i);
    if (kind === KeyKind.Text) continue;
    const name = keyName(i).toLowerCase();
    if (kind === KeyKind.Up) { held.set(name, false); continue; }
    if (kind === KeyKind.Repeat) continue;
    held.set(name, true);
    pressedKey = true;
    if (name === 'x') c.nudgeLeft = true;
    else if (name === '.') c.nudgeRight = true;
    else if (name === 'escape' || name === 'p') { c.pause = true; c.back = true; }
    else if (name === 'enter') { c.start = true; c.confirm = true; }
    else if (name === ' ') c.confirm = true;
  }
  let buttons: i32 = 0;
  for (let b: i32 = 0; b < 12; b++) if (isDown(b as Btn)) buttons |= 1 << b;
  if (btnEdge(Btn.B, buttons)) c.nudgeLeft = true;
  if (btnEdge(Btn.Y, buttons)) c.nudgeRight = true;
  if (btnEdge(Btn.Up, buttons)) { c.nudgeUp = true; c.up = true; }
  else c.nudgeUp = false;
  if (btnEdge(Btn.Down, buttons)) c.down = true;
  if (btnEdge(Btn.Start, buttons)) c.start = true;
  if (btnEdge(Btn.A, buttons)) c.confirm = true;
  if (btnEdge(Btn.Select, buttons)) c.back = true;

  // touch: every finger counts; the mouse stands in for one finger
  let tl = false, tr = false, tp = false;
  const n = touchCount();
  const touching = n > 0 || pointerDown();
  for (let i: i32 = 0; i <= n; i++) {
    let x: number = 0;
    if (i < n) x = touchX(i);
    else if (n === 0 && pointerDown()) x = pointerX();
    else continue;
    if (x >= tableRight) tp = true;
    else if (x < tableRight / 2) tl = true;
    else tr = true;
  }
  c.tap = touching && !prevTouching;
  if (c.tap) { c.tapX = n > 0 ? touchX(0) : pointerX(); c.tapY = n > 0 ? touchY(0) : pointerY(); }
  prevTouching = touching;

  const zHeld = key('z');
  c.left = zHeld || key('arrowleft') || key('a') || isDown(Btn.Left) || isDown(Btn.L) || tl;
  c.right = key('/') || key('arrowright') || key('d') || isDown(Btn.Right) || isDown(Btn.R) || tr;
  c.plunger = key(' ') || key('arrowdown') || isDown(Btn.Down) || (isDown(Btn.A) && !zHeld) || tp;
  c.leftPressed = c.left && !prevLeft;
  c.rightPressed = c.right && !prevRight;
  prevLeft = c.left; prevRight = c.right;
  c.any = pressedKey || (buttons & ~prevButtons) !== 0 || c.tap;
  prevButtons = buttons;
}
