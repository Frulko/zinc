// The transitions of zinc:ui classes through the compositor (ZN-364.01 #4), run by tests/t0/animated_native.sh: a card fades and slides with
// `transition duration-300` when its classes change, then is sent back half way (a retarget). With the compositor the script paints only when
// the classes change; the frames equal those of ZINC_COMPOSITOR=0, where the script paints every frame of the transition.
import * as ui from 'zinc:ui';
import { createNodeRef, createSignal, render } from 'zinc:ui/solid';

const card = createNodeRef();
const [away, setAway] = createSignal<boolean>(false);
function App(): i32 {
  return <View style={{ padding: 20 }}>
    <View ref={card} className={`w-24 h-16 p-2 rounded-lg bg-emerald-500 transition duration-300 ${away() ? 'opacity-40 translate-x-16 rotate-12' : 'opacity-100 translate-x-0 rotate-0'}`}>
      <Text className="text-white">Card</Text>
    </View>
  </View>;
}
let frames = 0;
render(App, 0xffffff, (dt: number) => {
  frames++;
  if (frames === 3) setAway(true);
  if (frames === 12) setAway(false);   // half way: back from where it is
  if (frames === 16 || frames === 40) console.log(`frame ${frames}: opacity ${Math.round(ui.getNumber(card.node, 'opacity') * 1000) / 1000}, x ${Math.round(ui.getNumber(card.node, 'translateX') * 1000) / 1000}`);
});
