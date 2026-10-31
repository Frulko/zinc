// The share dialog of zinc:screen-capture/picker (ZN-911; owner, 2026-10-31: scrolling the list of screens and windows jumped back to the
// top). Eight fake windows (ZINC_FAKE_WINDOWS=8) make the list longer than its box: scrolled with the wheel, it keeps its place while the
// thumbnails refresh (every 1.5 s); the search field filters by name, and Share sends the one left.
import * as ui from 'zinc:ui';
import { render } from 'zinc:ui/solid';
import { pickScreen, pickerOpen, confirmPicker, ShareChoice } from 'zinc:screen-capture/picker';

function App(): i32 { return <View className="grow bg-white" />; }
/** The scroll area around a node: the first ancestor scrolled away from the top. */
function scrolled(h: i32): i32 { let p = h; while (p >= 0 && ui.scrollTop(p) === 0) p = ui.parentOf(p); return p; }
const shown = (name: string): string => ui.find(name) >= 0 ? 'shown' : 'hidden';
let frames = 0, list = -1, top = 0;
render(App, 0xffffff, (dt: number) => {
  frames++;
  if (frames === 2) pickScreen({ title: 'Share your screen' }).then((c: ShareChoice | null) => { console.log(`shared ${c !== null ? c.sourceId : 'nothing'}`); });
  if (frames === 10) {
    console.log(`open ${pickerOpen()}`);
    const b = ui.screenBox(ui.find('Zinc Fake Screen'));
    for (let k = 0; k < 3; k++) ui.wheelAt(b[0] + 20, b[1] + 20, -3);
  }
  if (frames === 60) {
    list = scrolled(ui.find('Zinc Fake Window 2'));
    top = Math.round(ui.scrollTop(list));
    console.log(`scrolled ${list >= 0 && top > 0}`);
  }
  if (frames === 300) {   // past two refreshes of the thumbnails
    const now = scrolled(ui.find('Zinc Fake Window 2'));
    console.log(`after the refresh: same list ${now === list}, same place ${Math.round(ui.scrollTop(list)) === top}`);
    ui.typeText(ui.focused(), 'window 8');
  }
  if (frames === 310) {
    console.log(`search: screen ${shown('Zinc Fake Screen')}, window 2 ${shown('Zinc Fake Window 2')}, window 8 ${shown('Zinc Fake Window 8')}`);
    confirmPicker();
  }
});
