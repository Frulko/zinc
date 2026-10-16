// NativeView (ZN-749, tests/t0/ui_native_view.sh): what the host of a native view is told, frame by frame. A 200x300 surface: a 40 px header,
// then a scroll area holding 60 px of text, the native view (200 px high, 16 px margins) and more text. The script scrolls it (the view moves
// up and is clipped by the scroll area's top edge at y 40), opens a menu layer over part of it and a dialog with a scrim (hidden), closes them,
// hides the view's parent, shows it, then unmounts it. Each line is a place() call: box, clip, shown; nothing is told while nothing changed.
import { render, createSignal, Show, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { NativeView } from 'zinc:ui';
import { quit } from 'zinc:gfx';

class Probe {
  calls: i32 = 0;
  place(x: number, y: number, w: number, h: number, cx: number, cy: number, cw: number, ch: number, shown: boolean): void {
    this.calls++;
    console.log(`  place ${x} ${y} ${w}x${h} clip ${cx} ${cy} ${cw}x${ch} ${shown ? 'shown' : 'hidden'}`);
  }
}
const probe = new Probe();
const [mounted, setMounted] = createSignal<boolean>(true);
const [hid, setHid] = createSignal<boolean>(false);
const scroller = createNodeRef();
const menu = ui.createNode(ui.VIEW);
ui.setClass(menu, 'absolute left-0 top-[150px] w-[60px] h-[40px] bg-white');
const dialog = ui.createNode(ui.VIEW);
ui.setClass(dialog, 'absolute left-[150px] top-0 w-[40px] h-[40px] bg-white');

function App(): i32 {
  return <View className="flex-col w-full h-full">
    <View className="h-[40px] bg-slate-800"></View>
    <ScrollView ref={scroller} className="grow bg-slate-950">
      <View className="h-[60px]"></View>
      <View className={hid() ? 'hidden' : 'flex-col'}>
        <Show when={mounted()}>
          <NativeView className="h-[200px] mx-4" view={probe} />
        </Show>
      </View>
      <View className="h-[400px]"></View>
    </ScrollView>
  </View>;
}

let frame = 0;
function step(name: string, f: () => void): void { console.log(`frame ${frame}: ${name}`); f(); }
render(App, 0x000000, (_dt: number) => {
  frame++;
  if (frame === 1) console.log(`frame 1: mounted, ${probe.calls} call`);
  if (frame === 3) step('scroll 50', () => { ui.scrollTo(scroller.node, 0, 50); });
  if (frame === 5) step('scroll 150 (the view goes under the header)', () => { ui.scrollTo(scroller.node, 0, 150); });
  if (frame === 7) step('scroll back to 0', () => { ui.scrollTo(scroller.node, 0, 0); });
  if (frame === 9) step('a menu over the view', () => { ui.openLayer(menu, { priority: 100 }); });
  if (frame === 11) step('the menu closes', () => { ui.closeLayer(menu); ui.setClass(menu, 'hidden'); });
  if (frame === 13) step('a dialog away from the view, with a scrim', () => { ui.openLayer(dialog, { priority: 200, modal: true, backdrop: 0, motion: 'none' }); });
  if (frame === 15) step('the dialog closes', () => { ui.closeLayer(dialog); ui.setClass(dialog, 'hidden'); });
  if (frame === 17) step('its parent hidden', () => { setHid(true); });
  if (frame === 19) step('its parent shown', () => { setHid(false); });
  if (frame === 21) step('unmounted', () => { setMounted(false); });
  if (frame === 24) { console.log(`done: ${probe.calls} calls, ${ui.nativeViewUpdates()} updates`); quit(); }
});
