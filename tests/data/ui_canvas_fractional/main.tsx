import { render, useState } from 'zinc:ui/react';
import { gradient, rrect, polygon } from 'zinc:gfx';
let change: (v: number) => void = (v: number): void => {};
function App(): i32 {
  const [x, setX] = useState(0); change = setX;
  return <View style={{ padding: 16 }}>
    <View style={{ width: 240, height: 210, borderRadius: 14, borderWidth: 1, borderColor: 0x334155, backgroundColor: 0xffffff, overflow: 'hidden', translateX: x }}>
      <Canvas style={{ width: 238, height: 160, lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32): void => {
        gradient(x, y, w, h, 0, 0xf97316, 0x7c3aed, true, 255);
        rrect(x + 10, y + 10, 70, 70, 35, 0xffffff, 80);
        rrect(x + 70, y + 60, 90, 90, 45, 0xffffff, 65);
        polygon([x, y + h, x + 100, y + 90, x + w, y + h], 0x111827, 80);
      }} />
      <Text style={{ fontSize: 16 }}>stable caption</Text>
    </View>
  </View>;
}
let frame = 0;
render(App, 0xe2e8f0, (dt: number): void => { frame++; change(frame * 0.125); });
