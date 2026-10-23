import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import * as ui from 'zinc:ui';
import { render } from 'zinc:ui/solid';
import { theme, hex, setColorMode } from 'zinc:ui/nuxt';
import { quit } from 'zinc:gfx';
import { SettingsPage } from '../../../image/builder/src/pages/settings';
import { BuildPage } from '../../../image/builder/src/pages/build';
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
function App(): i32 {
  return <View className={`w-full h-full flex-row bg-${hex(theme().bg)}`}>
    <SettingsPage /><View className={`w-[1px] h-full bg-${hex(theme().border)}`} /><BuildPage />
  </View>;
}
setColorMode('dark');
const path = sys.env('ZINC_PI_IMAGE_PROFILE');
let f = 0;
render(App, 0x000000, (dt: number) => {
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
  if (f === 70) { expect(saveError() === '', 'save did not recover'); console.log('ok: dropdown layers, dismissal, named presets, autosave and visible save errors'); quit(); }
});
