// flipctl on Zinc: the Flipper One panel UI (flipperdevices/flipctl-slint, ported) drawn with zinc:gfx, 256x144.
// Keyboard (QWERTY and AZERTY): arrows or ZQSD/WASD move and change values, Enter/Space open, Esc/Backspace go back,
// PageUp/PageDown/Home/End jump, Tab/Shift+Tab step, F1-F5 press the five soft keys, M returns to the idle screen.
import { onFrame, escapeByApp } from 'zinc:gfx';
import { env } from 'zinc:sys';
import { initPanel } from './panel';
import { Menu, Item } from './menu';
import { IdleScreen, Link } from './idle';
import { Screen } from './screen';
import { ICON_FRAME_MS, LIST_ROWS } from './theme';
import * as K from './keys';

function toggle(label: string, icon: string, frames: i32, choices: string[]): Item {
  const it = new Item(label, icon, frames, choices[0], -1);
  it.choices = choices;
  return it;
}

const NETWORK = new Menu('> Network', [
  toggle('Airplane mode', 'airplane_mode_animated', 10, ['Off', 'On']),
  new Item('Routing info', 'info_icon', 1, '', -1),
  new Item('5G Modem', 'modem_5g', 1, '', -1),
  new Item('Wi-Fi', 'wifi', 1, 'Connected', -1),
  new Item('Ethernet', 'ethernet', 1, '', -1),
]);
const SETTINGS = new Menu('> Settings', [
  new Item('System info', '', 1, '', -1), new Item('Battery info', '', 1, '', -1), new Item('Disk info', '', 1, '', -1),
  new Item('Update', '', 1, '', -1), new Item('Reboot', '', 1, '', -1), new Item('Shutdown', '', 1, '', -1),
]);
const MAIN = new Menu('', [
  new Item('Desktop Computer', 'desktop_computer', 1, '', -1),
  new Item('Boot Menu', 'flipper_os', 1, '', -1),
  new Item('Apps', 'apps_animated', 9, '', -1),
  new Item('Files', 'files_animated', 10, '', -1),
  new Item('Network', 'network_animated', 10, '', 0),
  new Item('Testing: flipctl', 'testing_animated', 9, '', -1),
  new Item('Settings', 'settings_animated', 10, '', 1),
]);
MAIN.subs = [NETWORK, SETTINGS];

const IDLE = new IdleScreen([new Link('eth0', '192.168.1.42', 'fe80::1a2b:3c4d'), new Link('wlan0', '192.168.1.57', '')], MAIN);
const stack: Screen[] = [IDLE];

function back(): void { if (stack.length > 1) stack.pop(); }
function open(): void {
  const next = stack[stack.length - 1].open();
  if (next !== null) stack.push(next);
}

function act(a: i32): void {
  const top = stack[stack.length - 1];
  if (a === K.UP) top.move(-1);
  else if (a === K.DOWN) top.move(1);
  else if (a === K.LEFT) top.cycle(-1);
  else if (a === K.RIGHT) top.cycle(1);
  else if (a === K.PAGE_UP) top.move(-LIST_ROWS);
  else if (a === K.PAGE_DOWN) top.move(LIST_ROWS);
  else if (a === K.HOME) top.move(-1000);
  else if (a === K.END) top.move(1000);
  else if (a === K.OK || a === K.SOFT0 + 4) open();
  else if (a === K.BACK || a === K.SOFT0) back();
  else if (a === K.HOME_SCREEN) while (stack.length > 1) stack.pop();
}

let t = 0;
let ready = false;
escapeByApp(true);   // Esc goes back instead of quitting
console.log('flipctl ready');
const shot = env('ZINC_SCREEN');   // idle | menu | network | wifi: screenshots and tests
if (shot === 'menu' || shot === 'network' || shot === 'wifi') { stack.push(MAIN); }
if (shot === 'network' || shot === 'wifi') { stack.push(NETWORK); }
if (shot === 'wifi') { NETWORK.selected = 3; open(); }

onFrame((dt: number) => {
  if (!ready) { initPanel(); ready = true; }
  t += dt;
  const acts = K.readActions();
  for (let i = 0; i < acts.length; i++) act(acts[i]);
  stack[stack.length - 1].draw(Math.floor(t * 1000 / ICON_FRAME_MS));
});
