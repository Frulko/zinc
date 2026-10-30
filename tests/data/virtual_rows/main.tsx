// A virtual list whose rows are components (tests/t0/virtual_rows.sh): scrolled over 2,000 rows and back, then rendered again, it keeps
// the instances of the rows it shows only: a row that scrolls out is unmounted (componentWillUnmount runs), as a list rendered again
// unmounts the rows it made before.
import { render, useRef, useState, MutableRef, Component } from 'zinc:ui/react';
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
function App() {
  const ref = useRef<i32>(-1);
  const [v, setV] = useState<i32>(0);
  list = ref; again = setV;
  return <VirtualList ref={ref} count={2000} itemHeight={24} className="h-[120]">{(i: i32) => <Row i={i + v * 0} />}</VirtualList>;
}
let frame = 0, rows = 0;
render(App, 0x000000, (dt: number): void => {
  frame++;
  const r = list;
  if (r === null) return;
  if (frame === 5) rows = mounted;
  if (frame > 5 && frame <= 205) ui.scrollTo(r.current, 0, (frame - 5) * 240);            // down over the 2,000 rows
  if (frame > 205 && frame <= 405) ui.scrollTo(r.current, 0, (405 - frame) * 240);         // and back up
  if (frame === 406) again(1);                                                            // rendered again: the rows are made again
  if (frame === 410) {
    console.log(`rows mounted as at the start: ${mounted === rows && rows > 0}`);
    console.log(`rows made over the scroll: ${made > 1000}`);
    quit();
  }
});
