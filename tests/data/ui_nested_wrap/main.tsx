import { render, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
const outer = createNodeRef(), row = createNodeRef(), middle = createNodeRef(), last = createNodeRef();
let f = 0;
render(() => <View ref={outer} className="flex-row flex-wrap gap-[21px] p-6">
 <View className="grow basis-[300px] min-w-0 h-[100px] bg-red-500" />
 <View ref={middle} className="flex-col grow-[1.25] basis-[380px] min-w-0 gap-[21px]">
  <View ref={row} className="flex-row flex-wrap gap-[21px]">
   <View className="grow basis-[190px] min-w-0 h-[100px] bg-blue-500" />
   <View className="grow basis-[190px] min-w-0 h-[100px] bg-blue-500" />
  </View>
  <View className="h-[100px] bg-amber-500" />
 </View>
 <View ref={last} className="grow basis-[300px] min-w-0 h-[100px] bg-green-500" />
</View>, 0xffffff, (dt: number) => {
  f++;
  if (f !== 2) return;
  for (const width of [360, 768, 1024, 1440, 768]) {
    ui.setNumber(outer.node, 'width', width);
    const b = ui.screenBox(middle.node), c = ui.screenBox(last.node), r = ui.screenBox(row.node);
    const expected = width <= 768 ? 342 : 221;
    if (b[3] !== expected || r[3] !== expected - 121) throw new Error('wrapped height at ' + width + ': ' + b.join(','));
    if (width < 1440 && c[1] - b[1] - b[3] !== 21) throw new Error('outer line overlap at ' + width);
    if (width === 1440 && c[1] !== b[1]) throw new Error('wide row wrapped');
    console.log('wrap ' + width + ': ' + b[3]);
  }
  ui.setNumber(outer.node, 'width', 1024);
  ui.setNumber(middle.node, 'maxWidth', 380);
  let b = ui.screenBox(middle.node), c = ui.screenBox(last.node);
  if (b[2] !== 380 || b[3] !== 342 || c[1] - b[1] - b[3] !== 21) throw new Error('max-width cross size');
  ui.setNumber(middle.node, 'maxWidth', -1);
  ui.setNumber(outer.node, 'width', 768);
  ui.setNumber(row.node, 'gap', 10);
  b = ui.screenBox(middle.node); c = ui.screenBox(last.node);
  if (b[3] !== 221 || c[1] - b[1] - b[3] !== 21) throw new Error('changed gap cross size');
  console.log('nested wrap ok');
});
