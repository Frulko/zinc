// The kit's Tooltip (ZN-922): it shows after its delay when the pointer rests on its child, and a press hides it (a button that opens a popover
// keeps it away); when the keyboard puts the focus on its child (Tab) it shows at once, and goes when the focus leaves.
import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';
import { Tooltip } from 'zinc:ui/kit';

function App(): i32 {
  return <View className="flex-row p-4 gap-3">
    <Tooltip label="Save as" delay={50}><View className="w-[40] h-[40] bg-[#3355aa]" onPress={() => console.log('first pressed')} aria-label="First" /></Tooltip>
    <Tooltip label="Open it" delay={50}><View className="w-[40] h-[40] bg-[#aa5533]" onPress={() => console.log('second pressed')} aria-label="Second" /></Tooltip>
  </View>;
}
/** Whether the hint with this text is on screen: the text node and the nodes above it are not hidden. */
function shown(label: string): boolean {
  let h = ui.find(label);
  if (h < 0) return false;
  for (; h >= 0; h = ui.parentOf(h)) { const n = ui.inspectNode(h); if (n !== null && n.hidden) return false; }
  return true;
}
const log = (s: string): void => { console.log(s); };
const steps: (() => void)[] = [];
let frame = 0;
render(App, 0xffffff, (dt: number) => {
  frame++;
  if (frame >= 2 && frame - 2 < steps.length) steps[frame - 2](); else if (frame >= 2) quit();
});
const box = (label: string): number[] => ui.screenBox(ui.find(label));
const both = (): string => `Save as ${shown('Save as')}, Open it ${shown('Open it')}`;
steps.push(() => { log(`start: ${both()}`); ui.pointerAt(21, 21, false); });
for (let i = 0; i < 6; i++) steps.push(() => {});
steps.push(() => { log(`pointer rests on the first: ${both()}`); ui.pointerAt(21, 21, true); });
steps.push(() => { log(`pressed: ${both()}`); ui.pointerAt(21, 21, false); ui.pointerAt(300, 150, false); });
steps.push(() => { log(`pointer gone: ${both()}`); ui.keyDown(-1, 'Tab'); });
steps.push(() => { log(`Tab 1: ${both()}`); ui.keyDown(-1, 'Tab'); });
steps.push(() => { log(`Tab 2: ${both()}`); const b = box('Open it'); log(`hint inside the window ${b[0] >= 0 && b[1] >= 0 && b[0] + b[2] <= 400}`); ui.keyDown(-1, 'Tab'); });
steps.push(() => { log(`Tab 3 (around again): ${both()}`); });
