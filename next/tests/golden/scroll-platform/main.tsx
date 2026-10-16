// Scroll physics per platform (docs/ui.md, "Scrolling"): the same scripted fingers (fling.input) on a list of 40 rows under ZINC_PLATFORM=ios
// (rubber band, 0.998/ms deceleration) and android (OverScroller's spline fling, stretch overscroll): one line per frame, the offset and the
// stretch, which tests/t1/scroll_platform.sh compares with the numbers of each platform.
import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';

function App(): i32 {
  const rows: i32[] = [];
  for (let i = 0; i < 40; i++) rows.push(i);
  return <ScrollView className="flex-1 bg-white">
    {rows.map((i: i32) => <View className="h-10 border-b border-slate-200 px-3 justify-center"><Text className="text-sm text-slate-700">{'Row ' + i}</Text></View>)}
  </ScrollView>;
}

let frame = 0, sc = -1;
ui.addWatcher((): void => {
  frame++;
  if (sc < 0) for (let i = 0; i < 20; i++) { const n = ui.inspectNode(i); if (n !== null && n.scroll !== 0) { sc = i; break; } }
  if (sc < 0) return;
  const n = ui.inspectNode(sc);
  if (n !== null) console.log(`${frame} ${Math.round(n.sy * 10) / 10} ${Math.round(ui.scrollStretch(sc) * 10) / 10}`);
});
render(App, 0xffffff, (dt: number) => {});
