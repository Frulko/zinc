// A press on a focusable node does not scroll it into view, as in a browser: the pointer is already on it, and a drawing surface taller than its
// scroll area would jump under the finger. Focus given by the program or the keyboard does scroll.
import * as ui from 'zinc:ui';
import { render, createNodeRef } from 'zinc:ui/solid';
import { quit } from 'zinc:gfx';

const areaRef = createNodeRef(), belowRef = createNodeRef();

function App(): i32 {
  return <ScrollView className="w-full h-[200]" ref={areaRef}>
    <View className="h-[40]" />
    <Canvas className="w-full h-[400]" focusable grab="keep" onDraw={(x: i32, y: i32, w: i32, h: i32) => {}} />
    <Canvas className="w-full h-[60]" focusable ref={belowRef} onDraw={(x: i32, y: i32, w: i32, h: i32) => {}} />
  </ScrollView>;
}

function scrolled(): number {
  const area = ui.inspectNode(areaRef.node);
  return area === null ? -1 : area.sy;
}

let frame = 0;
render(App, 0, (dt: number) => {
  frame++;
  if (frame === 3) ui.pointerAt(100, 100, true);
  if (frame === 5) ui.pointerAt(100, 100, false);
  if (frame === 10) {
    console.log('after a press, scrolled', scrolled());
    ui.focusNode(belowRef.node);
  }
  if (frame === 20) {
    console.log('after focusNode, scrolled', scrolled() > 0);
    quit();
  }
});
