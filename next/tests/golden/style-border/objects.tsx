// React Native's border keys in object styles (ZN-363): borderStyle, borderTopLeftRadius / borderBottomRightRadius, borderTopColor / borderLeftColor, and a
// dynamic corner radius and side colour; the same pixels as classes.tsx.
import { createSignal, render } from 'zinc:ui/solid';
const [r, setR] = createSignal<number>(16);
const [red, setRed] = createSignal<boolean>(true);
function App(): i32 {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, padding: 16, backgroundColor: '#f4f1ec' }}>
    <View style={{ width: 96, height: 64, backgroundColor: 'white', borderWidth: 2, borderStyle: 'dashed', borderColor: '#3b82f6' }} />
    <View style={{ width: 96, height: 64, backgroundColor: 'white', borderWidth: 2, borderStyle: 'dotted', borderColor: '#3b82f6' }} />
    <View style={{ width: 96, height: 64, backgroundColor: '#3b82f6', borderTopLeftRadius: 12, borderBottomRightRadius: 24 }} />
    <View style={{ width: 96, height: 64, backgroundColor: 'white', borderWidth: 4, borderColor: '#3b82f6', borderTopColor: '#ef4444', borderLeftColor: '#ef4444' }} />
    <View style={{ width: 96, height: 64, backgroundColor: 'white', borderWidth: 2, borderColor: '#3b82f6', borderTopRightRadius: r(), borderBottomColor: red() ? '#ef4444' : '#3b82f6' }} />
  </View>;
}
render(App, 0xf4f1ec, null);
