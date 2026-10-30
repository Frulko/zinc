// A scroll area reaches its end (ZN-737; owner, 2026-10-12: the last cards of hero's gallery could not be brought into view on an 800x480 screen).
// The page of an app beside a fixed bar, as hero builds it: a column that grows in a row, in it a stage of screens stacked `absolute inset-0`, a scroll
// area in a screen, and in the area what wraps (the lines of a flex-wrap, a text) under a padding, with gaps and a margin under the last child. The
// screen was measured for the width offered to its stage (the whole row, 320 px: three tiles a line, two lines) and placed in what the bar leaves
// (220 px: two tiles a line, three lines): the content was measured one line shorter than it is placed, and the scroll stopped a line before the end.
// The nested area holds a box with a max-width, which was measured for the width offered and not for the one it ends with: the same defect.
// Every way to scroll must end where the last child is whole in the view, with its margin and the padding under it: a scroll from code, the wheel,
// a finger (past the end, then the spring back), the keyboard (the focus goes to the last tile, a button, and the area follows it).
import * as ui from 'zinc:ui';
import { createNodeRef, render } from 'zinc:ui/solid';

const page = createNodeRef(), last = createNodeRef(), inner = createNodeRef(), innerLast = createNodeRef();
const tiles: i32[] = [0, 1, 2, 3, 4];
function App(): i32 {
  return <View className="flex-row h-full bg-white">
    <View className="w-[100] bg-zinc-200" />
    <View className="flex-col grow">
      <View className="grow overflow-hidden"><View className="absolute inset-0 flex-col">
      <ScrollView ref={page} className="grow">
        <View className="flex-col gap-[6] p-[10]">
          <Text className="text-sm">a title long enough to take two lines beside the bar</Text>
          <ScrollView ref={inner} className="h-[50] border">
            <View className="flex-row flex-wrap gap-[4] p-[3] max-w-[150]">
              {tiles.map((i: i32) => <View className="w-[90] h-[30] bg-rose-500" />)}
              <View ref={innerLast} className="w-[90] h-[30] mb-[5] bg-rose-700" />
            </View>
          </ScrollView>
          <View className="flex-row flex-wrap gap-[10] mb-[14]">
            {tiles.map((i: i32) => <View className="w-[90] h-[60] bg-sky-500" />)}
            <Button ref={last} className="px-2 py-1 w-[90] h-[60] bg-zinc-800">end</Button>
          </View>
        </View>
      </ScrollView>
      </View></View>
    </View>
  </View>;
}
const r = (v: number): number => Math.round(v);
/** Where the scroll of `area` should end: the bottom of its last child, the child's margin and the padding under it, at the bottom of the view. */
function end(area: i32, child: i32, margin: number, pad: number): number {
  const a = ui.screenBox(area), c = ui.screenBox(child);
  return r(c[1] + c[3] + margin + pad - (a[1] + a[3]) + ui.scrollTop(area));
}
function report(way: string, area: i32, child: i32, margin: number, pad: number): void {
  const want = end(area, child, margin, pad), a = ui.screenBox(area), c = ui.screenBox(child);
  console.log(`${way}: scroll ${r(ui.scrollTop(area))} of ${want}, last child ${c[1] >= a[1] && c[1] + c[3] <= a[1] + a[3] ? 'whole' : 'cut'}`);
}
let frames = 0;
render(App, 0xffffff, (dt: number) => {
  frames++;
  const b = frames >= 2 ? ui.screenBox(page.node) : [0, 0, 0, 0];
  const x = b[0] + 110, y = b[1] + 120;
  if (frames === 2) {
    console.log(`view ${r(b[2])}x${r(b[3])}`);
    ui.scrollTo(page.node, 0, 100000);
    report('from code', page.node, last.node, 14, 10);
    ui.scrollTo(inner.node, 0, 100000);
    report('nested, from code', inner.node, innerLast.node, 5, 3 + 1);   // the padding and the 1 px border under it (ZN-882)
    ui.scrollTo(page.node, 0, 0);
    ui.scrollTo(inner.node, 0, 0);
    for (let k = 0; k < 8; k++) ui.wheelAt(x, y, -3);            // the wheel, more notches than the page is long
  }
  if (frames === 40) {
    report('wheel', page.node, last.node, 14, 10);
    ui.scrollTo(page.node, 0, 0);
  }
  if (frames >= 42 && frames < 72) {                             // a finger: three drags up of 180 px, the last one past the end
    const k = (frames - 42) % 10;
    ui.touchAt(1, x, y + 90 - k * 20, k === 0 ? 0 : 1);
    if (k === 9) { if (frames === 71) console.log(`finger held past the end: ${r(ui.scrollTop(page.node)) > end(page.node, last.node, 14, 10) ? 'stretched' : 'not stretched'}`); ui.touchAt(1, x, y - 90, 2); }
  }
  if (frames === 130) {
    report('finger', page.node, last.node, 14, 10);
    ui.scrollTo(page.node, 0, 0);
    ui.keyDown(-1, 'Tab');                                       // the focus goes to the button; the next frame brings it into view
  }
  if (frames === 132) report('keyboard', page.node, last.node, 14, 10);
});
