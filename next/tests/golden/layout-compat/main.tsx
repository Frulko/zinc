// classic's React Native subset (ZN-288): the same cases run in classic with "preset": "react-native" (ZINC_UI_LAYOUT=classic) and in Yoga
// (ZINC_UI_LAYOUT=rn) and must print the same boxes: flex: 1 equal shares, flexShrink, minWidth / maxWidth, alignSelf, aspectRatio, alignContent;
// row-reverse, column-reverse, wrap-reverse, rowGap / columnGap and auto margins (ZN-380).
import * as ui from 'zinc:ui';
import { createNodeRef, render, NodeRef } from 'zinc:ui/solid';
import { quit } from 'zinc:gfx';

const refs: NodeRef[] = [];
const names: string[] = [];
function r(name: string): NodeRef { const x = createNodeRef(); refs.push(x); names.push(name); return x; }
const a1 = r('flex1 a'), a2 = r('flex1 b'), a3 = r('flex1 c');
const s1 = r('shrink a'), s2 = r('shrink b');
const m1 = r('max'), m2 = r('beside max'), m3 = r('min'), m4 = r('beside min');
const l1 = r('self stretch'), l2 = r('self center'), l3 = r('self end');
const p1 = r('aspect from width'), p2 = r('aspect from height');
const c1 = r('content a'), c2 = r('content b'), c3 = r('content c');
const v1 = r('row-reverse a'), v2 = r('row-reverse b'), v3 = r('column-reverse');
const w1 = r('wrap-reverse a'), w2 = r('wrap-reverse b'), w3 = r('wrap-reverse c');
const u1 = r('margin auto'), u2 = r('marginLeft auto'), u3 = r('marginVertical auto');
function App(): i32 {
  return <View style={{ width: 300, padding: 0 }}>
    <View style={{ flexDirection: 'row', width: 300, height: 30 }}>
      <View ref={a1} style={{ flex: 1 }}><Text>a</Text></View>
      <View ref={a2} style={{ flex: 1 }}><Text>a longer label</Text></View>
      <View ref={a3} style={{ flex: 1 }}><Text>mid</Text></View>
    </View>
    <View style={{ flexDirection: 'row', width: 200, height: 20 }}>
      <View ref={s1} style={{ width: 150, flexShrink: 1 }} />
      <View ref={s2} style={{ width: 150, flexShrink: 1 }} />
    </View>
    <View style={{ flexDirection: 'row', width: 300, height: 20 }}>
      <View ref={m1} style={{ flex: 1, maxWidth: 80 }} />
      <View ref={m2} style={{ flex: 1 }} />
    </View>
    <View style={{ flexDirection: 'row', width: 300, height: 20 }}>
      <View ref={m3} style={{ flex: 1, minWidth: 250 }} />
      <View ref={m4} style={{ flex: 1 }} />
    </View>
    <View style={{ alignItems: 'flex-start', width: 300 }}>
      <View ref={l1} style={{ alignSelf: 'stretch', height: 10 }} />
      <View ref={l2} style={{ alignSelf: 'center', width: 40, height: 10 }} />
      <View ref={l3} style={{ alignSelf: 'flex-end', width: 40, height: 10 }} />
    </View>
    <View style={{ flexDirection: 'row', width: 300, alignItems: 'flex-start' }}>
      <View ref={p1} style={{ width: 120, aspectRatio: 2 }} />
      <View ref={p2} style={{ height: 50, aspectRatio: 2 }} />
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 300, height: 100, alignContent: 'center' }}>
      <View ref={c1} style={{ width: 200, height: 20 }} />
      <View ref={c2} style={{ width: 200, height: 20 }} />
      <View ref={c3} style={{ width: 80, height: 20 }} />
    </View>
    <View style={{ flexDirection: 'row-reverse', width: 100, height: 20 }}>
      <View ref={v1} style={{ width: 10, height: 10 }} />
      <View ref={v2} style={{ width: 10, height: 10 }} />
    </View>
    <View style={{ flexDirection: 'column-reverse', width: 20, height: 60 }}><View ref={v3} style={{ width: 10, height: 10 }} /></View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap-reverse', width: 50, height: 60, alignContent: 'flex-start', rowGap: 4, columnGap: 6 }}>
      <View ref={w1} style={{ width: 20, height: 10 }} />
      <View ref={w2} style={{ width: 20, height: 10 }} />
      <View ref={w3} style={{ width: 20, height: 10 }} />
    </View>
    <View style={{ flexDirection: 'row', width: 100, height: 40 }}><View ref={u1} style={{ width: 20, height: 10, margin: 'auto' }} /></View>
    <View style={{ flexDirection: 'row', width: 100, height: 20 }}><View ref={u2} style={{ width: 20, height: 10, marginLeft: 'auto' }} /></View>
    <View style={{ width: 100, height: 40 }}><View ref={u3} style={{ width: 20, height: 10, marginVertical: 'auto' }} /></View>
  </View>;
}
render(App, 0xffffff, (dt: number) => {
  for (let i = 0; i < refs.length; i++) {
    const b = ui.screenBox(refs[i].node);
    console.log(`${names[i]}: ${Math.round(b[0])},${Math.round(b[1])} ${Math.round(b[2])}x${Math.round(b[3])}`);
  }
  quit();
});
