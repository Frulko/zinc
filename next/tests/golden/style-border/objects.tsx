// React Native's border keys in object styles (ZN-363): borderStyle, borderTopLeftRadius / borderBottomRightRadius, borderTopColor / borderLeftColor, and a
// dynamic corner radius and side colour; the same pixels as classes.tsx.
import { createSignal, render } from 'zinc:ui/solid';
const [r, setR] = createSignal<number>(16);
const [red, setRed] = createSignal<boolean>(true);
function App(): i32 {
  return <view style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, padding: 16, backgroundColor: '#f4f1ec' }}>
    <view style={{ width: 96, height: 64, backgroundColor: 'white', borderWidth: 2, borderStyle: 'dashed', borderColor: '#3b82f6' }} />
    <view style={{ width: 96, height: 64, backgroundColor: 'white', borderWidth: 2, borderStyle: 'dotted', borderColor: '#3b82f6' }} />
    <view style={{ width: 96, height: 64, backgroundColor: '#3b82f6', borderTopLeftRadius: 12, borderBottomRightRadius: 24 }} />
    <view style={{ width: 96, height: 64, backgroundColor: 'white', borderWidth: 4, borderColor: '#3b82f6', borderTopColor: '#ef4444', borderLeftColor: '#ef4444' }} />
    <view style={{ width: 96, height: 64, backgroundColor: 'white', borderWidth: 2, borderColor: '#3b82f6', borderTopRightRadius: r(), borderBottomColor: red() ? '#ef4444' : '#3b82f6' }} />
  </view>;
}
render(App, 0xf4f1ec, null);
