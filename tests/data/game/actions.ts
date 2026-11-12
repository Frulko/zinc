import { InputActions, Camera } from 'zinc:game';
import { onFrame, GamepadButton, GamepadAxis } from 'zinc:gfx';
function check(value: boolean): void { if (!value) throw new Error('action assertion frame ' + frame); }
const input = new InputActions();
const move = input.add().key('a').key('b').pointer().button(0, GamepadButton.South);
const axis = input.add().axis(0, GamepadAxis.LeftX, 1, 0.25);
const camera = new Camera(100, 80);
let frame: i32 = 0;
onFrame((dt: number) => {
  frame++; input.update();
  if (move.down) camera.move(camera.x + 1, 0);
  if (frame === 1) check(move.pressed && move.down && !move.released);
  if (frame === 2) check(!move.pressed && move.down && !move.released);
  if (frame === 3) check(move.down && !move.released);
  if (frame === 4) check(!move.down && move.released);
  if (frame === 5) check(move.pressed && move.released && !move.down);
  if (frame === 6) check(move.pressed && move.down);
  if (frame === 7) check(move.down && !move.released && axis.value > 0.6 && axis.value < 0.7);
  if (frame === 8) check(move.down && !move.released);
  if (frame === 9) { check(move.released && !move.down && axis.value === 0); input.reset(); }
  if (frame === 10) { check(move.down); input.reset(); check(!move.down && !move.pressed && !move.released); }
  if (frame === 11) check(!move.down);
  if (frame === 12) { check(camera.x === 7); console.log('actions: ok'); }
});
