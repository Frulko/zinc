// zinc:react-native's NativeView (ZN-749, tests/t0/ui_native_view.sh): React Native styles place the box the host is told.
import { render } from 'zinc:ui/react';
import { View, NativeView } from 'zinc:react-native';
import { quit } from 'zinc:gfx';
class P { place(x: number, y: number, w: number, h: number, cx: number, cy: number, cw: number, ch: number, shown: boolean): void { console.log(`place ${x} ${y} ${w}x${h} ${shown}`); } }
const p = new P();
function App() {
  return <View style={{ flex: 1, paddingTop: 30 }}><NativeView style={{ height: 100, marginHorizontal: 10 }} view={p} /></View>;
}
let f = 0;
render(App, 0, (_dt: number) => { f++; if (f === 3) quit(); });
