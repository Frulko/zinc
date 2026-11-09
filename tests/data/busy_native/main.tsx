// tests/t1/busy_native.sh: Animated's native driver (ZN-364.01) keeps a view moving while the program's own thread is blocked. A box bound to a
// value slides for 3 s with useNativeDriver: true; at frame 30 the program busy-waits 1 s. The compositor presents the box moved on meanwhile
// (the profiler's present_interval stays near a frame), where a program-driven animation would freeze for the whole second.
import { render, createNodeRef } from 'zinc:ui/solid';
import * as A from 'zinc:ui/animated';
import { env } from 'zinc:sys';

const box = createNodeRef();
const x = new A.Value(0);
let frames = 0;
function busy(ms: number): void {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {}
}
function App(): i32 {
  return <View className="h-full bg-white p-4"><View ref={box} className="w-16 h-16 bg-blue-600 rounded-lg" /></View>;
}
render(App, 0xffffff, (dt: number) => {
  frames++;
  if (frames === 2) {
    A.attach(box.node, 'translateX', x);
    A.timing(x, { toValue: 240, duration: 3000, easing: A.Easing.linear, useNativeDriver: env('BUSY_SCRIPT') !== '1' }).start();
  }
  if (frames === 30) { busy(1000); console.log('busy done'); }
});
