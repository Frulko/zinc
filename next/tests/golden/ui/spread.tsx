// Two fingers spreading over a node that has onWheel and no onPinch (a map written for a mouse and a trackpad): the spread arrives as a
// trackpad's pinch, at the first finger. tests/t1/touch_spread.sh feeds spread.input and reads what the handler printed.
import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';

function wheel(e: ui.PointerEvent): void { console.log(`wheel ${e.wheel} pinch ${e.pinch.toFixed(3)} at ${Math.round(e.x)} ${Math.round(e.y)}`); }
function App(): i32 {
  return <View class="h-full bg-white" onWheel={wheel}><Text class="text-base text-slate-900">map</Text></View>;
}
render(App, 0xffffff, (dt: number) => {});
