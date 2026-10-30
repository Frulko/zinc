// <VirtualList stickToBottom> (tests/t0/virtual_stick.sh): a chat's history of rows of their own heights opens at its end and follows it
// as rows come; scrolled up, it stays put, also when the list renders again (its measured heights are kept: frames 14 and 19 are equal).
import { render, useRef, useState, MutableRef } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';

let list: MutableRef<i32> | null = null;
let grow: (n: i32) => void = (n: i32): void => {};
function App() {
  const ref = useRef<i32>(-1);
  const [count, setCount] = useState<i32>(1000);
  list = ref; grow = setCount;
  return <View className="grow">
    <VirtualList ref={ref} count={count} estimatedItemHeight={40} className="h-[100]" stickToBottom showsVerticalScrollIndicator={false}>
      {(i: i32) => <Text className={`text-white ${i % 2 === 0 ? 'h-[20]' : 'h-[30]'}`}>{`row ${i}`}</Text>}
    </VirtualList>
  </View>;
}
const top = (): number => { const r = list; return r !== null ? Math.round(ui.scrollTop(r.current)) : -1; };
let frame = 0, first: number = 0, up: number = 0;
render(App, 0x000000, (dt: number): void => {
  frame++;
  if (frame === 5) { first = top(); console.log(`opened at the end: ${first >= 24000}`); grow(1010); }
  if (frame === 10) { console.log(`follows new rows: ${top() >= first + 200}`); const r = list; if (r !== null) ui.scrollTo(r.current, 0, 400); }
  if (frame === 14) { up = top(); console.log(`scrolled up stays: ${up > 0 && up < 1000}`); grow(1011); }
  if (frame === 19) console.log(`rendered again, kept: ${top() === up}`);
  if (frame === 20) quit();
});
