// Scroll containers and virtual lists (Solid): clamped offsets, only visible rows built, hit testing through the
// scroll offset, count changes.
import { createSignal, VirtualList } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';

const [count, setCount] = createSignal<i32>(1000);
let clicked = -1;
const lines: i32[] = [];
for (let i = 0; i < 30; i++) lines.push(i);
const root = ui.createNode(ui.VIEW);
ui.insert(root, <view class="flex-col h-full p-2 gap-2">
  <scroll class="h-[60] bg-slate-800">
    {lines.map((i: i32) => <text class="text-sm">line {i}</text>)}
  </scroll>
  <VirtualList count={count()} itemHeight={20} class="grow bg-slate-900">
    {(i: i32) => <view onClick={() => { clicked = i; }}><text class="text-sm">row {i}</text></view>}
  </VirtualList>
</view>, -1);

function built(): string {
  const rows = ui.dump().split('\n').filter((l: string) => l.indexOf('"row ') >= 0).map((l: string) => l.trim());
  return `${rows.length} rows: ${rows[0]} .. ${rows[rows.length - 1]}`;
}
let f = 0, plain = -1, virt = -1;
ui.mount(root, 0x0f172a, (dt: number) => {
  f++;
  if (f === 2) {
    // rows exist after the first frame; find() returns the clickable row, whose parent is the list
    plain = ui.parentOf(ui.parentOf(ui.find('line 0')));  // text -> list fragment -> scroll
    virt = ui.parentOf(ui.find('row 0'));
    console.log('initial', built());
    ui.scrollTo(plain, 0, 100000);
    console.log('plain clamped to', ui.scrollTop(plain));
    ui.scrollTo(virt, 0, 5000);
  }
  if (f === 3) {
    console.log('after scroll', ui.scrollTop(virt), built());
    const h = ui.hitAt(40, 90);  // first visible row area, through the offset
    ui.click(h);
    console.log('clicked row', clicked);
    ui.scrollTo(virt, 0, 1000000);
  }
  if (f === 4) { console.log('bottom', ui.scrollTop(virt), built()); setCount(50); }
  if (f === 6) { console.log('count 50', ui.scrollTop(virt), built()); quit(); }
});
