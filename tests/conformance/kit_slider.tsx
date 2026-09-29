// zinc:ui/kit Slider driven by the test hooks: the value is set when the pointer moves sideways or on a tap (the press
// alone never sets it: a swipe over the rail scrolls), dragging follows the pointer (clamped past the
// ends, snapped to `step`), moves after the release change nothing, and the arrow keys step the focused slider.
import { createSignal, createNodeRef, render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';
import { Slider } from 'zinc:ui/kit';

const [level, setLevel] = createSignal<number>(40);
const holder = createNodeRef();

function App(): i32 {
  return <View class="flex-col p-4">
    <View ref={holder} class="w-[216px]">
      <Slider value={level} onChange={setLevel} step={5} />
    </View>
  </View>;
}

let frame = 0;
render(App, 0xffffff, (dt: number) => {
  frame++;
  if (frame !== 2) return;
  ui.pointerAt(0, 0, false);   // the test hooks drive the input from now on
  const b = ui.screenBox(holder.node), x0 = b[0] + 8, span = b[2] - 16, y = b[1] + 10;   // thumb centre travel
  ui.pointerAt(x0 + span * 0.25, y, true);
  console.log('press', level());
  ui.pointerAt(x0 + span * 0.62, y, true);
  console.log('drag', level());
  ui.pointerAt(x0 + span + 80, y, true);
  console.log('past the end', level());
  ui.pointerAt(x0 + span * 0.5, y, false);
  console.log('release', level());
  ui.pointerAt(x0, y, false);
  console.log('move after release', level());
  console.log('arrow right', ui.keyDown(-1, 'ArrowRight'), level());
  quit();
});
