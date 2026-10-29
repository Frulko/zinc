// Scroll restoration (scrollKey): a VirtualList and a ScrollView unmounted and mounted again come back at their offset, the list building only
// the rows in view there; a key that changes on a live list takes the new key's offset (the top when it has none); a list that came back
// shorter is clamped; a list of rows of their own heights shows the same row at its top again, though its rows come back as estimates.
// Then the side buttons of a mouse (3 back, 4 forward) and a two-finger swipe sideways reach the back and forward handlers.
import * as ui from 'zinc:ui';
import { render, createSignal, createNodeRef } from 'zinc:ui/solid';
import { quit } from 'zinc:gfx';

const [shown, setShown] = createSignal<boolean>(true);
const [rows, setRows] = createSignal<i32>(1000);
const [key, setKey] = createSignal<string>('list');
const list = createNodeRef(), box = createNodeRef(), vari = createNodeRef();
let built = 0;

function App(): i32 {
  return <View className="w-full h-full flex-col">
    {shown() ? <View className="flex-col">
      <VirtualList ref={list} scrollKey={key()} count={rows()} itemHeight={20} className="h-[100px]">
        {(i: i32) => { built++; return <View className="h-[20px]"><Text>{`row ${i}`}</Text></View>; }}
      </VirtualList>
      <ScrollView ref={box} scrollKey="box" className="h-[100px]">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((i: i32) => <View className="h-[30px]"><Text>{`item ${i}`}</Text></View>)}
      </ScrollView>
      <VirtualList ref={vari} scrollKey="var" count={1000} estimatedItemHeight={30} className="h-[80px]">
        {(i: i32) => <View className={(i % 2) === 0 ? 'h-[20px]' : 'h-[40px]'}><Text>{`v ${i}`}</Text></View>}
      </VirtualList>
    </View> : <View />}
  </View>;
}

function label(h: i32): string {
  const n = ui.inspectNode(h);
  if (n === null) return '';
  if (n.text !== '') return n.text;
  for (const c of n.children) { const t = label(c); if (t !== '') return t; }
  return '';
}
/** The row of the variable list at its top edge, and how far into it the top is. */
function topRow(): string {
  const n = ui.inspectNode(vari.node);
  if (n === null) return 'none';
  for (const c of n.children) {
    const r = ui.inspectNode(c);
    if (r !== null && r.top <= n.sy && n.sy < r.top + r.h) return `${label(c)} +${Math.round(n.sy - r.top)}`;
  }
  return 'none';
}
function show(tag: string): void {
  const l = ui.inspectNode(list.node), b = ui.inspectNode(box.node);
  if (l === null || b === null) { console.log(tag, 'not mounted'); return; }
  console.log(tag, 'list sy', Math.round(l.sy), 'rows built', built, 'box sy', Math.round(b.sy), 'var top', topRow());
}

let backs = 0, forwards = 0;
ui.addBackHandler(() => { backs++; return true; });
ui.addForwardHandler(() => { forwards++; return true; });

let f = 0;
render(App, 0xffffff, (dt: number) => {
  f++;
  if (f === 3) { ui.scrollTo(list.node, 0, 5000); ui.scrollTo(box.node, 0, 240); ui.scrollTo(vari.node, 0, 3000); }
  if (f === 5) { show('scrolled'); setShown(false); }
  if (f === 7) { built = 0; setShown(true); }
  if (f === 9) { show('mounted again'); setKey('other'); }
  if (f === 11) { show('key other'); setKey('list'); }
  if (f === 13) { show('key list'); setShown(false); }
  if (f === 15) { setRows(100); setShown(true); }
  if (f === 17) { show('100 rows'); }
  if (f === 18) {
    ui.pointerAt(10, 250, true, 3); ui.pointerAt(10, 250, false, 3);   // the back button
    ui.pointerAt(10, 250, true, 4); ui.pointerAt(10, 250, false, 4);   // forward
    ui.trackpadAt(10, 250, 0, 0, 3);
    for (let i = 0; i < 6; i++) ui.trackpadAt(10, 250, 20, 1, 1);   // over the vertical list, fingers to the right: back
    ui.trackpadAt(10, 250, 0, 0, 2);
    ui.trackpadAt(10, 250, 0, 0, 3);
    for (let i = 0; i < 6; i++) ui.trackpadAt(10, 250, -20, 0, 1);  // to the left: forward
    ui.trackpadAt(10, 250, 0, 0, 2);
    ui.trackpadAt(10, 250, 0, 0, 3);
    for (let i = 0; i < 2; i++) ui.trackpadAt(10, 250, 20, 0, 1);    // too short: nothing
    ui.trackpadAt(10, 250, 0, 0, 2);
    console.log('back', backs, 'forward', forwards);
    quit();
  }
});
