import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import * as ui from 'zinc:ui';
import { render } from 'zinc:ui/solid';
import { quit, capture } from 'zinc:gfx';
import { Workspace } from '../../../image/builder/src/pages/workspace';
import { profile, setPage, setStatus, setStepTotal, setStepIndex, setStepLabels, setStepDetail, setStepProgress, setLogOpen, setLogLines } from '../../../image/builder/src/state';

function expect(value: boolean, message: string): void { if (!value) throw new Error(message); }
function pointer(text: string): void {
  const node = ui.find(text);
  expect(node >= 0, 'missing ' + text);
  const box = ui.screenBox(node);
  ui.pointerAt(box[0] + box[2] / 2, box[1] + box[3] / 2, true);
  ui.pointerAt(box[0] + box[2] / 2, box[1] + box[3] / 2, false);
}
const path = sys.env('ZINC_PI_IMAGE_PROFILE');
const shots = sys.env('PI_TEST_SHOTS');
let f = 0;
render(Workspace, 0xf5f5f7, (dt: number) => {
  f++;
  if (f === 3) { expect(ui.find('Zinc shell') < 0, 'apps page shown first'); setPage('apps'); }
  if (f === 6) { expect(ui.find('Zinc shell') >= 0 && ui.find('A/B system updates') < 0, 'shell option or advanced fold wrong'); pointer('Zinc shell'); }
  if (f === 8) { expect(profile().shell, 'shell option did not toggle'); pointer('Advanced'); }
  if (f === 11) { expect(ui.find('A/B system updates') >= 0, 'advanced options not shown'); pointer('A/B system updates'); }
  if (f === 13) {
    const saved: any = JSON.parse(fs.readText(path));
    expect((saved.shell as boolean) === true && (saved.ab as boolean) === true && (saved.growMiB as number) === 1536, 'shell, ab and growMiB not saved');
    capture(shots + '/apps.png');
  }
  if (f === 14) {
    ui.systemSignal('reducemotion 1');
    setPage('build'); setStatus('running'); setStepTotal(12); setStepIndex(3);
    setStepLabels(['Preparing the build container', 'Checking the profile', 'Downloading Raspberry Pi OS and Zinc 9.9.9']);
    setStepProgress(63); setStepDetail('Downloading · 63% · 280 of 450 MiB · about 1 min left'); setLogOpen(false); setLogLines(['a line']);
  }
  if (f === 20) {
    expect(ui.find('Downloading Raspberry Pi OS and Zinc 9.9.9') >= 0 && ui.find('Installing Zinc and the player') >= 0 && ui.find('Compressing') >= 0, 'steps (done, running, pending) missing');
    expect(ui.find('Step 3 of 12') >= 0 && ui.find('Downloading · 63% · 280 of 450 MiB · about 1 min left') >= 0, 'running step progress missing');
    capture(shots + '/steps.png');
    console.log('builder flow: shell and A/B options saved, live steps shown'); quit();
  }
});
