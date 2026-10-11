// The typed gamepad rows of zinc:gfx (ZN-574), with the script of pads.input: the slots, the buttons in the W3C order, the analog trigger, an
// axis, and the pad's buttons as the Btn of isDown. Run on the interpreter and compiled by tests/t1/webenv_gamepad.sh; the output is rows.out.
import { onFrame, gamepadCount, gamepadConnected, gamepadName, gamepadButtons, gamepadButton, gamepadButtonValue, gamepadAxis, gamepadRumble, GamepadButton, GamepadAxis, isDown, Btn } from 'zinc:gfx';

let frame = 0;
onFrame((dt: number): void => {
  frame++;
  let line = `frame ${frame}:`;
  for (let i: i32 = 0; i < gamepadCount(); i++) {
    if (!gamepadConnected(i)) continue;
    line += ` [${i} "${gamepadName(i)}" buttons ${gamepadButtons(i)} south ${gamepadButton(i, GamepadButton.South)} trigger ${gamepadButtonValue(i, GamepadButton.RightTrigger)} right x ${gamepadAxis(i, GamepadAxis.RightX)}]`;
  }
  console.log(`${line} A ${isDown(Btn.A)} Right ${isDown(Btn.Right)}`);
  if (frame === 3) console.log(`rumble: slot 1 ${gamepadRumble(1, 1, 0.5, 100)}, slot 0 ${gamepadRumble(0, 1, 1, 100)}, slot 9 ${gamepadRumble(9, 1, 1, 100)}`);
});
