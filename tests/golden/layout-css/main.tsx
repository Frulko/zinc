// CSS conformance of the classic layout (ZN-1022): 100% sizes along the main axis, flex-basis, the shrink of a growing column and Tailwind's
// flex-1 (flex: 1 1 0%), with the automatic minimum size (min-width: auto) of CSS. main.out holds Chrome's boxes for the same tree:
// tools/layout-fixtures --chrome tests/golden/layout-css (every View is a flex column there too; the fixed boxes carry shrink-0 as in CSS).
import * as ui from 'zinc:ui';
import { createNodeRef, render, NodeRef } from 'zinc:ui/solid';
import { quit } from 'zinc:gfx';

const refs: NodeRef[] = [];
const names: string[] = [];
function r(name: string): NodeRef { const x = createNodeRef(); refs.push(x); names.push(name); return x; }
const a1 = r('h-full tall content'), a2 = r('h-full overflow-hidden'), a3 = r('w-full wide content'), a4 = r('w-full a'), a5 = r('w-full b');
const b1 = r('basis row'), b2 = r('basis-200 wrap');
const c1 = r('flex-1 wrap beside a bar');
const d1 = r('flex-1 a'), d2 = r('flex-1 b'), d3 = r('flex-1 c'), d4 = r('flex-1 min-content'), d5 = r('flex-1 beside min-content');
const d6 = r('flex-1 min-w-0 a'), d7 = r('flex-1 min-w-0 b'), d8 = r('auto column flex-1 a'), d9 = r('auto column flex-1 b');
const e1 = r('column flex-1 a'), e2 = r('column flex-1 b');
function App(): i32 {
  return <View className="w-[400px]">
    <View className="w-[320px] h-[240px]">
      <View className="h-12 shrink-0" />
      <View ref={a1} className="h-full"><View className="w-[10px] h-[400px] shrink-0" /></View>
    </View>
    <View className="w-[320px] h-[240px]">
      <View className="h-12 shrink-0" />
      <View ref={a2} className="h-full overflow-hidden"><View className="w-[10px] h-[400px] shrink-0" /></View>
    </View>
    <View className="flex-row w-[320px] h-[20px]">
      <View className="w-[100px] shrink-0" />
      <View ref={a3} className="w-full"><View className="w-[400px] h-[10px] shrink-0" /></View>
    </View>
    <View className="flex-row w-[320px] h-[20px]">
      <View ref={a4} className="w-full"><View className="w-[10px] h-[10px] shrink-0" /></View>
      <View ref={a5} className="w-full"><View className="w-[50px] h-[10px] shrink-0" /></View>
    </View>
    <View ref={b1} className="flex-row w-[320px] items-start">
      <View ref={b2} className="basis-[200px] flex-row flex-wrap">
        <View className="w-[60px] h-[20px] shrink-0" /><View className="w-[60px] h-[20px] shrink-0" /><View className="w-[60px] h-[20px] shrink-0" />
        <View className="w-[60px] h-[20px] shrink-0" /><View className="w-[60px] h-[20px] shrink-0" /><View className="w-[60px] h-[20px] shrink-0" />
        <View className="w-[60px] h-[20px] shrink-0" /><View className="w-[60px] h-[20px] shrink-0" />
      </View>
    </View>
    <View className="flex-row w-[320px] items-start">
      <View className="w-[100px] h-[10px] shrink-0" />
      <View ref={c1} className="flex-1 flex-row flex-wrap">
        <View className="w-[62px] h-[20px] shrink-0" /><View className="w-[62px] h-[20px] shrink-0" /><View className="w-[62px] h-[20px] shrink-0" />
        <View className="w-[62px] h-[20px] shrink-0" /><View className="w-[62px] h-[20px] shrink-0" />
      </View>
    </View>
    <View className="flex-row w-[300px] h-[30px]">
      <View ref={d1} className="flex-1"><View className="w-[10px] h-[10px] shrink-0" /></View>
      <View ref={d2} className="flex-1"><View className="w-[80px] h-[10px] shrink-0" /></View>
      <View ref={d3} className="flex-1"><View className="w-[40px] h-[10px] shrink-0" /></View>
    </View>
    <View className="flex-row w-[300px] h-[20px]">
      <View ref={d4} className="flex-1"><View className="w-[200px] h-[10px] shrink-0" /></View>
      <View ref={d5} className="flex-1"><View className="w-[10px] h-[10px] shrink-0" /></View>
    </View>
    <View className="flex-row w-[300px] h-[20px]">
      <View ref={d6} className="flex-1 min-w-0"><View className="w-[200px] h-[10px] shrink-0" /></View>
      <View ref={d7} className="flex-1 min-w-0"><View className="w-[10px] h-[10px] shrink-0" /></View>
    </View>
    <View className="w-[300px]">
      <View ref={d8} className="flex-1"><View className="w-[10px] h-[30px] shrink-0" /></View>
      <View ref={d9} className="flex-1"><View className="w-[10px] h-[50px] shrink-0" /></View>
    </View>
    <View className="w-[300px] h-[100px]">
      <View ref={e1} className="flex-1"><View className="w-[10px] h-[80px] shrink-0" /></View>
      <View ref={e2} className="flex-1"><View className="w-[10px] h-[10px] shrink-0" /></View>
    </View>
  </View>;
}
render(App, 0xffffff, (dt: number) => {
  for (let i = 0; i < refs.length; i++) {
    const b = ui.screenBox(refs[i].node);
    console.log(`${names[i]}: ${Math.round(b[0])},${Math.round(b[1])} ${Math.round(b[2])}x${Math.round(b[3])}`);
  }
  quit();
});
