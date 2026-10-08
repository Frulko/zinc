// PanResponder and Animated.event (ZN-366). A card follows a scripted drag through Animated.event([null, { dx, dy }]) and, released, keeps going on a
// decay with the release velocity until it stops. A ScrollView's onScroll={Animated.event([{ nativeEvent: { contentOffset: { y } } }])} fades a header:
// the program has no code of its own per frame.
import * as ui from 'zinc:ui';
import { PanResponder, StyleSheet } from 'zinc:ui';
import * as Animated from 'zinc:ui/animated';
import { createNodeRef, render, For } from 'zinc:ui/solid';
import { quit } from 'zinc:gfx';

const pan = new Animated.ValueXY();
const responder = PanResponder.create({
  onStartShouldSetPanResponder: (e: ui.ResponderEvent, g: ui.GestureState): boolean => true,
  onPanResponderGrant: (e: ui.ResponderEvent, g: ui.GestureState): void => { pan.stopAnimation(); pan.extractOffset(); console.log(`grant at ${g.x0},${g.y0}`); },
  onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }]),
  onPanResponderRelease: (e: ui.ResponderEvent, g: ui.GestureState): void => {
    console.log(`release dx ${g.dx} dy ${g.dy} vx ${g.vx.toFixed(3)} vy ${g.vy.toFixed(3)}`);
    pan.flattenOffset();
    Animated.decay(pan.x, { velocity: g.vx, deceleration: 0.99 }).start((done: boolean): void => { console.log(`decay done ${done} at x ${Math.round(pan.x.get())}`); });
    Animated.decay(pan.y, { velocity: g.vy, deceleration: 0.99 }).start();
  },
});
const scrollY = new Animated.Value(0);
const fade = scrollY.interpolate({ inputRange: [0, 80], outputRange: [1, 0], extrapolate: 'clamp' });
const s = StyleSheet.create({
  page: { flexDirection: 'row', width: 480, height: 300, backgroundColor: '#f4f1ec' },
  stage: { width: 300, height: 300 },
  card: { position: 'absolute', left: 20, top: 20, width: 80, height: 60, borderRadius: 10, backgroundColor: '#0f766e' },
  side: { width: 180, height: 300 },
  header: { height: 40, backgroundColor: '#ff5a36' },
  list: { height: 260 },
  row: { height: 40, borderBottomWidth: 1, borderColor: '#d6d3d1' },
});
const card = createNodeRef(), header = createNodeRef(), list = createNodeRef();
const rows: i32[] = [];
for (let i = 0; i < 20; i++) rows.push(i);
function App(): i32 {
  return <view style={s.page}>
    <view style={s.stage}>
      <view ref={card} {...responder.panHandlers} style={[s.card, { transform: [{ translateX: pan.x.get() }, { translateY: pan.y.get() }] }]} />
    </view>
    <view style={s.side}>
      <view ref={header} style={[s.header, { opacity: fade.get() }]} />
      <view ref={list} style={[s.list, { overflow: 'scroll' }]} onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}>
        <For each={rows}>{(r: i32, i: i32) => <view style={s.row}><text>{`row ${r}`}</text></view>}</For>
      </view>
    </view>
  </view>;
}
let f = 0;
const x = (): number => Math.round(ui.screenBox(card.node)[0]);
const op = (): string => { const n = ui.inspectNode(header.node); return n === null ? '?' : n.opacity.toFixed(2); };
render(App, 0xf4f1ec, (dt: number) => {
  f++;
  if (f === 2) ui.pointerAt(60, 50, true);
  if (f >= 3 && f <= 8) ui.pointerAt(60 + (f - 2) * 15, 50 + (f - 2) * 5, true);   // 15 px right and 5 down per frame
  if (f === 8) console.log(`dragged: x ${x()}`);
  if (f === 9) ui.pointerAt(150, 80, false);
  if (f === 12 || f === 20 || f === 40) console.log(`frame ${f}: x ${x()}`);
  if (f === 50) { console.log(`header ${op()}`); ui.scrollTo(list.node, 0, 40); }
  if (f === 52) { console.log(`scrolled 40: header ${op()}`); ui.scrollTo(list.node, 0, 120); }
  if (f === 54) { console.log(`scrolled 120: header ${op()}`); quit(); }
});
