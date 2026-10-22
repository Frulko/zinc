// The reference of objects.tsx (ZN-774.18): the same cells, each look given by its class; the layout stays in style objects. The shadow's alpha has no class:
// its reference is the opaque colour at shadowOpacity 0.5. The decoration colour and style cell has no class either: the same style object as objects.tsx.
// The scroll indicators have no class: React Native's ScrollView props (showsVerticalScrollIndicator={false}) stand for it.
import * as ui from 'zinc:ui';
import { StyleSheet } from 'zinc:ui';
import { createSignal, createNodeRef, render } from 'zinc:ui/solid';
const [on, setOn] = createSignal<boolean>(true);
const [moved, setMoved] = createSignal<boolean>(false);
const over = createNodeRef(), hand = createNodeRef(), hint = createNodeRef(), sel = createNodeRef(), sa = createNodeRef(), sb = createNodeRef(), sc = createNodeRef();
const s = StyleSheet.create({ cell: { width: 150, height: 56, padding: 6, backgroundColor: 'white' } });
function App(): i32 {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 8 }}>
    <View style={s.cell}>
      <View className="z-10" style={{ position: 'absolute', left: 8, top: 8, width: 40, height: 40, backgroundColor: '#ef4444' }} />
      <View style={{ position: 'absolute', left: 24, top: 16, width: 40, height: 40, backgroundColor: '#3b82f6' }} />
      <View className="z-[2]" style={{ position: 'absolute', left: 80, top: 8, width: 40, height: 40, backgroundColor: '#22c55e' }} />
      <View className="-z-1" style={{ position: 'absolute', left: 96, top: 16, width: 40, height: 40, backgroundColor: '#eab308' }} />
    </View>
    <View style={s.cell}>
      <Text className="italic">Italic text</Text>
      <Text className="italic uppercase">upper case</Text>
    </View>
    <View style={s.cell}>
      <Text className="lowercase">LOWER Case</Text>
      <Text className="capitalize">capital letters</Text>
    </View>
    <View style={s.cell}>
      <Text className="underline">Underlined</Text>
      <Text className="underline line-through">Both lines</Text>
    </View>
    <View style={s.cell}>
      <Text className="line-through text-slate-500">Struck out</Text>
      <Text className="text-shadow-lg" style={{ fontSize: 18 }}>Shadow lg</Text>
    </View>
    <View style={s.cell}>
      <Text className="text-shadow-md text-shadow-red-500" style={{ fontSize: 18 }}>Red shadow</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}><Text className="font-bold">Bold</Text><Text className="font-light">w300</Text></View>
    </View>
    <View style={s.cell}>
      <View style={{ flexDirection: 'row', gap: 6 }}><Text className="font-thin">w100</Text><Text className="font-medium">w500</Text><Text className="font-semibold">w600</Text></View>
      <View style={{ flexDirection: 'row', gap: 6 }}><Text className="font-bold">w700</Text><Text className="font-black">w900</Text></View>
    </View>
    <View style={s.cell}>
      <Text className="text-slate-900/50">Half ink</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}><Text className="text-slate-900/50">Half</Text><Text className="text-black/0">gone</Text></View>
    </View>
    <View style={s.cell}>
      <View className="border-2 border-blue-500/50" style={{ width: 60, height: 40 }} />
      <View className="border-4 border-transparent" style={{ position: 'absolute', left: 80, top: 8, width: 60, height: 40, backgroundColor: '#3b82f6' }} />
    </View>
    <View style={s.cell}>
      <View className="shadow-md" style={{ width: 60, height: 40, backgroundColor: 'white' }} />
      <View style={{ position: 'absolute', left: 80, top: 8, width: 60, height: 40, backgroundColor: 'white', shadowColor: '#000000', shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }} />
    </View>
    <View style={s.cell}>
      <Button onClick={() => setOn(!on())} style={{ width: 120, height: 40, backgroundColor: '#e2e8f0' }}><Text>Below</Text></Button>
      <View ref={over} className="pointer-events-none" style={{ position: 'absolute', left: 6, top: 6, width: 120, height: 40, backgroundColor: '#22c55e33' }} />
    </View>
    <View style={s.cell}>
      <View ref={hand} className="cursor-pointer" style={{ width: 60, height: 40, backgroundColor: '#e2e8f0' }} />
    </View>
    <View style={s.cell}>
      <Text style={{ textDecorationLine: 'underline', textDecorationColor: '#ef4444', textDecorationStyle: 'double' }}>Double red</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}><Text style={{ textDecorationLine: 'underline', textDecorationStyle: 'dotted' }}>Dotted</Text><Text style={{ textDecorationLine: 'line-through', textDecorationStyle: 'dashed', textDecorationColor: '#3b82f6' }}>dashed</Text></View>
    </View>
    <View style={s.cell}>
      <View className="outline-2 outline-red-500 outline-offset-2" style={{ position: 'absolute', left: 12, top: 12, width: 50, height: 32, backgroundColor: '#e2e8f0' }} />
      <View className="outline-2 outline-blue-500 outline-dashed outline-offset-3" style={{ position: 'absolute', left: 84, top: 12, width: 50, height: 32, backgroundColor: '#e2e8f0', borderRadius: 6 }} />
    </View>
    <View style={s.cell}>
      <Input ref={hint} placeholder="Placeholder" className="placeholder:text-red-500" style={{ width: 120 }} />
      <View className="outline-2 outline-green-500 outline-dotted" style={{ position: 'absolute', left: 12, top: 34, width: 120, height: 12 }} />
    </View>
    <View style={s.cell}>
      <Input ref={sel} value="Selected" className="selection:bg-green-500 caret-red-500 outline-none" style={{ width: 120, backgroundColor: '#f1f5f9' }} />
    </View>
    <View style={s.cell}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <ScrollView ref={sa} style={{ width: 40, height: 40, backgroundColor: '#e2e8f0' }}><View style={{ height: 120, backgroundColor: '#93c5fd', margin: 4 }} /></ScrollView>
        <ScrollView ref={sb} showsVerticalScrollIndicator={false} style={{ width: 40, height: 40, backgroundColor: '#e2e8f0' }}><View style={{ height: 120, backgroundColor: '#93c5fd', margin: 4 }} /></ScrollView>
        <View ref={sc} className="overflow-scroll" showsHorizontalScrollIndicator={false} style={{ width: 40, height: 40, backgroundColor: '#e2e8f0' }}><View style={{ width: 120, height: 120, backgroundColor: '#86efac', margin: 4 }} /></View>
      </View>
    </View>
    <View style={s.cell}>
      <View className="transition-colors duration-200 ease-linear delay-20" style={{ position: 'absolute', left: 8, top: 8, width: 40, height: 40, backgroundColor: moved() ? '#ef4444' : '#3b82f6' }} />
      <View className="transition duration-300 ease-out" style={{ position: 'absolute', left: 56, top: 8, width: 40, height: 40, backgroundColor: '#22c55e', transform: [{ translateX: moved() ? 48 : 0 }] }} />
    </View>
  </View>;
}
let frames = 0;
render(App, 0xf4f1ec, (dt: number) => {
  if (++frames !== 2) return;
  setMoved(true);   // the transitions start: the last frame shows them half way
  for (const h of [sa.node, sb.node, sc.node]) ui.scrollTo(h, 20, 20);   // the indicators show while it scrolls
  ui.focusNode(hint.node); ui.keyDown(-1, 'Tab'); ui.select(sel.node, 0, 3);   // the keyboard reaches the field: its ring would show
  const b = ui.screenBox(over.node);
  console.log(`pointer under the overlay: ${ui.nodeAt(b[0] + 10, b[1] + 10) === over.node ? 'the overlay' : 'below it'}`);
  console.log(`cursor: ${(ui.inspectNode(hand.node) as ui.UiNode).cursor}`);
});
