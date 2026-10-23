import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { Profile, loadProfile, saveProfile, readProfileText, encodeProfile, decodeProfile } from '../../../image/builder/src/services/profile';
import { addPreset, loadPresets } from '../../../image/builder/src/services/presets';

function expect(value: boolean, message: string): void { if (!value) throw new Error(message); }
const root = sys.env('PI_TEST_DIR');
const active = root + '/profile.json';
const library = root + '/presets.json';
for (const invalid of ['null', '[]', '42']) {
  let refused = false;
  try { decodeProfile(invalid); } catch (e) { refused = true; }
  expect(refused, 'invalid profile root accepted');
}
const raw = '{"base":{"url":"pinned"},"zinc":{"sha256":"kept"},"hostname":"original","wifi":{"password":"secret"}}';
fs.writeText(active, raw);
const profile = loadProfile(active);
profile.hostname = 'saved';
profile.board = 'pi5';
saveProfile(active, profile);
expect((fs.stat(active).mode & 511) === 384, 'profile permissions');
expect(readProfileText(active).indexOf('pinned') >= 0, 'unknown keys lost');
addPreset(library, 'Work Pi', readProfileText(active));
profile.hostname = 'other';
profile.wifiPassword = 'other secret';
saveProfile(active, profile);
const saved = loadPresets(library)[0];
const restored = loadProfile(active);
expect(restored.hostname === 'other', 'autosave reload');
saveProfile(active, new Profile());
// Restoring a preset also restores the unknown pinned engine/base settings.
saveProfile(active, decodeProfile(saved.text), saved.text);
expect(loadProfile(active).hostname === 'saved', 'preset restore');
expect(loadProfile(active).wifiPassword === 'secret', 'secret restore');
expect(readProfileText(active).indexOf('pinned') >= 0 && readProfileText(active).indexOf('kept') >= 0, 'pinned settings lost');
expect((fs.stat(library).mode & 511) === 384, 'presets permissions');
addPreset(library, 'Pi / Workshop', encodeProfile(profile, ''));
expect(loadPresets(library).length === 2 && loadPresets(library)[0].text === saved.text, 'saving another preset changed the first');
const before = readProfileText(library);
let refused = false;
try { addPreset(library, 'Work Pi', saved.text); } catch (e) { refused = true; }
expect(refused && readProfileText(library) === before, 'duplicate overwrote a preset');
for (const bad of ['', '   ']) {
  refused = false;
  try { addPreset(library, bad, saved.text); } catch (e) { refused = true; }
  expect(refused, 'empty preset name');
}
fs.writeText(active, '{damaged');
refused = false;
try { saveProfile(active, profile); } catch (e) { refused = true; }
expect(refused && readProfileText(active) === '{damaged', 'damaged settings were overwritten');
fs.writeText(library, '{damaged');
refused = false;
try { addPreset(library, 'Another', encodeProfile(profile, '')); } catch (e) { refused = true; }
expect(refused && readProfileText(library) === '{damaged', 'damaged presets were overwritten');
fs.mkdir(root + '/blocked.json', false);
refused = false;
try { saveProfile(root + '/blocked.json', profile, ''); } catch (e) { refused = true; }
expect(refused, 'failed replacement was ignored');
console.log('ok: presets, autosave reload, unknown keys, private files and refused writes');
