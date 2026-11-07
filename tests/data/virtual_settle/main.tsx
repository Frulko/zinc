// A finger scroll up through rows of a variable VirtualList that were never measured (tests/t0/virtual_settle.sh): each row that comes in
// above the view is measured and the offset follows it, also in the running gesture, so what is shown moves by the finger's delta, no more.
import { render, useRef, MutableRef } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';

let list: MutableRef<i32> | null = null;
function App() {
  const ref = useRef<i32>(-1);
  list = ref;
  return <View className="grow">
    <VirtualList ref={ref} count={1000} estimatedItemHeight={40} className="grow" showsVerticalScrollIndicator={false}>
      {(i: i32) => <Text className={`text-white ${i % 3 === 0 ? 'h-[20]' : i % 3 === 1 ? 'h-[30]' : 'h-[55]'}`}>{`row ${i}`}</Text>}
    </VirtualList>
  </View>;
}
// where row r is on screen (its offset in the list less the list's scroll), -1e9 while it is not built
function shown(h: i32, r: i32): number {
  const n = ui.inspectNode(h);
  if (n === null || n.virt === null) return -1e9;
  const row = (n.virt as ui.Virtual).rows.get(r);
  if (row === undefined) return -1e9;
  const rn = ui.inspectNode(row);
  return rn === null ? -1e9 : rn.y - ui.scrollTop(h);
}
let frame = 0, prev: number = 0, moves: number[] = [];
render(App, 0x000000, (dt: number): void => {
  frame++;
  const r = list;
  if (r === null || r.current < 0) return;
  if (frame === 3) ui.scrollTo(r.current, 0, 20000);   // row 500 by the estimate: nothing above it measured
  const y = shown(r.current, 502);
  if (frame >= 12 && frame <= 40) moves.push(Math.round(y - prev));
  prev = y;
  if (frame === 41) {
    console.log(`row followed: ${y > -1e9}`);
    console.log(`moves by the finger only: ${moves.every((m: number): boolean => m === 4) ? 'true' : moves.join(' ')}`);
    quit();
  }
});
