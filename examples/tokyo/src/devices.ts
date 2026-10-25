// What differs from one device to the next: zinc:3d's defaults3D() (the reaches, the triangle budget, the haze, the frame rate, the night,
// the sky dome, the chunks' idle and reading times of each console; docs/plugins/3d.md "Large static worlds"), which are Pocket Tokyo's own
// numbers (docs/reports/tokyo-per-device.md). The asset build (zinc.json's per-target rules) decides which levels and picture sizes a device
// carries. Tokyo adds only its knobs, to try another device's settings on a desktop.
import { Defaults3D, defaults3D } from 'zinc:3d';
import { env } from 'zinc:sys';

/** The settings of this device: zinc:sys platform(), or ZINC_TOKYO_DEVICE to try another device's on a desktop. */
export function currentDevice(): Defaults3D {
  const d = defaults3D(env('ZINC_TOKYO_DEVICE'));
  const budget = env('ZINC_TOKYO_BUDGET');   // a calibration knob: another triangle budget without a rebuild of the table
  if (budget !== '') d.budget = parseInt(budget, 10);
  const sectors = env('ZINC_TOKYO_SECTORS');
  if (sectors !== '') d.sectors = sectors === '1';
  return d;
}
