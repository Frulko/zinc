import { createSignal, createNodeRef, render } from 'zinc:ui/solid';
import { cellId, listId, verify } from './probe';
const grid = createNodeRef(), cell = createNodeRef(), sibling = createNodeRef(), list = createNodeRef(), fixedList = createNodeRef();
const [step, setStep] = createSignal<i32>(0);
function App(): i32 { return <View ref={grid} id="grid-fixed" role="grid" aria-activedescendant={cellId(step()) ?? ''}><View ref={cell} role="gridcell" id={cellId(step())} /><View ref={sibling} id="sibling-fixed" /><VirtualList ref={list} count={3} itemHeight={20} id={listId(step())}>{(i: i32) => <Text>{i}</Text>}</VirtualList><VirtualList ref={fixedList} count={1} itemHeight={20} id="fixed-list">{(i: i32) => <Text>{i}</Text>}</VirtualList></View>; }
let frame: i32 = 0;
render(App, 0xffffff, (dt: number) => { frame++; if (frame < 2 || frame > 5) return; verify(grid.node, cell.node, sibling.node, list.node, fixedList.node, frame - 2); if (frame < 5) setStep(frame - 1); });
