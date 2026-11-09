// A plugin's own native view (ZN-1075, tests/t0/ui_appkit_views.sh): zinc:levels of examples/native-view declares LevelIndicator in its spec, and the
// AppKit host mounts the plugin's NSLevelIndicator for that kind, headless (a window never shown), and dumps it. The person sets a level through
// AppKit: the view's event comes back to the program's onChange, and a level the program refuses goes back to the program's. ZINC_RENDER=drawn runs
// the same program drawn: the component's cells.
import * as ui from 'zinc:ui';
import * as appkit from 'zinc:appkit';
import { LevelIndicator, registered } from 'zinc:levels';
import { createSignal } from 'zinc:ui/solid';
import { quit } from 'zinc:gfx';

const [rating, setRating] = createSignal<number>(2);
const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'flex-col w-full h-full p-[12px] gap-[10px]');
const stars = LevelIndicator({ value: rating, max: 5, style: 'rating', editable: true, onChange: (v: number) => { console.log(`rating ${v}`); setRating(v); }, className: 'w-[90px]' });
ui.insert(root, stars, -1);
const fixed = LevelIndicator({ value: () => 4, max: 10, style: 'continuous', editable: true, onChange: (v: number) => { console.log(`fixed refuses ${v}`); }, className: 'w-[160px]' });
ui.insert(root, fixed, -1);

let frame = 0;
ui.mount(root, 0xffffff, (_dt: number) => {
  frame++;
  if (!appkit.hostShown()) {   // drawn: the fallback's cells, pressed through zinc:ui
    if (frame === 2) ui.click(ui.childAt(stars, 3));
    if (frame === 3) { console.log(`drawn: rating ${rating()}`); quit(); }
    return;
  }
  if (frame === 2) {
    console.log(`registered ${registered()}`);
    console.log(appkit.dump());
    console.log(`set ${appkit.drive(stars, 11, '', 4)} ${appkit.drive(fixed, 11, '', 9)}`);
  }
  if (frame === 5) { console.log('-- after the person'); console.log(appkit.dump()); quit(); }
});
