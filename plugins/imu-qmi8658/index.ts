// zinc:imu — 6-axis motion sensor (QMI8658 on the Waveshare ESP32-S3-Matrix, docs/boards.md).
// Call update(dt) once per frame, then read accel / gyro or the helpers (tilt, shake).
// Axes are the board's screen frame: x to the right, y down, z out of the screen (towards you). Lying flat, face up,
// the accelerometer reads (0, 0, +1) g: it measures the reaction to gravity, so the axis pointing up reads +1 g.
//
// Without a sensor (macOS, Linux, sim, or QEMU) the IMU is emulated from the program's input:
//   arrow keys / WASD   tilt the board (hold), it levels out when released
//   mouse drag          tilt proportionally to the drag distance
//   Space               shake
import I from './native/imu.spec';
import { isDown, wasPressed, pointerDown, pointerX, pointerY, Btn } from 'zinc:gfx';

export class Vec3 {
  x: number = 0; y: number = 0; z: number = 0;
}

/** Acceleration in g (screen frame). */
export const accel: Vec3 = new Vec3();
/** Angular rate in degrees per second (screen frame). */
export const gyro: Vec3 = new Vec3();

const SHAKE_G = 0.9;         // | |a| - 1 g | above this is a shake
const SHAKE_COOLDOWN = 0.5;  // seconds between two shake events

let started = false, device = false;
let temp = 25;
let activity = 0, cooldown = 0, shakeFlag = false;
let clock = 0;
// emulation state
let emuX = 0, emuY = 0;      // current tilt as sin(angle), + = right / bottom edge lower
let dragging = false, dragX = 0, dragY = 0;
let shakeLeft = 0;

/** Opens the sensor (update() does it on its first call). True when a real QMI8658 answered. */
export function begin(): boolean {
  if (!started) {
    started = true;
    device = I.open();
    console.log(device ? 'imu: QMI8658 ready' : 'imu: no sensor, emulated (arrows/WASD or mouse drag tilt, Space shakes)');
  }
  return device;
}

/** True when the values come from the emulation instead of a sensor. */
export function emulated(): boolean { begin(); return !device; }

function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }
/** Arc sine in radians (Math has atan2, not asin). */
function asin(s: number): number { const c = clamp(s, -1, 1); return Math.atan2(c, Math.sqrt(1 - c * c)); }

function emulate(dt: number): void {
  let tx = 0, ty = 0;
  if (isDown(Btn.Left)) tx -= 0.7;
  if (isDown(Btn.Right)) tx += 0.7;
  if (isDown(Btn.Up)) ty -= 0.7;
  if (isDown(Btn.Down)) ty += 0.7;
  // mouse drag: 100 window points = full tilt, whatever the emulator's zoom
  if (pointerDown()) {
    if (!dragging) { dragging = true; dragX = pointerX(); dragY = pointerY(); }
    tx = clamp((pointerX() - dragX) / 100, -0.95, 0.95);
    ty = clamp((pointerY() - dragY) / 100, -0.95, 0.95);
  } else dragging = false;
  const k = Math.min(1, dt * 6);  // the board eases into the new angle
  const ox = emuX, oy = emuY;
  emuX += (tx - emuX) * k;
  emuY += (ty - emuY) * k;
  accel.x = -emuX;
  accel.y = -emuY;
  accel.z = Math.sqrt(Math.max(0, 1 - emuX * emuX - emuY * emuY));
  const rad = 180 / Math.PI, inv = dt > 0 ? 1 / dt : 0;
  gyro.x = (asin(emuY) - asin(oy)) * rad * inv;
  gyro.y = -(asin(emuX) - asin(ox)) * rad * inv;
  gyro.z = 0;
  if (wasPressed(Btn.A)) shakeLeft = 0.4;
  if (shakeLeft > 0) {  // a vigorous shake: a few g in random directions
    shakeLeft -= dt;
    accel.x += (Math.random() - 0.5) * 5;
    accel.y += (Math.random() - 0.5) * 5;
    accel.z += (Math.random() - 0.5) * 3;
    gyro.z = (Math.random() - 0.5) * 800;
  }
  temp = 24.5 + 0.5 * Math.sin(clock / 20);
}

/** Reads a new sample (or advances the emulation) and runs shake detection. Call once per frame. */
export function update(dt: number): void {
  begin();
  clock += dt;
  if (device && I.read()) {
    accel.x = I.value(0); accel.y = I.value(1); accel.z = I.value(2);
    gyro.x = I.value(3); gyro.y = I.value(4); gyro.z = I.value(5);
    temp = I.value(6);
  } else if (!device) emulate(dt);
  const mag = Math.sqrt(accel.x * accel.x + accel.y * accel.y + accel.z * accel.z);
  activity = Math.abs(mag - 1);
  cooldown -= dt;
  if (activity > SHAKE_G && cooldown <= 0) { shakeFlag = true; cooldown = SHAKE_COOLDOWN; }
}

/** Sensor temperature in °C (die temperature: a few degrees above the room). */
export function temperature(): number { return temp; }

/** Sideways tilt, -1..1 (sine of the angle): + when the right edge is lower, i.e. things roll to the right. */
export function tiltX(): number { return clamp(-accel.x, -1, 1); }
/** Front/back tilt, -1..1: + when the bottom edge is lower, i.e. things roll down the screen. */
export function tiltY(): number { return clamp(-accel.y, -1, 1); }
/** Tilt angles in degrees (same signs as tiltX / tiltY). */
export function angleX(): number { return asin(tiltX()) * 180 / Math.PI; }
export function angleY(): number { return asin(tiltY()) * 180 / Math.PI; }

/** How far the acceleration is from a board at rest, in g (0 = still). */
export function motion(): number { return activity; }

/** True once per shake (a jolt above ~0.9 g, at most every half second). */
export function shaken(): boolean {
  const s = shakeFlag;
  shakeFlag = false;
  return s;
}
