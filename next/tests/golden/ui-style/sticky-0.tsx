// position: sticky (ZN-255): a header held at the top of a scroll container scrolled by 0 px; the list rows move, the header stays (and is held inside its parent at the end).
import * as ui from 'zinc:ui';
import { render } from 'zinc:ui/react';
import { quit } from 'zinc:gfx';
let n = 0;
function Row(props: { i: i32 }): i32 { return <View class={'h-8 w-full ' + (props.i % 2 === 0 ? 'bg-white' : 'bg-slate-200')}><Text class="text-sm">{'row ' + props.i}</Text></View>; }
function Screen(): i32 {
  const rows: i32[] = [];
  for (let i: i32 = 0; i < 12; i++) rows.push(i);
  return <View class="flex-col w-full h-full bg-slate-100">
    <View class="flex-col w-full h-full overflow-y-auto">
      <View class="flex-col w-full">
        <View class="sticky top-0 w-full h-8 bg-indigo-600"><Text class="text-sm text-white">sticky header</Text></View>
        {rows.map((i: i32) => <Row i={i} />)}
      </View>
    </View>
  </View>;
}
render(Screen, 0xffffff, (dt: number) => {
  n++;
  if (n === 2) { let p = ui.parentOf(ui.find('row 0')); while (p >= 0) { const q = ui.inspectNode(p); if (q !== null && q.scroll !== 0) ui.scrollTo(p, 0, 0); p = ui.parentOf(p); } }
  if (n >= 4) quit();
});
