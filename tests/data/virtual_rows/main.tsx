// A virtual list whose rows are components (tests/t0/virtual_rows.sh): scrolled over 2,000 rows and back, then rendered again, it keeps
// the instances of the rows it shows only: a row that scrolls out is unmounted (componentWillUnmount runs), as a list rendered again
// unmounts the rows it made before. A list whose component is replaced (another key) goes with its rows (they unmount too) and with its
// onScroll handler (the handle of a new node must not call it).
import { render, useRef, useState, useEffect, MutableRef, Component } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';

let mounted = 0, made = 0;
class Row extends Component<{ i: i32 }, i32> {
  constructor(props: { i: i32 }) { super(props); this.state = 0; made++; }
  componentDidMount(): void { mounted++; }
  componentWillUnmount(): void { mounted--; }
  render(): i32 { return <View className="h-[24]"><Text className="text-white">{`row ${this.props.i}`}</Text></View>; }
}
let list: MutableRef<i32> | null = null;
let again: (n: i32) => void = (n: i32): void => {};
let swap: (n: i32) => void = (n: i32): void => {};
let oldScrolls = 0;
let seen = '';   // onScroll's content, view and offset (at the end on frame 205)
function Rows(p: { v: i32, k: i32 }) {
  const ref = useRef<i32>(-1);
  list = ref;
  useEffect((): void => { const k = p.k; ui.onScroll(ref.current, (e: ui.ResponderEvent, g: ui.GestureState): void => { if (k === 1 && frame > 416) oldScrolls++; if (k === 0) { const n = e.nativeEvent; seen = `${n.contentSize.height} ${n.layoutMeasurement.height} ${n.contentOffset.y}`; } }); }, []);
  return <VirtualList ref={ref} count={2000} itemHeight={24} className="h-[120]">{(i: i32) => <Row i={i + p.v * 0} />}</VirtualList>;
}
function App() {
  const [v, setV] = useState<i32>(0);
  const [k, setK] = useState<i32>(0);
  again = setV; swap = setK;
  return <View className="grow">{k >= 0 ? <Rows key={`list${k}`} v={v} k={k} /> : null}</View>;
}
let frame = 0, rows = 0;
render(App, 0x000000, (dt: number): void => {
  frame++;
  const r = list;
  if (r === null) return;
  if (frame === 5) rows = mounted;
  if (frame > 5 && frame <= 205) ui.scrollTo(r.current, 0, (frame - 5) * 240);            // down over the 2,000 rows
  if (frame > 205 && frame <= 405) ui.scrollTo(r.current, 0, (405 - frame) * 240);         // and back up
  if (frame === 206) console.log(`onScroll's content, view and offset at the end: ${seen}`);
  if (frame === 406) again(1);                                                           // rendered again: the rows are made again
  if (frame === 410) {
    console.log(`rows mounted as at the start: ${mounted === rows && rows > 0}`);
    console.log(`rows made over the scroll: ${made > 1000}`);
    swap(1);                                                                              // another list in its place
  }
  if (frame === 415) {
    console.log(`a replaced list unmounts its rows: ${mounted === rows}`);
    swap(-1);                                                                             // no list, then another: it takes the freed handles
  }
  if (frame === 417) swap(2);
  if (frame === 419) ui.scrollTo(r.current, 0, 480);                                       // and it scrolls
  if (frame === 422) {
    console.log(`its onScroll is gone: ${oldScrolls === 0}`);
    quit();
  }
});
