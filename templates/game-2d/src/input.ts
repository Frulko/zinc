// Sample actions once per frame; retain Btn controls for console HALs.
import { signalCount, signalNext, GamepadAxis, GamepadButton } from 'zinc:gfx';
import { InputActions } from 'zinc:game';

const actions = new InputActions();
export const left = actions.add().key('ArrowLeft').key('a').button(0, GamepadButton.Left).axis(0, GamepadAxis.LeftX, -1);
export const right = actions.add().key('ArrowRight').key('d').button(0, GamepadButton.Right).axis(0, GamepadAxis.LeftX, 1);
export const up = actions.add().key('ArrowUp').key('w').button(0, GamepadButton.Up).axis(0, GamepadAxis.LeftY, -1);
export const down = actions.add().key('ArrowDown').key('s').button(0, GamepadButton.Down).axis(0, GamepadAxis.LeftY, 1);
export const start = actions.add().key('Enter').key(' ').button(0, GamepadButton.Start).button(0, GamepadButton.South);

export function readInput(): void {
  actions.update();
  // This app owns the signal queue; focus loss may hide a key-up.
  while (signalCount() > 0) if (signalNext() === 'focus 0') actions.reset();
}
