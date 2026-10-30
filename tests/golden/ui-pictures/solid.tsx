// Pictures inline in a Text (React Native's <Image> nested in <Text>, ZN-880): the images flow with the words, the last one wraps to the
// next line with its word, and the lines are as high as the tallest picture; a picture run of ui.setTextRuns (ui.pictureRun) does the same
// for code that builds runs. react.tsx is the same screen in the React model: tests/t1/ui_pictures.sh compares the two frames.
import * as ui from 'zinc:ui';
import { render, createNodeRef } from 'zinc:ui/solid';
import { imageFromPixels } from 'zinc:gfx';

function square(r: i32, g: i32, b: i32): i32 {
  const px: u8[] = [];
  for (let i = 0; i < 16; i++) { px.push(r); px.push(g); px.push(b); px.push(255); }
  return imageFromPixels(px, 4, 4);
}
const red = square(220, 38, 38), blue = square(37, 99, 235);
const runs = createNodeRef();
let f = 0;
render(() => <View className="w-full h-full p-2 gap-2 bg-white">
  <Text className="self-start w-[150] text-base text-slate-900">Ship it today <Image image={red} className="w-[20] h-[20]" /> then rest well <Image image={blue} className="w-[24] h-[24]" /></Text>
  <Text ref={runs} className="self-start w-[150] text-base text-slate-900">Built by the runs :done:</Text>
</View>, 0xffffff, (dt: number) => {
  f++;
  if (f === 1) ui.setTextRuns(runs.node, [18, 0, -1, 6, ui.pictureRun(22, 22), blue]);
  if (f === 3) console.log(ui.dump());
});
