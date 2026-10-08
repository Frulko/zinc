// Right-to-left (ZN-377): the same screen in ZINC_DIR=ltr and rtl. A row of three boxes, padding-inline (ps-4 pe-8), a margin-start (ms-6), text-start, an
// rtl: variant, text at its default alignment, a Nuxt UI Switch (its thumb) and Tabs. Prints the boxes: under rtl every x is the ltr one mirrored.
import * as ui from 'zinc:ui';
import { createSignal, createNodeRef, render } from 'zinc:ui/solid';
import { Switch, Tabs } from 'zinc:ui/nuxt';
import { quit } from 'zinc:gfx';

const [on, setOn] = createSignal<boolean>(true);
const [tab, setTab] = createSignal<i32>(0);
const row = createNodeRef(), a = createNodeRef(), b = createNodeRef(), c = createNodeRef(), pad = createNodeRef(), inner = createNodeRef(), ms = createNodeRef(), txt = createNodeRef(), sw = createNodeRef(), tabs = createNodeRef();
function App(): i32 {
  return <View class="flex-col gap-3 p-4 w-full h-full bg-white">
    <View ref={row} class="flex-row gap-2">
      <View ref={a} class="w-16 h-8 bg-red-500" /><View ref={b} class="w-24 h-8 bg-green-500" /><View ref={c} class="w-8 h-8 bg-blue-500" />
    </View>
    <View ref={pad} class="flex-col ps-4 pe-8 bg-slate-100 rtl:bg-amber-100"><View ref={inner} class="h-6 bg-slate-400" /></View>
    <View class="flex-col"><View ref={ms} class="ms-6 w-20 h-6 bg-purple-500" /></View>
    <Text ref={txt} class="w-64 text-slate-900">Start of the line</Text>
    <View ref={sw} class="flex-col"><Switch modelValue={on} onUpdate={setOn} label="Wi-Fi" /></View>
    <View ref={tabs} class="flex-col w-80"><Tabs items={[{ label: 'One' }, { label: 'Two' }, { label: 'Three' }]} modelValue={tab} onUpdate={setTab} /></View>
  </View>;
}
const box = (h: i32): string => ui.screenBox(h).map((v: number) => Math.round(v)).join(',');
let f = 0;
render(App, 0xffffff, (dt: number) => {
  if (++f !== 3) return;
  console.log(`${ui.direction()}: a ${box(a.node)} b ${box(b.node)} c ${box(c.node)}`);
  console.log(`inner ${box(inner.node)} pad bg ${(ui.inspectNode(pad.node) as ui.UiNode).bg.toString()} ms ${box(ms.node)}`);
  const t = ui.inspectNode(txt.node) as ui.UiNode;
  console.log(`text ${box(txt.node)} line width ${Math.round(t.lineW[0])}`);
  quit();
});
