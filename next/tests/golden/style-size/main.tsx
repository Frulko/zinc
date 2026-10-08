// React Native's size constraints in object styles (ZN-359): minWidth, maxWidth, minHeight, maxHeight and aspectRatio, static and dynamic, and a percent
// width decided at run time (`width: pct(v)`), in classic and in the rn layout mode (run with ZINC_UI_LAYOUT=rn).
import { StyleSheet } from 'zinc:ui';
import * as ui from 'zinc:ui';
import { pct } from 'zinc:ui';
import { createSignal, createNodeRef, render, NodeRef } from 'zinc:ui/solid';
import { UI_LAYOUT } from 'zinc:platform';

const s = StyleSheet.create({
  col: { flexDirection: 'column', width: 300, alignItems: 'flex-start', gap: 6 },
  minW: { width: 20, minWidth: 80, height: 10 },
  maxW: { width: 250, maxWidth: 120, height: 10 },
  minH: { width: 40, height: 5, minHeight: 30 },
  maxH: { width: 40, height: 90, maxHeight: 25 },
  ratio: { width: 120, aspectRatio: '16/9' },
  ratioNum: { width: 100, aspectRatio: 2 },
  track: { flexDirection: 'row', width: 200, height: 8 },
});
const [lim, setLim] = createSignal<number>(60);
const [done, setDone] = createSignal<number>(25);
const refs: NodeRef[] = [];
for (let i = 0; i < 8; i++) refs.push(createNodeRef());
const box = (k: i32): string => { const b = ui.screenBox(refs[k].node); return `${Math.round(b[2])}x${Math.round(b[3])}`; };

function App(): i32 {
  return <view style={s.col}>
    <view ref={refs[0]} style={s.minW} />
    <view ref={refs[1]} style={s.maxW} />
    <view ref={refs[2]} style={s.minH} />
    <view ref={refs[3]} style={s.maxH} />
    <view ref={refs[4]} style={s.ratio} />
    <view ref={refs[5]} style={s.ratioNum} />
    <view ref={refs[6]} style={{ width: 250, maxWidth: lim(), height: 10, minHeight: lim() / 4 }} />
    <view style={s.track}><view ref={refs[7]} style={{ width: pct(done()), height: 8 }} /></view>
  </view>;
}
let frames = 0;
render(App, 0xffffff, (dt: number) => {
  frames++;
  if (frames === 2) {
    console.log('layout ' + UI_LAYOUT);
    console.log('minWidth 80 over width 20: ' + box(0) + ', maxWidth 120 over 250: ' + box(1));
    console.log('minHeight 30 over 5: ' + box(2) + ', maxHeight 25 over 90: ' + box(3));
    console.log('aspectRatio 16/9 at 120: ' + box(4) + ', aspectRatio 2 at 100: ' + box(5));
    console.log('dynamic max 60 / min 15: ' + box(6) + ', pct(25) of 200: ' + box(7));
    setLim(140); setDone(80);
  }
  if (frames === 4) console.log('after the change, max 140 / min 35: ' + box(6) + ', pct(80): ' + box(7));
});
