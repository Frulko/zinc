/** @jsxHelpers zinc:ui/kit/host */
import * as ui from 'zinc:ui';
import * as react from 'zinc:ui/react';
import { componentSignal, componentRef, componentEffect } from 'zinc:ui/kit/host';
import { equal, ok } from 'zinc:assert';
const readers: (() => i32)[] = [], writers: ((v: i32) => void)[] = [];
const rawSnapshots: i32[] = [];
let liveOwners: i32 = 0;
let renders: i32 = 0, presses: i32 = 0, frame: i32 = 0, replacement: i32 = -1, serial: i32 = 0;
function Counter(): i32 {
  renders++;
  componentEffect(() => { liveOwners++; return () => { liveOwners--; }; }, []);
  const [get, set] = componentSignal<i32>(0), [label, setLabel] = componentSignal('zero');
  const initial = componentRef<i32>(31); equal(initial.current, 31, 'following hook slot retained');
  if (readers.length === 0) { readers.push(get); writers.push(set); }
  const raw = react._active() ? react.useState<i32>(0) : null;
  return <Button onClick={() => {
    const before = get(); set(get() + 1); set(get() + 1);
    equal(get(), before + 2, 'two same-event updates read live');
    equal(readers[0](), get(), 'retained getter is live across renders');
    setLabel('updated'); equal(label(), 'updated', 'generic string getter is live');
    if (raw !== null) { const snapshot = raw[0]; raw[1](snapshot + 1); raw[1](snapshot + 1); equal(raw[0], snapshot, 'raw React snapshot unchanged'); rawSnapshots.push(snapshot); }
    presses++;
  }}><Text>{'value=' + get() + ' ' + label()}</Text></Button>;
}
function Other(): i32 { const [value, setValue] = componentSignal<i32>(42); return <Text>{'other=' + value()}</Text>; }
export function App(): i32 { const [value, setValue] = componentSignal<i32>(17); return <View><Text>{'parent=' + value()}</Text><Counter /><Other /></View>; }
export function advance(dt: number): void {
  frame++;
  if (frame === 2 || frame === 3) {
    const button = ui.find('value=' + (frame === 2 ? 0 : 4) + (frame === 2 ? ' zero' : ' updated')); ok(button >= 0, 'real counter button');
    ui.click(button); if (frame === 2) ui.click(button);
    equal(readers[0](), frame === 2 ? 4 : 6, 'separate same-frame clicks read latest writes');
  }
  if (frame === 4) {
    equal(presses, 3); equal(readers[0](), 6); equal(liveOwners, 1); ok(ui.find('parent=17') >= 0 && ui.find('other=42') >= 0, 'parent and sibling hooks isolated'); ok(ui.find('value=6 updated') >= 0, 'scheduled UI reflects live signal');
    if (rawSnapshots.length > 0) { equal(rawSnapshots.join(','), '0,0,1', 'React states remain render snapshots'); equal(renders, 3, 'same-event updates coalesce'); }
    ui.destroy(ui.rootNode()); equal(liveOwners, 0, 'owned cleanup runs once'); replacement = ui.createText('replacement'); serial = ui.nodeSerial(replacement);
    writers[0](99); equal(readers[0](), 99, 'old signal remains its own ref after unmount');
  }
  if (frame === 5) {
    equal(ui.nodeSerial(replacement), serial, 'old setter cannot affect recycled node'); equal(ui.inspectNode(replacement)!.text, 'replacement');
    ui.destroy(replacement); console.log('component signal: pass');
  }
}
