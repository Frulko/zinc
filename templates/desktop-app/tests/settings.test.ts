// The settings (src/settings.ts): what is saved reads back the same, and a damaged or empty file gives the defaults.
import * as assert from 'zinc:assert';
import { Settings, encode, decode } from '../src/settings';

const s = new Settings();
s.name = 'Ada'; s.dark = true; s.notes = ['one', 'two'];
const back = decode(encode(s));
assert.equal(back.name, 'Ada');
assert.ok(back.dark);
assert.equal(back.notes.join(','), 'one,two');
const empty = decode('');
assert.equal(empty.name, '');
assert.ok(!empty.dark);
assert.equal(decode('{"name": 3, "notes": [1, "x"]}').notes.join(','), 'x');
console.log('settings: ok');
