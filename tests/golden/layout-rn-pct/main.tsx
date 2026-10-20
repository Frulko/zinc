// Percent lengths, baseline and display: contents written as object styles (ZN-382), laid out by Yoga (rn engine).
import * as ui from 'zinc:ui';
import { createNodeRef, render, NodeRef } from 'zinc:ui/solid';
import { quit } from 'zinc:gfx';

const refs: NodeRef[] = [];
const names: string[] = [];
function r(name: string): NodeRef { const x = createNodeRef(); refs.push(x); names.push(name); return x; }
const pad = r('padding 10%'), mar = r('margin 5%'), ins = r('left 25%'), g1 = r('gap 10% a'), g2 = r('gap 10% b'), mn = r('minWidth 50%'), mx = r('maxWidth 25%');
const c1 = r('contents a'), c2 = r('contents b'), b1 = r('baseline small'), b2 = r('baseline tall');
function App(): i32 {
  return <View style={{ width: 400, alignItems: 'flex-start' }}>
    <View style={{ width: 200, padding: '10%' }}><View ref={pad} style={{ width: 10, height: 10 }} /></View>
    <View style={{ width: 200 }}><View ref={mar} style={{ width: 10, height: 10, marginLeft: '5%' }} /></View>
    <View style={{ width: 200, height: 20 }}><View ref={ins} style={{ position: 'absolute', left: '25%', width: 10, height: 10 }} /></View>
    <View style={{ width: 200, flexDirection: 'row', columnGap: '10%' }}><View ref={g1} style={{ width: 10, height: 10 }} /><View ref={g2} style={{ width: 10, height: 10 }} /></View>
    <View style={{ width: 200 }}><View ref={mn} style={{ minWidth: '50%', height: 10, alignSelf: 'flex-start' }} /><View ref={mx} style={{ width: 150, maxWidth: '25%', height: 10 }} /></View>
    <View style={{ width: 200, flexDirection: 'row' }}><View style={{ display: 'contents' }}><View ref={c1} style={{ width: 30, height: 10 }} /><View ref={c2} style={{ width: 30, height: 10 }} /></View></View>
    <View style={{ width: 200, flexDirection: 'row', alignItems: 'baseline' }}><View ref={b1} style={{ width: 10, height: 10 }} /><View ref={b2} style={{ width: 10, height: 30 }} /></View>
  </View>;
}
render(App, 0xffffff, (dt: number) => {
  for (let i = 0; i < refs.length; i++) { const b = ui.screenBox(refs[i].node); console.log(`${names[i]}: ${Math.round(b[0])},${Math.round(b[1])} ${Math.round(b[2])}x${Math.round(b[3])}`); }
  quit();
});
