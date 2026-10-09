// ZN-608: a zinc:ui app follows its window without asking for it (mount registers onResize): after the window grows, so does its surface.
import { render } from 'zinc:ui/solid';
import { addStepper } from 'zinc:ui';
import { width, height } from 'zinc:gfx';
import * as system from 'zinc:system';
import * as window from 'zinc:system/window';

function App(): i32 { return <view class="w-full h-full bg-slate-900"><text class="text-white">resize me</text></view>; }
render(App, 0x0f172a, null);
let frame = 0;
addStepper((): void => {
  frame++;
  if (frame === 3) window.setSize(640, 360);
  if (frame === 12) { console.log('surface', width(), height()); system.quit(0); }
});
