import { Controls, readControls } from '../../../examples/platformer/src/input';
import { onFrame } from 'zinc:gfx';
const controls = new Controls();
let frame: i32 = 0;
onFrame((dt: number) => {
  frame++; readControls(controls);
  if (controls.right !== (frame === 1 || frame === 4)) throw new Error('focus assertion frame ' + frame);
  if (frame === 5) console.log('focus: ok');
});
