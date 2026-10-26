// rmpp_sim fixture: an app that writes for a moment (setPenMode of zinc:remarkable, as InkPalette does when unfolded), then reads again.
import { render } from 'zinc:ui/solid';
import { setPenMode } from 'zinc:remarkable';
import { env } from 'zinc:sys';
function App(): i32 { return <View className="flex-col h-full bg-white"><Text className="text-[40px] text-black">Pen mode</Text></View>; }
render(App, 0xffffff, null);
if (env('PENMODE_STILL') === '') {   // PENMODE_STILL=1: the app never asks (the pinch test)
  setTimeout(() => { setPenMode(true); }, 1500);
  setTimeout(() => { setPenMode(false); }, 1800);   // inside qtfb's second after the first switch: the driver makes it when it may
}
