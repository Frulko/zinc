// A VirtualList whose rows are components (each comes as a fragment around its node): scrolled, the rows in view are placed where they
// belong, with their side margins, and a row whose component renders again keeps its place.
import * as ui from 'zinc:ui';
import { render, createSignal, VirtualList } from 'zinc:ui/solid';
import { quit } from 'zinc:gfx';
const [mark, setMark] = createSignal<i32>(-1);
function Row(props: { i: i32; on: boolean }): i32 {
  return <View className={'flex-col mx-3 h-[48] ' + (props.on ? 'bg-pink-200' : 'bg-indigo-100')}><Text>{'row ' + props.i}</Text></View>;
}
function App(): i32 {
  return <View className="flex-col w-full h-full bg-white">
    <VirtualList count={300} itemHeight={48} className="grow min-h-0">{(i: i32) => <Row i={i} on={mark() === i} />}</VirtualList>
  </View>;
}
function box(t: string): string { const h = ui.find(t); if (h < 0) return t + ' missing'; const b = ui.screenBox(h); return `${t} at x=${Math.round(b[0])} y=${Math.round(b[1])} w=${Math.round(b[2])}`; }
let n = 0;
render(App, 0xffffff, (dt: number) => {
  n++;
  if (n === 3) { console.log(box('row 0')); ui.wheelAt(50, 50, -10); ui.wheelAt(50, 50, -10); }
  if (n === 40) { console.log(box('row 20')); setMark(21); }
  if (n === 44) { console.log(box('row 21')); quit(); }
});
