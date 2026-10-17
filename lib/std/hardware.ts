// zinc:hardware: what a machine has beyond its screen, its pad and its speakers, one call per feature (ZN-759): the battery, the network, the
// motion sensors, a rear touch pad, the microphone's level, a stereoscopic screen, a motor, where the saved data goes. Each is a query of
// zinc:sys device() (docs/targets/handhelds.md, "Hardware"): a console core's HAL answers for its console, a phone's glue for the phone,
// `zinc run --simulate <device>` for a simulated one (devices/psp.json, vita.json, ps2.json, n3ds.json: values set in its control panel).
// Where the machine has none the answer is null, -1, 0 or [], so a program can say so on its screen.
//
// The rest lives where every program already finds it: the pad's pressure (gamepadButtonValue), its motors (gamepadRumble) and second stick
// (gamepadAxis) are zinc:gfx's gamepad rows, slot 0 being a console's own pad; front touch is zinc:gfx's touch points; the 3DS's bottom screen
// is a zinc:gfx window (openWindow); the PS2's memory card is zinc:storage; sound is zinc:audio.
import { device, platform } from 'zinc:sys';
import { pointerButtons, pointerX, pointerY } from 'zinc:gfx';

export class Battery {
  /** 0..1 */
  level: number = 1;
  charging: boolean = false;
  /** What powers it: 'ac', 'usb', 'wireless' or 'none' (the battery alone). */
  source: string = 'none';
}
export class Network {
  online: boolean = false;
  /** 'wifi', 'ethernet', 'cellular', 'none' or 'unknown'. */
  type: string = 'none';
  /** The Wi-Fi network's name, '' when unknown. */
  ssid: string = '';
}
export class Vector { x: number = 0; y: number = 0; z: number = 0; }
export class Finger { x: number = 0; y: number = 0; id: i32 = 0; }

function json(query: string, arg: string = ''): any {
  const s = device(query, arg);
  if (s === '') return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}
function num(v: any, fallback: number): number { return v === undefined || v === null ? fallback : v as number; }
function vector(j: any): Vector | null {
  if (j === null) return null;
  const v = new Vector();
  v.x = num(j.x, 0); v.y = num(j.y, 0); v.z = num(j.z, 0);
  return v;
}
const DESKTOP: boolean = platform() === 'macos' || platform() === 'linux' || platform() === 'windows';

/** The battery, or null on a machine without one (a desktop computer, a PS2). */
export function battery(): Battery | null {
  const j = json('battery');
  if (j === null) return null;
  const b = new Battery();
  b.level = num(j.level, 1); b.charging = j.charging === true; b.source = j.source === undefined ? 'none' : '' + j.source;
  return b;
}
/** The network link (a console's Wi-Fi switch and access point), or null when the machine says nothing of it. */
export function network(): Network | null {
  const j = json('network');
  if (j === null) return null;
  const n = new Network();
  n.online = j.online === true; n.type = j.type === undefined ? 'unknown' : '' + j.type; n.ssid = j.ssid === undefined ? '' : '' + j.ssid;
  return n;
}
/** Acceleration including gravity in m/s², in the device's axes (x right, y up, z out of the screen), or null without a sensor. */
export function accelerometer(): Vector | null { return vector(json('motion')); }
/** Rotation rate in degrees per second around the device's axes, or null without a gyroscope. */
export function gyroscope(): Vector | null { return vector(json('gyro')); }

/** Whether the machine has a touch pad on its back (the Vita); a desktop stands in for one with the right mouse button. */
export function hasRearTouch(): boolean { return DESKTOP || device('reartouch') !== ''; }
/** The fingers on the rear touch pad, in the front screen's pixels (the pad's area mapped onto the screen). On a desktop, the right mouse
 *  button held over the window is a finger. */
export function rearTouches(): Finger[] {
  const out: Finger[] = [];
  const j = json('reartouch');
  if (j !== null) for (let i = 0; i < j.length; i++) { const f = new Finger(); f.x = num(j[i][0], 0); f.y = num(j[i][1], 0); f.id = num(j[i][2], i) as i32; out.push(f); }
  if (DESKTOP && (pointerButtons() & 2) !== 0) { const f = new Finger(); f.x = pointerX(); f.y = pointerY(); f.id = 99; out.push(f); }
  return out;
}

/** How loud the microphone hears now, 0 (silence) to 1, or -1 on a machine without one. */
export function microphoneLevel(): number {
  const j = json('microphone');
  return j === null ? -1 : num(j.level, 0);
}

/** A stereoscopic screen's depth: the 3DS's 3D slider, 0 (flat) to 1; -1 on a screen without 3D. */
export function stereoDepth(): number {
  const s = device('stereo');
  return s === '' ? -1 : parseFloat(s);
}
/** Asks for a picture per eye while the slider is up (true) or one picture (false); false when the screen has no 3D. While it is on, the
 *  frames alternate between the eyes, the left one first, and both are shown at each refresh: draw each frame for stereoEye(), its
 *  near things shifted by -depth for the left eye and +depth for the right, and move the world on the left eye's frames only. */
export function setStereo(on: boolean): boolean { return device('stereo', on ? '1' : '0') !== ''; }
/** The eye the frame being drawn is for: 0 the left one (or both, in a flat picture), 1 the right one. */
export function stereoEye(): i32 { return device('eye') === '1' ? 1 : 0; }

/** Shakes the machine's own motor for `ms` milliseconds (0 stops), as navigator.vibrate does; false without one. A pad's motors are
 *  zinc:gfx gamepadRumble. */
export function vibrate(ms: i32): boolean { return device('vibrate', '' + ms) === '1'; }

/** Where zinc:storage keeps what a program saves: a file on a desktop, the memory card on a PS2 (mc0:/...), the memory stick on a PSP. */
export function saveLocation(): string { return device('storage'); }
