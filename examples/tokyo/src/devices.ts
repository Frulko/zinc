// What differs from one device to the next, in one table: how far each level of detail reaches, how many triangles a frame may draw, the
// frame rate aimed at, whether the night's lit windows are drawn. The code is the same everywhere; the asset build (zinc.json's per-target
// rules) decides which levels and picture sizes a device carries, and this table how it spends them. docs/reports/tokyo-per-device.md
// gives the reasons and the measurements.
import { platform, env } from 'zinc:sys';

export class Device {
  name = '';
  /** Metres to which a block is drawn at the near level, then at the mid level; beyond, the far level. */
  nearReach = 0;
  midReach = 0;
  /** Metres beyond which nothing is drawn (the sky's colour stands for the haze there). */
  farReach = 0;
  /** Triangles a frame may draw: the nearest blocks get their finer level first, the rest step down. */
  budget: i32 = 0;
  /** Frames a second the settings aim for (the readout shows the rate it gets). */
  fps: i32 = 60;
  /** The lit windows at night (a second facade picture). */
  night = true;
  /** The sky as a dome of colours (else one colour behind the city). */
  dome = true;
  /** Mid-level blocks stay loaded once loaded (else a block's model is freed when it leaves the mid reach). */
  keepModels = true;
}

function device(name: string, near: number, mid: number, far: number, budget: i32, fps: i32, night: boolean, dome: boolean, keep: boolean): Device {
  const d = new Device();
  d.name = name; d.nearReach = near; d.midReach = mid; d.farReach = far; d.budget = budget; d.fps = fps; d.night = night; d.dome = dome; d.keepModels = keep;
  return d;
}

/** The settings of this device: zinc:sys platform(), or ZINC_TOKYO_DEVICE to try another device's on a desktop. */
export function currentDevice(): Device {
  const forced = env('ZINC_TOKYO_DEVICE');
  const p = forced !== '' ? forced : platform();
  const d = settings(p);
  const budget = env('ZINC_TOKYO_BUDGET');   // a calibration knob: try another triangle budget without a rebuild of the table
  if (budget !== '') d.budget = parseInt(budget, 10);
  return d;
}

function settings(p: string): Device {
  //                     name       near  mid   far   budget  fps  night  dome   keep models
  if (p === 'psp') return device('psp', 0, 700, 2500, 14000, 30, false, false, false);
  if (p === 'n3ds') return device('n3ds', 0, 800, 2500, 18000, 30, true, false, false);
  if (p === 'vita') return device('vita', 0, 1400, 4000, 40000, 60, true, true, true);
  if (p === 'rpi1') return device('rpi', 0, 600, 2000, 8000, 30, false, false, true);
  return device('desktop', 700, 2200, 6000, 250000, 60, true, true, true);
}
