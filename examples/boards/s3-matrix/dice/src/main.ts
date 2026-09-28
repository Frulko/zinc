// dice: shake the board to roll. The face flickers through random values, slows down like a die losing speed,
// lands with a small bounce and stays; after a while it dims to save the LEDs (and your eyes).
// On the Mac: Space shakes the emulated board.
import { onFrame, clear } from 'zinc:gfx';
import * as imu from 'zinc:imu';
import { drawFace, faceColor, dim } from './faces';

const ROLL_TIME = 1.6;  // seconds of tumbling
const IDLE_DIM = 12;    // seconds before the face dims

let value: i32 = 6;
let rolling = false;
let rollTime = 0;       // time since the roll started
let flipIn = 0;         // time until the tumbling face changes
let shown = 0;          // time since the die landed
let rolls: i32 = 0;

function randomFace(except: i32): i32 {
  let v: i32 = except;
  while (v === except) v = Math.floor(Math.random() * 6) + 1;
  return v;
}

function roll(): void {
  rolling = true;
  rollTime = 0;
  flipIn = 0;
}

onFrame((dt: number) => {
  imu.update(dt);
  if (imu.shaken()) roll();

  let bounce = 0;
  if (rolling) {
    rollTime += dt;
    flipIn -= dt;
    if (flipIn <= 0) {
      value = randomFace(value);
      flipIn = 0.04 + 0.25 * (rollTime / ROLL_TIME) * (rollTime / ROLL_TIME);  // slower and slower
    }
    if (rollTime >= ROLL_TIME) {
      rolling = false;
      shown = 0;
      rolls++;
      console.log(`roll ${rolls}: ${value}`);
    }
  } else {
    shown += dt;
    if (shown < 0.3) bounce = shown < 0.15 ? 1 : 0;  // a one-pixel hop when it lands
  }

  // full colour while playing, dimmer when left alone
  const k = rolling || shown < IDLE_DIM ? 1 : Math.max(0.25, 1 - (shown - IDLE_DIM) * 0.2);
  clear(0x000000);
  drawFace(value, 0, -bounce, dim(rolling ? 0xffffff : faceColor(value), k));
});
