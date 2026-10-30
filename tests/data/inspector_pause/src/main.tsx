// The program tests/t1/inspector_pause.sh pauses from the inspector: it counts its frames and the runs of a 10 ms interval, and shows them with
// its clock (performance.now) in a Text that the probe reads through DOM.getDocument.
import 'zinc:devtools';
import { createSignal, render } from 'zinc:ui/solid';

let frames = 0, ticks = 0;
const [line, setLine] = createSignal<string>('');
setInterval(() => { ticks++; }, 10);
function App(): i32 {
  return <View className="w-full h-full p-2 bg-white">
    <Text className="text-sm">{line()}</Text>
    <View className="w-4 h-4 bg-rose-600" />
  </View>;
}
render(App, 0xffffff, (dt: number) => { frames++; setLine(`frames ${frames} ticks ${ticks} clock ${Math.round(performance.now())}`); });
