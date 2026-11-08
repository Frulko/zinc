// Rows prepended to a VirtualList (history loaded above a chat): the row on screen stays where it is.
import { render, useRef, useState, MutableRef } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
let list: MutableRef<i32> | null = null;
let grow: (n: i32) => void = (n: i32): void => {};
function App() {
  const ref = useRef<i32>(-1);
  const [count, setCount] = useState<i32>(100);
  list = ref; grow = setCount;
  const shift = count - 100;   // row i shows message i - shift: the messages loaded above get the negative numbers
  return <View className="grow">
    <VirtualList ref={ref} count={count} estimatedItemHeight={40} className="h-[200]" showsVerticalScrollIndicator={false}>
      {(i: i32) => <Text className={`${(i - shift) % 2 === 0 ? 'h-[20]' : 'h-[30]'}`}>{`row ${i - shift}`}</Text>}
    </VirtualList>
  </View>;
}
const y = (name: string): number => { const h = ui.find(name); return h >= 0 ? Math.round(ui.screenBox(h)[1]) : -999; };
let frame = 0, before: number = 0;
render(App, 0xffffff, (dt: number): void => {
  frame++;
  const r = list;
  if (r === null) return;
  if (frame === 3) ui.scrollTo(r.current, 0, 500);
  if (frame === 6) { before = y('row 22'); ui.prependRows(r.current, 30); grow(130); }
  if (frame === 12) console.log('prepend ' + (before === y('row 22') && before > -999 ? 'kept' : 'moved ' + before + ' -> ' + y('row 22')));
});
