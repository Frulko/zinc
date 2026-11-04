// The compositor (D182 step 6): a rotate declared with animate() is painted once into a layer, then turned at each present by the engine,
// not repainted by the script. tests/t1/compositor.sh runs it with ZINC_COMPOSITOR=0 (the script tweens and repaints) and with it on: the
// same frames, bit for bit (boxes and text), the same hit tests on the turned bar, and the finite animation ends on the same frame.
import * as ui from 'zinc:ui';
import { createNodeRef, render, animate } from 'zinc:ui/solid';

const bar = createNodeRef(), card = createNodeRef();
function App(): i32 {
  return <View style={{ flexDirection: 'row', gap: 40, padding: 60 }}>
    <View ref={bar} className="w-40 h-6 bg-blue-500 rounded-md" />
    <View ref={card} className="w-24 h-16 p-2 bg-amber-100 border-2 border-amber-700 rounded-lg">
      <Text className="text-sm text-amber-900">Turn</Text>
    </View>
  </View>;
}
let frames = 0;
render(App, 0xffffff, (dt: number) => {
  frames++;
  if (frames === 3) {
    animate(bar, 'rotate', 360, { dur: 800, easing: 'linear', iterations: Infinity });
    animate(card, 'rotate', -30, { dur: 500, easing: 'inOut', delay: 100 }).then(() => { console.log('card done at frame ' + frames); });
  }
  if (frames % 4 === 0 && frames <= 40) {   // a point 60 px above the bar's centre is on it only while it stands near upright
    const q = ui.screenBox(bar.node);
    const cx = q[0] + q[2] / 2, cy = q[1] + q[3] / 2;
    console.log('frame ' + frames + ': ' + (ui.nodeAt(cx, cy - 60) === bar.node ? 'bar' : 'miss'));
  }
});
