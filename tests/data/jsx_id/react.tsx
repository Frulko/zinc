import { useState, MutableRef, render } from 'zinc:ui/react';
import { cellId, listId, verify } from './probe';
const grid = new MutableRef<i32>(-1), cell = new MutableRef<i32>(-1), sibling = new MutableRef<i32>(-1), list = new MutableRef<i32>(-1), fixedList = new MutableRef<i32>(-1);
let setStep: (n: i32) => void = (n: i32) => {};
function App(): i32 { const [step, change] = useState<i32>(0); setStep = change; return <View ref={grid} id="grid-fixed" role="grid" aria-activedescendant={cellId(step) ?? ''}><View ref={cell} role="gridcell" id={cellId(step)} /><View ref={sibling} id="sibling-fixed" /><VirtualList ref={list} count={3} itemHeight={20} id={listId(step)}>{(i: i32) => <Text>{i}</Text>}</VirtualList><VirtualList ref={fixedList} count={1} itemHeight={20} id="fixed-list">{(i: i32) => <Text>{i}</Text>}</VirtualList></View>; }
let frame: i32 = 0;
render(App, 0xffffff, (dt: number) => { frame++; if (frame < 2 || frame > 5) return; verify(grid.current, cell.current, sibling.current, list.current, fixedList.current, frame - 2); if (frame < 5) setStep(frame - 1); });
