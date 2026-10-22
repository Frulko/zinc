// Keyboard modes (ZN-227): 'touch' shows the keyboard on a focused field only after a touch, 'never' never, the default always; zinc.json "keyboard" sets the default (ZINC_KEYBOARD).
import * as ui from 'zinc:ui';
import { render, createNodeRef } from 'zinc:ui/solid';
import { Keyboard } from 'zinc:ui/kit';
import { quit } from 'zinc:gfx';
const a = createNodeRef();
function App(): i32 {
  return <View className="flex-col w-full h-full bg-white"><Input className="bg-slate-800 border-slate-600 rounded-md text-[14px] py-1.5 text-slate-100 h-8 border px-2" value="" ref={a} /><View className="absolute bottom-0 left-0 right-0"><Keyboard layouts={['en']} mode="touch" /></View></View>;
}
let f = 0;
render(App, 0xffffff, (dt: number) => {
  f++;
  if (f === 3) { ui.pointerAt(10, 10, false); ui.focusNode(a.node); }
  if (f === 20) { console.log('mouse: keyboard inset', ui.keyboardInset()); ui.focusNode(-1); }
  if (f === 24) { ui.touchAt(1, 10, 10, 0); ui.touchAt(1, 10, 10, 2); ui.focusNode(a.node); }
  if (f === 50) { console.log('touch: keyboard inset above 100', ui.keyboardInset() > 100, 'coarse', ui.pointerIsCoarse()); quit(); }
});
