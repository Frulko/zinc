import * as ui from 'zinc:ui';
import * as sys from 'zinc:sys';
import { render } from 'zinc:ui/solid';
import { setColorMode } from 'zinc:ui/nuxt';
import { quit, capture, height, width } from 'zinc:gfx';
import { Workspace } from '../../../image/builder/src/pages/workspace';
import { status, profile, imagePath, errorMessage, stepProgress, stepDetail, logLines, setPage, setLogOpen } from '../../../image/builder/src/state';

function expect(value: boolean, message: string): void { if (!value) throw new Error(message); }
function settings(): i32 {
  for (let h = 0; h < 5000; h++) {
    const n = ui.inspectNode(h);
    if (n !== null && n.label === 'Image settings') return h;
  }
  throw new Error('missing settings scroll area');
}
function hostnameField(): i32 {
  for (let h = 0; h < 5000; h++) {
    const n = ui.inspectNode(h);
    if (n !== null && n.ed !== null && (n.ed as ui.Edit).value === 'zinc') return h;
  }
  throw new Error('missing hostname field');
}
function pointer(text: string): void {
  const node = ui.find(text);
  expect(node >= 0, 'missing ' + text);
  const box = ui.screenBox(node);
  expect(box[1] >= 0 && box[1] + box[3] <= height(), 'unreachable ' + text);
  ui.pointerAt(box[0] + box[2] / 2, box[1] + box[3] / 2, true);
  ui.pointerAt(box[0] + box[2] / 2, box[1] + box[3] / 2, false);
}
setColorMode('light');
const editHostname = sys.env('FAKE_PI_IMAGE_FAIL') !== '1' && profile().hostname === 'zinc';
let f = 0, finished = 0;
render(Workspace, 0xf5f5f7, (dt: number) => {
  f++;
  if (f === 3) capture(sys.env('PI_TEST_SHOTS') + '/form.png');
  if (f === 4 && editHostname) {
    const box = ui.screenBox(hostnameField());
    ui.scrollTo(settings(), 0, box[1] - 250);
  }
  if (f === 6 && editHostname) {
    ui.focusNode(hostnameField()); ui.sendKey('End'); ui.typeText(ui.focused(), '-lab');
    expect(profile().hostname === 'zinc-lab', 'hostname input not saved');
    ui.focusNode(-1);
    ui.scrollTo(settings(), 0, 0);
  }
  if (f === 7) setPage('build');
  if (f === 8) pointer('Build the image');
  if (f > 8 && (status() === 'done' || status() === 'failed')) {
    finished++;
    if (finished === 50) setLogOpen(true);
    if (finished === 100) {   // Let button transitions and the 1.2 s scroll-indicator fade finish before comparing pixels.
      if (sys.env('FAKE_PI_IMAGE_FAIL') === '1') { expect(status() === 'failed' && errorMessage().indexOf('wifi.country') >= 0, 'failure not shown'); expect(ui.find('Retry') >= 0 && ui.find('Stopped at: Checking the profile') >= 0, 'failed step and Retry not shown'); }
      else {
        expect(status() === 'done' && imagePath().endsWith('/dist/demo.img.xz'), 'finished image not shown');
        const button = ui.screenBox(ui.find('Open Imager'));
        expect(button[0] + button[2] <= width() && button[1] + button[3] <= height(), 'flash action outside the window');
        expect(ui.find('Step 4 of 4') >= 0, 'step count missing');
        expect(ui.find('Show file') >= 0 && ui.find('Compressing') >= 0, 'result card or step list missing');
        const count = ui.screenBox(ui.find('Step 4 of 4'));
        expect(count[3] > 0, 'step count is not visible');
        expect(ui.find('Zinc 9.9.9 · engine and player') >= 0, 'engine version not shown');
        expect(stepProgress() === 42 && stepDetail().startsWith('Compressing · 42%'), 'progress line not read');
        expect(logLines().every((l: string) => !l.startsWith('::progress')), 'progress line in the log');
      }
      capture(sys.env('PI_TEST_SHOTS') + (status() === 'done' ? '/built.png' : '/failed.png'));
    }
    if (finished === 102) ui.scrollTo(settings(), 0, 100000);
    if (finished === 110) {
      const log = ui.find('Latest output');
      expect(log >= 0 && ui.screenBox(log)[1] + ui.screenBox(log)[3] <= height(), 'log controls outside the window');
      console.log('builder session: ' + status()); quit();
    }
  }
  expect(f < 10000, 'build process did not finish');
});
