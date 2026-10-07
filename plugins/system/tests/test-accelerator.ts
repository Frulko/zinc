// Unit cases of the accelerator parser and the role table (ZN-236): `zinc test plugins/system/tests`
import * as assert from 'zinc:assert';
import { parseAccelerator, formatAccelerator, macModifiers } from '../accelerator';
import { roleInfo, menuRoles, isNativeRole } from '../menu-roles';

function ok(text: string, mac: boolean, canonical: string): void {
  const a = parseAccelerator(text, mac);
  assert.ok(a.ok, text + ': ' + a.error);
  assert.equal(formatAccelerator(a), canonical, text);
}
function bad(text: string, part: string): void {
  const a = parseAccelerator(text, true);
  assert.ok(!a.ok, text + ' should not parse');
  assert.ok(a.error.includes(part), text + ': ' + a.error);
}

// modifiers and their aliases
ok('CmdOrCtrl+N', true, 'Cmd+N');
ok('CmdOrCtrl+N', false, 'Ctrl+N');
ok('CommandOrControl+S', true, 'Cmd+S');
ok('cmd+shift+z', true, 'Shift+Cmd+Z');
ok('Ctrl+Alt+Delete', false, 'Ctrl+Alt+Delete');
ok('Option+Space', true, 'Alt+Space');
ok('Super+L', false, 'Cmd+L');
ok('Shift+Ctrl+Alt+Cmd+K', true, 'Ctrl+Alt+Shift+Cmd+K');
// keys
ok('a', true, 'A');
ok('7', true, '7');
ok('F1', true, 'F1');
ok('ctrl+f12', false, 'Ctrl+F12');
ok('Alt+F24', false, 'Alt+F24');
ok('Cmd+Plus', true, 'Cmd+Plus');
ok('Cmd+Minus', true, 'Cmd+Minus');
ok('Cmd+Left', true, 'Cmd+Left');
ok('Cmd+arrowright', true, 'Cmd+Right');
ok('Cmd+pgdn', true, 'Cmd+PageDown');
ok('Escape', true, 'Escape');
ok('esc', true, 'Escape');
ok('Cmd+return', true, 'Cmd+Enter');
ok('Cmd+Backquote', true, 'Cmd+Backquote');
ok('Cmd+BracketLeft', true, 'Cmd+BracketLeft');
ok('Shift+Tab', true, 'Shift+Tab');
// whitespace around parts is tolerated
ok('Cmd + Shift + P', true, 'Shift+Cmd+P');
// invalid input
bad('', 'empty');
bad('Cmd', 'no key');
bad('Cmd+Shift', 'no key');
bad('Cmd+A+B', 'two keys');
bad('A+Cmd', 'key must come last');
bad('Cmd+Cmd+A', 'repeated');
bad('CmdOrCtrl+Cmd+A', 'repeated');
bad('Cmd+Foo', "unknown key 'Foo'");
bad('Cmd++', 'empty part');
bad('+A', 'empty part');
bad('F25', "unknown key 'F25'");
bad('F0', "unknown key 'F0'");
bad('Cmd+', 'empty part');
// modifier bits for NSEvent
assert.equal(macModifiers(parseAccelerator('Cmd+A', true)), 1048576);
assert.equal(macModifiers(parseAccelerator('Shift+Cmd+A', true)), 1048576 + 131072);
assert.equal(macModifiers(parseAccelerator('Ctrl+Alt+A', true)), 262144 + 524288);
assert.equal(macModifiers(parseAccelerator('A', true)), 0);
// roles
assert.equal(roleInfo('quit', 'Notes')!.label, 'Quit Notes');
assert.equal(roleInfo('quit', 'Notes')!.accelerator, 'Cmd+Q');
assert.equal(roleInfo('paste', 'Notes')!.accelerator, 'Cmd+V');
assert.ok(roleInfo('nonsense', 'Notes') === null);
assert.equal(menuRoles('editMenu').length, 7);
assert.equal(menuRoles('appMenu')[menuRoles('appMenu').length - 1], 'quit');
assert.ok(isNativeRole('minimize') && !isNativeRole('copy') && !isNativeRole('quit'));
console.log('accelerator: ok');
