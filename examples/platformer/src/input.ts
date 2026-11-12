// The controls, read once per frame: the d-pad or the left stick moves, Cross jumps, Square runs, Start starts and pauses.
// On a keyboard (the desktop HAL's mapping): arrows or A / D, Space or Z jump, C runs, Enter is Start.
import { isDown, wasPressed, signalCount, signalNext, GamepadAxis, GamepadButton, Btn } from 'zinc:gfx';
import { InputActions } from 'zinc:game';

export class Controls {
  left = false;
  right = false;
  jump = false;          // held: a longer jump
  jumpPressed = false;   // this frame
  run = false;
  start = false;
}

const actions = new InputActions();
const left = actions.add().key('ArrowLeft').key('a').button(0, GamepadButton.Left).axis(0, GamepadAxis.LeftX, -1, 0.35);
const right = actions.add().key('ArrowRight').key('d').button(0, GamepadButton.Right).axis(0, GamepadAxis.LeftX, 1, 0.35);
const jump = actions.add().key(' ').key('z').pointer().button(0, GamepadButton.South);
const run = actions.add().key('c').button(0, GamepadButton.West);
const start = actions.add().key('Enter').button(0, GamepadButton.Start);

export function readControls(c: Controls): Controls {
  actions.update();
  // This app owns the signal queue; a lost key-up must not keep movement held.
  while (signalCount() > 0) if (signalNext() === 'focus 0') actions.reset();
  c.left = isDown(Btn.Left) || left.down;
  c.right = isDown(Btn.Right) || right.down;
  c.jump = isDown(Btn.A) || jump.down;
  c.jumpPressed = wasPressed(Btn.A) || jump.pressed;
  c.run = isDown(Btn.X) || run.down;
  c.start = wasPressed(Btn.Start) || start.pressed;
  return c;
}
