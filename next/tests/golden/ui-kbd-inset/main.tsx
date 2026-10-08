// The on-screen keyboard publishes env(keyboard-inset) (ZN-272): focusing a field shows the keyboard and a bar with `pb-[env(keyboard-inset)]` makes room for it.
import * as ui from 'zinc:ui';
import { render, createNodeRef } from 'zinc:ui/solid';
import { Keyboard } from 'zinc:ui/kit';
import { quit } from 'zinc:gfx';
const inputRef = createNodeRef(), barRef = createNodeRef();
function App(): i32 {
  return <View class="flex-col w-full h-full bg-white">
    <View class="grow p-2 pb-[env(keyboard-inset)] bg-slate-100" ref={barRef}>
      <Input class="h-8 border px-2 bg-white" value="" ref={inputRef} />
    </View>
    <View class="absolute bottom-0 left-0 right-0"><Keyboard layouts={['en']} /></View>
  </View>;
}
let f = 0;
render(App, 0xffffff, (dt: number) => {
  f++;
  const bar = ui.inspectNode(barRef.node);
  if (f === 3 && bar !== null) { console.log('inset before', ui.keyboardInset(), 'padding', bar.pb); ui.focusNode(inputRef.node); }
  if (f === 30 && bar !== null) { console.log('inset after', ui.keyboardInset() > 100, 'padding follows', bar.pb === ui.keyboardInset()); quit(); }
});
