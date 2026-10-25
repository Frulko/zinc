// What differs from one device to the next, in one table: where the levels of detail hand over, how many triangles a frame may draw, the
// haze, the frame rate aimed at, whether the night's lit windows are drawn. The code is the same everywhere; the asset build (zinc.json's
// per-target rules) decides which levels and picture sizes a device carries, and this table how it spends them. The numbers follow Pocket
// Tokyo's own (docs/reports/pocket3d-techniques.md); docs/reports/tokyo-per-device.md gives the measurements.
import { platform, env } from 'zinc:sys';

export class Device {
  name = '';
  /** Metres where the near level hands over to the mid level, and the mid to the far (the far level reaches the whole city), when the
   *  budget allows them in full: zinc:3d's World brings them in to keep it. */
  nearReach = 0;
  midReach = 0;
  /** Triangles a frame may draw. */
  budget: i32 = 0;
  /** Leave out the walls that face away from the eye: a third fewer triangles, about twice the draws. */
  sectors = true;
  /** Metres where the haze starts and where it is whole, in the sky's colour at the horizon. */
  fogStart = 0;
  fogEnd = 0;
  /** Frames a second the settings aim for (the readout shows the rate it gets). */
  fps: i32 = 60;
  /** The lit windows at night (a second facade picture). */
  night = true;
  /** The sky as a dome of colours (else one colour behind the city). */
  dome = true;
  /** Seconds before a chunk nobody wants is freed (0: chunks stay once read). */
  idle = 0;
  /** Milliseconds a frame may spend reading chunks (at least one is read when one is wanted). */
  readMs = 4;
}

function device(name: string, near: number, mid: number, budget: i32, sectors: boolean, fog: number, fogEnd: number, fps: i32, night: boolean,
                dome: boolean, idle: number, readMs: number): Device {
  const d = new Device();
  d.name = name; d.nearReach = near; d.midReach = mid; d.budget = budget; d.sectors = sectors; d.fogStart = fog; d.fogEnd = fogEnd; d.fps = fps;
  d.night = night; d.dome = dome; d.idle = idle; d.readMs = readMs;
  return d;
}

/** The settings of this device: zinc:sys platform(), or ZINC_TOKYO_DEVICE to try another device's on a desktop. */
export function currentDevice(): Device {
  const forced = env('ZINC_TOKYO_DEVICE');
  const p = forced !== '' ? forced : platform();
  const d = settings(p);
  const budget = env('ZINC_TOKYO_BUDGET');   // a calibration knob: another triangle budget without a rebuild of the table
  if (budget !== '') d.budget = parseInt(budget, 10);
  const sectors = env('ZINC_TOKYO_SECTORS');
  if (sectors !== '') d.sectors = sectors === '1';
  return d;
}

function settings(p: string): Device {
  //                             near  mid    budget   sectors fog   fog end fps  night  dome   idle read ms
  if (p === 'psp') return device('psp', 600, 1600, 40000, true, 1200, 5800, 30, false, false, 4, 6);
  if (p === 'n3ds') return device('n3ds', 600, 1600, 60000, true, 1200, 5800, 30, true, false, 4, 6);
  if (p === 'vita') return device('vita', 300, 1300, 160000, true, 1600, 5800, 60, true, true, 0, 4);
  if (p === 'rpi1') return device('rpi', 300, 900, 12000, true, 600, 3000, 30, false, false, 4, 6);
  return device('desktop', 600, 2000, 400000, true, 2500, 5800, 60, true, true, 0, 4);
}
