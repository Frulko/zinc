// A mouse drags a dragToScroll container (a carousel) and the drag is no click; a plain click still clicks; a container without the
// flag stays put under a mouse drag (run with ZINC_POINTER=mouse). scrollTo(..., true) eases to its offset over several frames.
import * as ui from 'zinc:ui';
import { render } from 'zinc:ui/react';
import { quit } from 'zinc:gfx';
let n = 0, clicks = 0;
function Card(props: { i: i32 }): i32 { return <View className="w-20 h-16 shrink-0 bg-indigo-200" onClick={() => { clicks++; }}><Text>{'card ' + props.i}</Text></View>; }
function Row(props: { drag: boolean; name: string }): i32 {
  const cards: i32[] = [0, 1, 2, 3, 4, 5];
  return <View className="flex-row w-full h-16 overflow-x-auto" dragToScroll={props.drag}>{cards.map((i: i32) => <Card i={i} />)}<Text>{props.name}</Text></View>;
}
function Screen(): i32 { return <View className="flex-col w-full h-full bg-white"><Row drag={true} name="carousel" /><Row drag={false} name="list" /></View>; }
function scroller(t: string): i32 { let p = ui.find(t); while (p >= 0) { const q = ui.inspectNode(p); if (q !== null && q.scroll !== 0) return p; p = ui.parentOf(p); } return -1; }
let a: i32 = -1, b: i32 = -1;
render(Screen, 0xffffff, (dt: number) => {
  n++;
  if (n === 2) { a = scroller('carousel'); b = scroller('list'); }
  if (n === 3) ui.pointerAt(200, 30, true);
  if (n >= 4 && n <= 8) ui.pointerAt(200 - (n - 3) * 20, 30, true);
  if (n === 9) ui.pointerAt(100, 30, false);
  if (n === 30) { console.log('carousel dragged', Math.round(ui.scrollLeft(a)) >= 100, 'clicks', clicks); ui.pointerAt(200, 94, true); }
  if (n >= 31 && n <= 35) ui.pointerAt(200 - (n - 30) * 20, 94, true);
  if (n === 36) ui.pointerAt(100, 94, false);
  if (n === 50) { console.log('list dragged', ui.scrollLeft(b)); ui.pointerAt(40, 94, true); }
  if (n === 51) ui.pointerAt(40, 94, false);
  if (n === 55) { console.log('a click clicks', clicks); ui.scrollTo(b, 200, 0, true); }
  if (n === 57) console.log('easing', ui.scrollLeft(b) > 0 && ui.scrollLeft(b) < 200);
  if (n === 90) { console.log('eased to', Math.round(ui.scrollLeft(b))); quit(); }
});
