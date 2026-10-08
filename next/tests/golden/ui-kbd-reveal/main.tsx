// The keyboard never hides the focused field (ZN-227): a long form in a scroll area with room for the keyboard (pb-[env(keyboard-inset)]); focusing the last field scrolls it above the keyboard.
import * as ui from 'zinc:ui';
import { render, createNodeRef } from 'zinc:ui/solid';
import { Keyboard } from 'zinc:ui/kit';
import { height } from 'zinc:gfx';
const lastRef = createNodeRef(), listRef = createNodeRef();
function Field(props: { n: i32 }): i32 { return <Input class="h-10 border px-2 bg-white shrink-0" value={`field ${props.n}`} />; }
function App(): i32 {
  return <View class="flex-col w-full h-full bg-slate-100">
    <ScrollView class="grow flex-col gap-2 p-2 pb-[env(keyboard-inset)]" ref={listRef}>
      <Field n={1} /><Field n={2} /><Field n={3} /><Field n={4} /><Field n={5} /><Field n={6} /><Field n={7} /><Field n={8} />
      <Input class="h-10 border px-2 bg-white shrink-0" value="last field" ref={lastRef} />
    </ScrollView>
    <View class="absolute bottom-0 left-0 right-0"><Keyboard layouts={['en']} /></View>
  </View>;
}
let f = 0;
render(App, 0xffffff, (dt: number) => {
  f++;
  if (f === 3) { ui.focusNode(lastRef.node); }
  if (f === 40) {
    const n = ui.inspectNode(lastRef.node), sc = ui.inspectNode(listRef.node);
    if (n !== null && sc !== null) {
      const top = n.y - sc.sy, bottom = top + n.lh;   // on the surface (the scroll area starts at 0)
      console.log('last field above the keyboard', bottom <= height() - ui.keyboardInset() + 0.5, 'keyboard', ui.keyboardInset() > 100, 'scrolled', sc.sy > 0);
    }
    quitNow();
  }
});
import { quit } from 'zinc:gfx';
function quitNow(): void { quit(); }
