// kit_progress_ring fixture: four rings at 0, 25, 60 and 100 %, and a fifth that follows a signal (10 %, then 80 % after 150 ms): the
// lazy canvas paints the new value although nothing else changed.
import { render, createSignal } from 'zinc:ui/solid';
import { ProgressRing } from 'zinc:ui/kit';

const [live, setLive] = createSignal<number>(10);
const RED = 0xfa2d48, TRACK = 0xdedee3;
function App(): i32 {
  return <View className="flex-row items-center gap-3 p-3 w-full h-full bg-white">
    <ProgressRing value={() => 0} size={28} color={() => RED} track={() => TRACK} />
    <ProgressRing value={() => 25} size={28} color={() => RED} track={() => TRACK} />
    <ProgressRing value={() => 60} size={28} color={() => RED} track={() => TRACK} />
    <ProgressRing value={() => 100} size={28} color={() => RED} track={() => TRACK} />
    <ProgressRing value={live} size={28} color={() => 0x007aff} track={() => TRACK} strokeWidth={4} />
  </View>;
}
render(App, 0xffffff, null);
setTimeout(() => { setLive(80); }, 150);
