// React Native's transform array (ZN-361): rotate, scale, scaleX, skewX, translate, a dynamic rotate, all around the centre of the card. The hits follow
// the transformed shape: a point just above a 45° card is inside it, its old corner is not; a card scaled 1.5 is hit past its layout box.
import * as ui from 'zinc:ui';
import { StyleSheet } from 'zinc:ui';
import { createSignal, render } from 'zinc:ui/solid';
import { quit } from 'zinc:gfx';
import { env } from 'zinc:sys';

const s = StyleSheet.create({
  page: { width: 620, height: 320, backgroundColor: '#f4f1ec' },
  card: { position: 'absolute', width: 100, height: 60, borderRadius: 10, backgroundColor: '#0f766e' },
  r45: { left: 40, top: 40, transform: [{ rotate: '45deg' }] },
  big: { left: 220, top: 40, backgroundColor: '#ff5a36', transform: [{ scale: 1.5 }] },
  skew: { left: 420, top: 40, backgroundColor: '#6d28d9', transform: [{ skewX: '30deg' }, { scaleX: 1.4 }] },
  moved: { left: 40, top: 200, backgroundColor: '#1c1917', transform: [{ translateX: 20 }, { translateY: -10 }, { rotate: '0.25turn' }] },
});
const [turn, setTurn] = createSignal<number>(0);
function App(): i32 {
  return <view style={s.page}>
    <view style={[s.card, s.r45]} onPress={() => {}}><text>r45</text></view>
    <view style={[s.card, s.big]} onPress={() => {}}><text>big</text></view>
    <view style={[s.card, s.skew]} onPress={() => {}}><text>skew</text></view>
    <view style={[s.card, s.moved]} onPress={() => {}}><text>moved</text></view>
    <view style={[s.card, { left: 260, top: 200, backgroundColor: '#ca8a04', transform: [{ rotate: turn() }, { scale: 1 + turn() / 180 }] }]} onPress={() => {}}><text>dyn</text></view>
  </view>;
}
function who(x: number, y: number): string {
  const h = ui.hitAt(x, y);
  const q = h < 0 ? null : ui.inspectNode(h);
  const c = q === null ? -1 : q.children.length > 0 ? q.children[0] : -1;
  const t = c >= 0 ? ui.inspectNode(c) : null;
  return t === null ? 'none' : t.text;
}
let frames = 0;
render(App, 0xf4f1ec, (dt: number) => {
  if (++frames === 2) setTurn(90);
  if (frames === 3 && env('ZINC_HITS') === '1') {
    console.log('above r45', who(90, 30), 'r45 corner', who(42, 42), 'r45 centre', who(90, 70));
    console.log('big edge', who(200, 30), 'big outside', who(190, 70));
    console.log('skew sheared', who(395, 44), 'skew cut', who(421, 99));
    console.log('moved upright', who(110, 175), 'moved old corner', who(62, 192));
    console.log('dyn upright', who(310, 160), 'dyn old corner', who(262, 202));
    quit();
  }
});
