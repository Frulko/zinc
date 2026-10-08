// React Native's flex keys in object styles (ZN-358): flex shorthand, flexShrink, flexBasis (number, percent, auto), alignSelf and alignContent, each in
// StyleSheet.create and inline, reach the node and lay out as React Native does in the rn mode (run with ZINC_UI_LAYOUT=rn) and as classic does without it.
import { StyleSheet } from 'zinc:ui';
import * as ui from 'zinc:ui';
import { createNodeRef, render, NodeRef } from 'zinc:ui/solid';
import { UI_LAYOUT } from 'zinc:platform';

const s = StyleSheet.create({
  row: { flexDirection: 'row', width: 300, height: 40 },
  one: { flex: 1, height: 20 },
  shrinkMe: { width: 200, flexShrink: 1, height: 20 },
  rigid: { width: 200, flexShrink: 0, height: 20 },
  basis: { flexBasis: 50, flexGrow: 1, height: 20 },
  basisPct: { flexBasis: '25%', height: 20 },
  basisAuto: { flexBasis: 'auto', width: 30, height: 20 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', width: 300, height: 200, alignContent: 'flex-end', alignItems: 'flex-start' },
  tile: { width: 140, height: 40 },
});
const refs: NodeRef[] = [];
for (let i = 0; i < 13; i++) refs.push(createNodeRef());
const box = (k: i32): string => { const b = ui.screenBox(refs[k].node); return `${Math.round(b[0])},${Math.round(b[1])} ${Math.round(b[2])}x${Math.round(b[3])}`; };

function App(): i32 {
  return <view style={{ flexDirection: 'column', gap: 10 }}>
    <view style={s.row}><view ref={refs[0]} style={s.one} /><view ref={refs[1]} style={{ flex: 1, height: 20 }} /><view ref={refs[2]} style={{ width: 120, height: 20 }} /></view>
    <view style={s.row}><view ref={refs[3]} style={s.shrinkMe} /><view ref={refs[4]} style={s.rigid} /></view>
    <view style={s.row}><view ref={refs[5]} style={s.basis} /><view ref={refs[6]} style={s.basisPct} /><view ref={refs[7]} style={s.basisAuto} /></view>
    <view style={[s.row, { alignItems: 'flex-start' }]}><view ref={refs[8]} style={{ width: 40, height: 20, alignSelf: 'flex-end' }} /></view>
    <view style={s.row}><view ref={refs[11]} style={s.one}><view style={{ width: 100, height: 10 }} /></view><view ref={refs[12]} style={{ flex: 1 }}><view style={{ width: 20, height: 10 }} /></view></view>
    <view style={s.wrap}><view ref={refs[9]} style={s.tile} /><view style={s.tile} /><view ref={refs[10]} style={s.tile} /></view>
  </view>;
}
let frames = 0;
render(App, 0xffffff, (dt: number) => {
  if (++frames !== 2) return;
  console.log('layout ' + UI_LAYOUT);
  console.log('flex 1 x2 + 120: ' + box(0) + ' | ' + box(1) + ' | ' + box(2));
  console.log('shrink 1 vs 0: ' + box(3) + ' | ' + box(4));
  console.log('basis 50 grow, 25%, auto: ' + box(5) + ' | ' + box(6) + ' | ' + box(7));
  console.log('alignSelf flex-end: ' + box(8));
  console.log('alignContent flex-end: ' + box(9) + ' | ' + box(10));
  console.log('flex 1 with content 100 and 20 (rn: basis 0, equal; classic: grow only): ' + box(11) + ' | ' + box(12));
});
