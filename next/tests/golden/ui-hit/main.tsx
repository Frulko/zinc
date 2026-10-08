// Hit test follows z order, visibility and pointer-events (ZN-255): three overlapping boxes, points through the overlaps.
import * as ui from 'zinc:ui';
import { render } from 'zinc:ui/react';
import { quit } from 'zinc:gfx';
let n = 0;
function Screen(): i32 {
  return <View class="relative w-full h-full bg-white">
    <View onPress={() => {}} class="absolute left-0 top-0 w-24 h-24 bg-red-500 z-10"><Text>red</Text></View>
    <View onPress={() => {}} class="absolute left-12 top-12 w-24 h-24 bg-green-500"><Text>green</Text></View>
    <View onPress={() => {}} class="absolute left-24 top-0 w-24 h-24 bg-blue-500 z-20 pointer-events-none"><Text>blue</Text></View>
    <View onPress={() => {}} class="absolute left-0 top-24 w-24 h-12 bg-yellow-500 invisible"><Text>yellow</Text></View>
  </View>;
}
function who(x: number, y: number): string {
  const h = ui.hitAt(x, y);
  if (h < 0) return 'none';
  const q = ui.inspectNode(h);
  const c = q === null ? -1 : q.children.length > 0 ? q.children[0] : -1;
  const t = c >= 0 ? ui.inspectNode(c) : null;
  return t === null ? '?' : t.text;
}
render(Screen, 0xffffff, (dt: number) => {
  n++;
  if (n === 2) {
    // red (z 10) over green where they overlap; blue (z 20) is not hit at all (pointer-events-none): the point falls through to what lies below it
    console.log('red only', who(10, 10), 'red over green', who(60, 60), 'green only', who(110, 110), 'blue area', who(110, 10), 'blue over green', who(100, 60), 'invisible', who(10, 100), 'outside', who(230, 150));
    quit();
  }
});
