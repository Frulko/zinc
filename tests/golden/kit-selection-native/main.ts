import * as ui from 'zinc:ui';
import * as appkit from 'zinc:appkit';
import { Checkbox } from 'zinc:ui/kit';
import { Switch as NativeSwitch, Checkbox as NativeCheckbox } from 'zinc:appkit';
import { createSignal } from 'zinc:ui/solid';
const [on, setOn] = createSignal(false);
const [mixed, setMixed] = createSignal(true);
const [plain, setPlain] = createSignal(false);
const [enabled, setEnabled] = createSignal(false);
let changes = 0, frame = 0;
const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'p-4 gap-4');
const check = Checkbox({ label: 'Project folders', checked: on, indeterminate: mixed, onChange: (next: boolean) => { changes++; setMixed(false); setOn(next); } });
ui.insert(root, check, -1);
const mark = ui.childAt(check, 0);
const ordinary = NativeCheckbox({ title: 'Keep a copy', value: plain, onValueChange: setPlain });
ui.insert(root, ordinary, -1);
const toggle = NativeSwitch({ value: enabled, onValueChange: setEnabled });
ui.insert(root, toggle, -1);
ui.mount(root, 0xffffff, (dt: number) => {
  frame++;
  if (!appkit.hostShown()) throw new Error('native host unavailable');
  if (frame === 2) {
    if (appkit.dump().indexOf(' mixed') < 0) throw new Error('mixed state not shown');
    if (appkit.dump().indexOf('ax="Project folders"') < 0) throw new Error('native checkbox lost its accessible name');
    if (!appkit.drive(mark, 10)) throw new Error('mixed checkbox click refused');
    appkit.drive(ordinary, 10); appkit.drive(ui.childAt(toggle, 0), 10);
  }
  if (frame === 4) {
    if (!on() || mixed() || changes !== 1 || !plain() || !enabled()) throw new Error('mixed or boolean native click');
    if (appkit.dump().indexOf(' mixed') >= 0) throw new Error('mixed state not cleared');
    appkit.drive(mark, 10); appkit.drive(ordinary, 10); appkit.drive(ui.childAt(toggle, 0), 10);
  }
  if (frame === 6) {
    if (on() || changes !== 2 || plain() || enabled()) throw new Error('checkbox/switch did not retain two-state cycle');
    appkit.drive(mark, 10); appkit.drive(ordinary, 10); appkit.drive(ui.childAt(toggle, 0), 10);
  }
  if (frame === 8) {
    if (!on() || changes !== 3 || !plain() || !enabled()) throw new Error('off advanced to mixed instead of on');
    setMixed(true);
  }
  if (frame === 10) {
    if (appkit.dump().indexOf(' mixed') < 0) throw new Error('mixed state round trip failed');
    console.log('selection native: ok');
  }
});
