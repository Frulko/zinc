import * as ui from 'zinc:ui';
import { StyleSheet } from 'zinc:ui';
import { useState, useRef, render } from 'zinc:ui/react';
import { quit } from 'zinc:gfx';
const styles = StyleSheet.create({ base: { padding: 8 }, active: { paddingLeft: 24, opacity: 0.5, translateX: 12 } });
let handle: i32 = -1;
let change: (v: boolean) => void = (v: boolean) => {};
function App(): i32 {
  const [active, setActive] = useState(true);
  change = setActive;
  const ref = useRef<i32>(-1);
  const tree = <view ref={ref} style={[styles.base, active ? styles.active : null]} />;
  handle = ref.current;
  return tree;
}
let frame = 0;
render(App, 0xffffff, (dt: number) => {
  frame++;
  const n = ui.inspectNode(handle);
  if (n === null) throw new Error('missing React node');
  if (frame === 1) {
    if (n.pl !== 24 || n.tx !== 12 || n.opacity !== 0.5) throw new Error('initial React styles');
    change(false);
  }
  if (frame === 3) {
    if (n.pl !== 8 || n.tx !== 0 || n.opacity !== 1) throw new Error('stale React styles');
    console.log('React styles OK'); quit();
  }
});
