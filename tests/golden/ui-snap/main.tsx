// Scroll snap (ZN-256): a snap-y container of 100 px pages (snap-start): a wheel notch moves to the next point, a scroll that stops between two settles on the nearest; a trackpad swipe released heads for the point its glide would reach at once, animated (no glide, then a second move).
import * as ui from 'zinc:ui';
import { render } from 'zinc:ui/react';
import { quit } from 'zinc:gfx';
let n = 0;
function Page(props: { i: i32 }): i32 { return <View className={'snap-start h-24 w-full ' + (props.i % 2 === 0 ? 'bg-indigo-200' : 'bg-pink-200')}><Text>{'page ' + props.i}</Text></View>; }
function Screen(): i32 {
  const pages: i32[] = [0, 1, 2, 3, 4, 5];
  return <View className="w-full h-full bg-white"><View className="flex-col w-full h-24 overflow-y-auto snap-y snap-mandatory">{pages.map((i: i32) => <Page i={i} />)}</View></View>;
}
function scroller(): i32 { let p = ui.parentOf(ui.find('page 0')); while (p >= 0) { const q = ui.inspectNode(p); if (q !== null && q.scroll !== 0) return p; p = ui.parentOf(p); } return -1; }
let sc: i32 = -1;
render(Screen, 0xffffff, (dt: number) => {
  n++;
  if (n === 2) sc = scroller();
  if (n === 3) ui.wheelAt(20, 20, -1);       // one notch down: the next snap point
  if (n === 40) { console.log('after a notch', ui.scrollTop(sc)); ui.wheelAt(20, 20, -1); }
  if (n === 80) { console.log('after two notches', ui.scrollTop(sc)); ui.wheelAt(20, 20, 1); }
  if (n === 120) { console.log('one notch back', ui.scrollTop(sc)); ui.scrollTo(sc, 0, 130); ui.wheelAt(20, 20, 0.0001); }
  if (n === 121) { /* scrollTo drops the axis state: the container settles from its own state on the next scroll */ }
  if (n === 160) { console.log('between points', ui.scrollTop(sc)); }
  // a trackpad swipe of 30 px, fast: on release it heads for the point its glide reaches (animated); the OS momentum after it is left out
  if (n === 161) ui.trackpadAt(20, 20, 0, 0, 3);
  if (n >= 162 && n <= 164) ui.trackpadAt(20, 20, 0, -10, 1);
  if (n === 165) ui.trackpadAt(20, 20, 0, 0, 4);
  if (n >= 166 && n <= 170) ui.trackpadAt(20, 20, 0, -30, 5);
  if (n === 166 || n === 168 || n === 172 || n === 180) console.log('on its way', Math.round(ui.scrollTop(sc)));
  if (n === 200) { console.log('after a swipe', ui.scrollTop(sc)); quit(); }
});
