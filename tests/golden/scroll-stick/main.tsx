// <ScrollView stickToBottom> (a chat, a log): while it shows its end it keeps showing it as rows are added; scrolled up, it stays where it was until
// it is brought back to the end. A ScrollView without the prop stays at the top.
import * as ui from 'zinc:ui';
import { createNodeRef, createSignal, For, render } from 'zinc:ui/solid';

const area = createNodeRef(), list = createNodeRef(), plain = createNodeRef();
const [rows, setRows] = createSignal<i32[]>([0, 1]);
function App(): i32 {
  return <View className="flex-row h-full bg-white">
    <ScrollView ref={area} stickToBottom className="h-[100] grow">
      <View ref={list} className="flex-col"><For each={rows()}>{(i: i32) => <View className="h-[30] bg-sky-500 mb-[2]" />}</For></View>
    </ScrollView>
    <ScrollView ref={plain} className="h-[100] grow">
      <View className="flex-col"><For each={rows()}>{(i: i32) => <View className="h-[30] bg-rose-500 mb-[2]" />}</For></View>
    </ScrollView>
  </View>;
}
const r = (v: number): number => Math.round(v);
function report(what: string): void {
  const end = r(ui.screenBox(list.node)[3] - ui.screenBox(area.node)[3]);
  console.log(`${what}: ${rows().length} rows, scroll ${r(ui.scrollTop(area.node))} of ${end < 0 ? 0 : end}, without the prop ${r(ui.scrollTop(plain.node))}`);
}
function add(): void { const next = rows().slice(); next.push(next.length); setRows(next); }
let frames = 0;
render(App, 0xffffff, (dt: number) => {
  frames++;
  if (frames === 2) report('fits');
  if (frames >= 3 && frames <= 6) add();                       // past the height of the view: it follows the end
  if (frames === 8) { report('grown'); ui.scrollTo(area.node, 0, 20); }
  if (frames === 9) add();                                     // scrolled up: it stays at 20
  if (frames === 11) { report('scrolled up'); ui.scrollTo(area.node, 0, 100000); }
  if (frames === 12) add();                                    // back at the end: it follows again
  if (frames === 14) report('back at the end');
});
