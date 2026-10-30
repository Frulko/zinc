// The screen of solid.tsx in the React model (zinc:ui/react): the same frame (tests/t1/ui_pictures.sh).
import * as ui from 'zinc:ui';
import { render, useRef, useEffect } from 'zinc:ui/react';
import { imageFromPixels } from 'zinc:gfx';

function square(r: i32, g: i32, b: i32): i32 {
  const px: u8[] = [];
  for (let i = 0; i < 16; i++) { px.push(r); px.push(g); px.push(b); px.push(255); }
  return imageFromPixels(px, 4, 4);
}
const red = square(220, 38, 38), blue = square(37, 99, 235);
function App() {
  const runs = useRef<i32>(-1);
  useEffect((): void => { ui.setTextRuns(runs.current, [18, 0, -1, 6, ui.pictureRun(22, 22), blue]); }, []);
  return <View className="w-full h-full p-2 gap-2 bg-white">
    <Text className="self-start w-[150] text-base text-slate-900">Ship it today <Image image={red} className="w-[20] h-[20]" /> then rest well <Image image={blue} className="w-[24] h-[24]" /></Text>
    <Text ref={runs} className="self-start w-[150] text-base text-slate-900">Built by the runs :done:</Text>
  </View>;
}
render(() => <App />, 0xffffff, null);
