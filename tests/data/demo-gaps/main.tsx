// Gaps the demos found (ZN-1038): calls that make nodes are mounted, not printed as numbers, whatever the helper's name; a w-full max-w child of an
// items-center parent is centred; photo names of one second sort in the order they were taken.
import * as ui from 'zinc:ui';
import { render } from 'zinc:ui/solid';
function box(c: (() => i32) | undefined): i32 { return c !== undefined ? c() : <View />; }   // `{box(p.children)}`
function wrap(c: () => i32): i32 { const v = ui.createNode(ui.VIEW); ui.insert(v, c(), -1); return v; }
function Card(p: { children?: () => i32 }): i32 { return <View className="flex-col">{box(p.children)}</View>; }
class Holder { make: () => i32 = () => <Text>field</Text>; }
const held = new Holder();
function App(): i32 {
  return <View className="flex-col items-center w-full h-full">
    <View className="w-full max-w-[440px] h-[40px]"><Text>card</Text></View>
    <Card><Text>inside</Text></Card>
    {wrap(() => <Text>wrapped</Text>)}
    {held.make()}
  </View>;
}
function mounted(h: i32): boolean { for (let p = h; p >= 0; p = ui.parentOf(p)) if (p === ui.rootNode()) return true; return false; }
const shot = ['photo-2026-10-16-153012.png', 'photo-2026-10-16-153012-2.png', 'photo-2026-10-16-153011.png'];
let f = 0;
render(App, 0xffffff, (dt: number) => {
  f++;
  if (f !== 3) return;
  console.log('mounted ' + ['inside', 'wrapped', 'field'].map((s: string): string => s + '=' + (mounted(ui.find(s)) ? 'y' : 'n')).join(' '));
  console.log('card x ' + ui.screenBox(ui.parentOf(ui.find('card')))[0]);
  console.log('newest ' + shot.map((s: string) => s.slice(0, s.length - 4)).sort().reverse().join(' '));
});
