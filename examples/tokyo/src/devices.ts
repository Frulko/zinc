// What differs from one device to the next, in one table: how far the city reaches, where the haze starts, how many triangles a frame may
// draw and how fine a level must be, the frame rate aimed at, whether the night's lit windows are drawn. The code is the same everywhere;
// the asset build (zinc.json's per-target rules) decides which levels and picture sizes a device carries, and this table how it spends
// them. docs/reports/tokyo-per-device.md gives the reasons and the measurements.
import { platform, env } from 'zinc:sys';

export class Device {
  name = '';
  /** Metres beyond which nothing is drawn. */
  reach = 0;
  /** Metres where the haze starts: it thickens into the sky's colour until just before the reach, so tiles and level changes come out of
   *  it instead of popping in. Over the budget, only tiles in the haze are left out. */
  fogStart = 0;
  /** Triangles a frame may draw: every tile in view gets its coarsest level, then the nearest get finer ones while it lasts. */
  budget: i32 = 0;
  /** Pixels of error a level may show on this screen (zinc:3d CellView.tau): larger takes coarser levels nearer. */
  tau = 1;
  /** Frames a second the settings aim for (the readout shows the rate it gets). */
  fps: i32 = 60;
  /** The lit windows at night (a second facade picture). */
  night = true;
  /** The sky as a dome of colours (else one colour behind the city). */
  dome = true;
  /** Seconds a level change fades over: 0 where the changes happen inside the haze anyway (and a blended pass costs). */
  fade = 0;
  /** Seconds before a model nobody wants is freed (0: models stay once read). */
  idle = 0;
  /** Milliseconds a frame may spend reading models (at least one is read when one is wanted). */
  readMs = 4;
}

function device(name: string, reach: number, fog: number, budget: i32, tau: number, fps: i32, night: boolean, dome: boolean, fade: number,
                idle: number, readMs: number): Device {
  const d = new Device();
  d.name = name; d.reach = reach; d.fogStart = fog; d.budget = budget; d.tau = tau; d.fps = fps; d.night = night; d.dome = dome; d.fade = fade;
  d.idle = idle; d.readMs = readMs;
  return d;
}

/** The settings of this device: zinc:sys platform(), or ZINC_TOKYO_DEVICE to try another device's on a desktop. */
export function currentDevice(): Device {
  const forced = env('ZINC_TOKYO_DEVICE');
  const p = forced !== '' ? forced : platform();
  const d = settings(p);
  const budget = env('ZINC_TOKYO_BUDGET');   // calibration knobs: another triangle budget or tau without a rebuild of the table
  if (budget !== '') d.budget = parseInt(budget, 10);
  const tau = env('ZINC_TOKYO_TAU');
  if (tau !== '') d.tau = parseFloat(tau);
  return d;
}

function settings(p: string): Device {
  //                             reach  fog   budget  tau  fps  night  dome   fade  idle  read ms
  if (p === 'psp') return device('psp', 1800, 400, 14000, 1, 30, false, false, 0, 4, 6);
  if (p === 'n3ds') return device('n3ds', 2000, 500, 18000, 1, 30, true, false, 0, 4, 6);
  if (p === 'vita') return device('vita', 3500, 1600, 40000, 1, 60, true, true, 0.3, 0, 4);
  if (p === 'rpi1') return device('rpi', 1800, 300, 8000, 1, 30, false, false, 0, 0, 6);
  return device('desktop', 6000, 2500, 250000, 1, 60, true, true, 0.3, 0, 4);
}
