// React Native's shadows in object styles (ZN-360): shadowColor, shadowOffset { width, height }, shadowOpacity, shadowRadius, and elevation (2, 8, 16)
// on rounded cards; the shadow draws only when shadowOpacity > 0, as in React Native. A dynamic shadowOpacity and offset follow their signal.
import { StyleSheet } from 'zinc:ui';
import { createSignal, render } from 'zinc:ui/solid';

const s = StyleSheet.create({
  page: { flexDirection: 'row', flexWrap: 'wrap', gap: 28, padding: 28, backgroundColor: '#f4f1ec' },
  card: { width: 120, height: 90, borderRadius: 16, backgroundColor: '#ffffff' },
  ios: { shadowColor: '#1c1917', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 12 },
  coloured: { shadowColor: '#ff5a36', shadowOffset: { width: 6, height: 6 }, shadowOpacity: 0.6, shadowRadius: 4 },
  noOpacity: { shadowColor: '#000000', shadowOffset: { width: 0, height: 8 }, shadowRadius: 12 },
  e2: { elevation: 2 }, e8: { elevation: 8 }, e16: { elevation: 16 },
});
const [lift, setLift] = createSignal<number>(0.3);
function App(): i32 {
  return <view style={s.page}>
    <view style={[s.card, s.ios]} />
    <view style={[s.card, s.coloured]} />
    <view style={[s.card, s.noOpacity]} />
    <view style={[s.card, s.e2]} />
    <view style={[s.card, s.e8]} />
    <view style={[s.card, s.e16]} />
    <view style={[s.card, { shadowColor: 0x0f766e, shadowOffset: { width: 0, height: lift() * 20 }, shadowOpacity: lift(), shadowRadius: 10 }]} />
  </view>;
}
let frames = 0;
render(App, 0xf4f1ec, (dt: number) => { if (++frames === 2) setLift(0.5); });
