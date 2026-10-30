// The program tests/t1/inspector_screen.sh streams to the Zinc Inspector's Screen view: two boxes at known places (the pick and
// DOM.getNodeForLocation land on the inner one) and, with INSPECTOR_ANIM=1, a bar whose width changes every frame (the frame rate).
import 'zinc:devtools';
import { createSignal, render } from 'zinc:ui/solid';
import * as sys from 'zinc:sys';

const anim = sys.env('INSPECTOR_ANIM') === '1';
const [t, setT] = createSignal<i32>(0);
function App(): i32 {
  return <View className="w-full h-full bg-white">
    <View className="absolute left-[40px] top-[40px] w-[120px] h-[60px] p-2 bg-sky-600">
      <View className="w-[40px] h-[30px] bg-rose-600" />
    </View>
    <View className="absolute left-0 bottom-0 h-[10px] bg-amber-500" style={{ width: t() }} />
  </View>;
}
render(App, 0xffffff, (dt: number) => { if (anim) setT((t() + 3) % 300); });
