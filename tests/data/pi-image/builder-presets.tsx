import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import * as ui from 'zinc:ui';
import { render } from 'zinc:ui/solid';
import { setColorMode } from 'zinc:ui/nuxt';
import { quit } from 'zinc:gfx';
import { Workspace } from '../../../image/builder/src/pages/workspace';
import { profile, editProfile, presetError, saveError, presetDialogOpen, startBuild, status, errorMessage, presetNames } from '../../../image/builder/src/state';

function expect(value: boolean, message: string): void { if (!value) throw new Error(message); }
function click(text: string): void {
  const node = ui.find(text);
  expect(node >= 0, 'missing ' + text);
  ui.click(node);
}
function pointer(text: string): void {
  const node = ui.find(text);
  expect(node >= 0, 'missing pointer target ' + text);
  const box = ui.screenBox(node);
  ui.pointerAt(box[0] + box[2] / 2, box[1] + box[3] / 2, true);
  ui.pointerAt(box[0] + box[2] / 2, box[1] + box[3] / 2, false);
}
function nameField(): i32 {
  for (let h = 0; h < 5000; h++) {
    const n = ui.inspectNode(h);
    if (n !== null && n.ed !== null && (n.ed as ui.Edit).placeholder === 'Preset name') return h;
  }
  return -1;
}
setColorMode('light');
const path = sys.env('ZINC_PI_IMAGE_PROFILE');
let f = 0;
let bluetoothBefore = false;
render(Workspace, 0xf5f6f0, (dt: number) => {
  f++;
  if (sys.env('PI_TEST_REOPEN') === '1') {
    if (f === 3) {
      expect(profile().hostname === 'recovered' && profile().board === 'pi5', 'last settings were not restored');
      expect(presetNames().indexOf('Bench Pi') >= 0, 'saved presets were not restored');
      expect(ui.find('Raspberry Pi 5 / 500') >= 0, 'restored board not displayed');
      console.log('ok: cold restart restored the last settings'); quit();
    }
    return;
  }
  if (f === 2) expect(profile().hostname === 'zinc', 'initial profile');
  if (f === 3) click('Every 64-bit Pi');
  if (f === 5) pointer('Raspberry Pi 5 / 500');
  if (f === 6) { expect(profile().board === 'pi5', 'board list was clipped or behind General'); click('Detected at boot'); }
  if (f === 7) pointer('Touch Display 2 (7")');
  if (f === 8) { expect(profile().display === 'dsi-touch2', 'screen selection'); click('Raspberry Pi 5 / 500'); }
  if (f === 9) ui.sendKey('Escape');
  if (f === 10) { expect(ui.domLayers().length === 0, 'Escape did not close select'); click('Raspberry Pi 5 / 500'); }
  if (f === 11) { ui.pointerAt(1000, 700, true); ui.pointerAt(1000, 700, false); }
  if (f === 12) { expect(ui.domLayers().length === 0, 'outside press did not close select'); click('Save as…'); }
  if (f === 26) ui.typeText(nameField(), 'Bench Pi');
  if (f === 30) ui.sendKey('Enter');
  if (f === 32) { expect(!presetDialogOpen(), 'save preset did not close'); editProfile((p) => { p.hostname = 'changed'; p.board = 'pi3'; p.wifiPassword = 'changed'; }); }
  if (f === 34) click('Last settings');
  if (f === 36) pointer('Bench Pi');
  if (f === 38) {
    expect(profile().hostname === 'zinc' && profile().board === 'pi5' && profile().wifiPassword === 'secret', 'preset did not restore all settings');
    expect(fs.readText(path).indexOf('pinned') >= 0, 'preset lost unknown settings');
    click('Save as…');
  }
  if (f === 50) { ui.typeText(nameField(), 'Bench Pi'); click('Save preset'); }
  if (f === 52) { expect(presetDialogOpen() && presetError() !== '', 'duplicate preset was overwritten'); click('Cancel'); }
  if (f === 66) { fs.rename(path, path + '.backup'); fs.mkdir(path, false); editProfile((p) => { p.hostname = 'unsaved'; }); }
  if (f === 68) {
    expect(saveError() !== '', 'save failure was hidden');
    startBuild();
    expect(status() !== 'running' && errorMessage() !== '', 'an unsaved profile started a build');
  }
  if (f === 69) { fs.remove(path, true); fs.rename(path + '.backup', path); editProfile((p) => { p.hostname = 'recovered'; }); }
  if (f === 70) {
    expect(saveError() === '' && errorMessage() === '', 'save failure did not clear after recovery');
    bluetoothBefore = profile().bluetooth;
    for (let h = 0; h < 5000; h++) {
      const n = ui.inspectNode(h);
      if (n !== null) {
        expect(n.role !== 'switch', 'builder still uses mobile-style switches');
        if (n.label === 'Image settings') ui.scrollTo(h, 0, 100000);
      }
    }
  }
  if (f === 73) pointer('Bluetooth');
  if (f === 75) {
    expect(profile().bluetooth !== bluetoothBefore, 'desktop checkbox did not toggle');
    const saved: any = JSON.parse(fs.readText(path));
    expect((saved.bluetooth as boolean) === profile().bluetooth, 'checkbox change was not saved');
  }
  if (f === 78) { console.log('ok: dropdown layers, dismissal, named presets, autosave, visible save errors and desktop checkboxes'); quit(); }
});
