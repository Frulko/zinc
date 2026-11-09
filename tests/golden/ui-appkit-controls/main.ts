// AppKit controls and overlays (ZN-1073, tests/t0/ui_appkit_controls.sh): zinc:appkit's PushButton, Switch, Checkbox, PopUpButton, SegmentedControl,
// Slider, DatePicker, SearchField and Progress (the kit's Button, Switch, Slider, Tabs and Progress under them), shown by the AppKit host headless
// (a window never shown) and dumped. Each is driven through AppKit as a person would; the values come back to the program, a refused one goes back
// to the program's; an alert, a sheet and a popover open (built, not presented headless), end and resolve their promise. ZINC_RENDER=drawn runs
// the same program drawn: the components' fallbacks.
import * as ui from 'zinc:ui';
import * as appkit from 'zinc:appkit';
import { PushButton, Switch, Checkbox, PopUpButton, SegmentedControl, Slider, DatePicker, SearchField, Progress, alert, sheet, popover } from 'zinc:appkit';
import { createSignal } from 'zinc:ui/solid';
import { quit } from 'zinc:gfx';

const [on, setOn] = createSignal<boolean>(false);
const [hidden, setHidden] = createSignal<boolean>(true);
const [sort, setSort] = createSignal<string>('Name');
const [view, setView] = createSignal<i32>(0);
const [volume, setVolume] = createSignal<number>(20);
const [due, setDue] = createSignal<string>('2026-11-09');
const row = (cls: string): i32 => { const h = ui.createNode(ui.VIEW); ui.setClass(h, `flex-row items-center gap-[8px] ${cls}`); return h; };
const add = (parent: i32, child: i32): i32 => { ui.insert(parent, child, -1); return child; };

const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'flex-col w-full h-full p-[12px] gap-[10px]');
const r1 = add(root, row(''));
const save = add(r1, PushButton({ title: 'Save', keyEquivalent: 'Enter', onPress: () => { console.log('press save'); } }));
const sw = add(r1, Switch({ value: on, onValueChange: (v: boolean) => { console.log(`switch ${v}`); setOn(v); } }));
const locked = add(r1, Switch({ value: () => false, onValueChange: (v: boolean) => { console.log(`locked refuses ${v}`); } }));
const r2 = add(root, row(''));
const check = add(r2, Checkbox({ title: 'Hidden files', value: hidden, onValueChange: (v: boolean) => { console.log(`checkbox ${v}`); setHidden(v); } }));
const pop = add(r2, PopUpButton({ items: ['Name', 'Date', 'Size'], value: sort, onValueChange: (v: string) => { console.log(`popup ${v}`); setSort(v); } }));
const seg = add(r2, SegmentedControl({ items: ['Icons', 'List', 'Columns'], selected: view, onSelect: (i: i32) => { console.log(`segment ${i}`); setView(i); } }));
const r3 = add(root, row(''));
const slider = add(r3, Slider({ value: volume, onValueChange: (v: number) => { console.log(`slider ${v}`); setVolume(v); }, max: 100, step: 5, className: 'w-[140px]' }));
const date = add(r3, DatePicker({ value: due, onValueChange: (d: string) => { console.log(`date ${d}`); setDue(d); } }));
const search = add(r3, SearchField({ onChange: (t: string) => { console.log(`search ${t}`); } }));
add(root, Progress({ value: () => volume() }));

const track = (h: i32): i32 => ui.childAt(h, 0);   // a kit Switch's native control is its track (the slider's is its rail, the node itself)

function overlays(): string { return appkit.overlays().join(','); }
let frame = 0;
ui.mount(root, 0xffffff, (_dt: number) => {
  frame++;
  if (!appkit.hostShown()) {   // drawn: the fallbacks, pressed through zinc:ui
    if (frame === 2) {
      ui.click(save); ui.click(track(sw)); ui.click(check);
      alert({ message: 'Drawn?', buttons: ['Yes', 'No'] }).then((b: number) => { console.log(`drawn alert ${b}`); });
    }
    if (frame === 3) { console.log(`drawn: overlays ${appkit.overlays().length}`); ui.keyDown(-1, 'Escape'); }
    if (frame === 4) { console.log(`drawn: overlays ${appkit.overlays().length}`); quit(); }
    return;
  }
  if (frame === 2) {
    console.log(appkit.dump());
    console.log(`click ${appkit.drive(save, 10)} ${appkit.drive(track(sw), 10)} ${appkit.drive(track(locked), 10)} ${appkit.drive(check, 10)}`);
    console.log(`set ${appkit.drive(pop, 11, 'Size')} ${appkit.drive(seg, 11, '2')} ${appkit.drive(slider, 11, '', 47)} ${appkit.drive(date, 11, '2026-12-25')} ${appkit.drive(search, 0, 'abc')}`);
  }
  if (frame === 5) {
    console.log('-- after the person');
    console.log(appkit.dump());
    alert({ message: 'Delete 3 files?', detail: 'This cannot be undone.', style: 'warning', buttons: ['Delete', 'Cancel'] }).then((b: number) => { console.log(`alert ${b}`); });
    sheet((close: (r: string) => void): i32 => {
      const c = row('');
      add(c, PushButton({ title: 'Done', onPress: () => { close('done'); } }));
      return c;
    }).then((r: string) => { console.log(`sheet '${r}'`); });
    popover(save, (close: (r: string) => void): i32 => Checkbox({ title: 'Pinned', value: () => true, onValueChange: (_v: boolean) => { close('pinned'); } }), { edge: 'bottom' })
      .then((r: string) => { console.log(`popover '${r}'`); });
  }
  if (frame === 7) {
    console.log('-- overlays');
    console.log(appkit.dump());
    const o = appkit.overlays();
    const done = ui.childAt(ui.childAt(o[1], 0), 0);   // the sheet's Done button
    console.log(`end ${appkit.drive(o[0], 12, '', 1)} ${appkit.drive(done, 10)} ${appkit.drive(o[2], 12, '', -1)}`);
  }
  if (frame === 10) { console.log(`-- closed: overlays '${overlays()}'`); console.log(appkit.dump()); quit(); }
});
