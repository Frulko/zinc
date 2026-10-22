// The style keys of what was class-only (ZN-774.18): each key in a style object, static and decided at run time, writes the field its class writes, so
// classes.tsx (the same cells through classes) renders the same frame and prints the same lines (pointer events and cursor draw nothing). The last cell
// (decoration colour and style) has no class: both programs give it as a style object, and the recorded frame holds it.
import * as ui from 'zinc:ui';
import { StyleSheet } from 'zinc:ui';
import { createSignal, createNodeRef, render } from 'zinc:ui/solid';
const [on, setOn] = createSignal<boolean>(true);
const [w, setW] = createSignal<number>(700);
const over = createNodeRef(), hand = createNodeRef();
const s = StyleSheet.create({ cell: { width: 150, height: 56, padding: 6, backgroundColor: 'white' } });
function App(): i32 {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 8 }}>
    <View style={s.cell}>
      <View style={{ position: 'absolute', left: 8, top: 8, width: 40, height: 40, backgroundColor: '#ef4444', zIndex: 10 }} />
      <View style={{ position: 'absolute', left: 24, top: 16, width: 40, height: 40, backgroundColor: '#3b82f6' }} />
      <View style={{ position: 'absolute', left: 80, top: 8, width: 40, height: 40, backgroundColor: '#22c55e', zIndex: on() ? 2 : 0 }} />
      <View style={{ position: 'absolute', left: 96, top: 16, width: 40, height: 40, backgroundColor: '#eab308', zIndex: -1 }} />
    </View>
    <View style={s.cell}>
      <Text style={{ fontStyle: 'italic' }}>Italic text</Text>
      <Text style={{ fontStyle: on() ? 'italic' : 'normal', textTransform: 'uppercase' }}>upper case</Text>
    </View>
    <View style={s.cell}>
      <Text style={{ textTransform: 'lowercase' }}>LOWER Case</Text>
      <Text style={{ textTransform: 'capitalize' }}>capital letters</Text>
    </View>
    <View style={s.cell}>
      <Text style={{ textDecorationLine: 'underline' }}>Underlined</Text>
      <Text style={{ textDecorationLine: 'underline line-through' }}>Both lines</Text>
    </View>
    <View style={s.cell}>
      <Text style={{ textDecorationLine: 'line-through', color: '#64748b' }}>Struck out</Text>
      <Text style={{ textShadowColor: '#00000064', textShadowOffset: { width: 2, height: 4 }, textShadowRadius: 6, fontSize: 18 }}>Shadow lg</Text>
    </View>
    <View style={s.cell}>
      <Text style={{ textShadowColor: '#ef44446e', textShadowOffset: { width: 1, height: 2 }, fontSize: 18 }}>Red shadow</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}><Text style={{ fontWeight: 'bold' }}>Bold</Text><Text style={{ fontWeight: '300' }}>w300</Text></View>
    </View>
    <View style={s.cell}>
      <View style={{ flexDirection: 'row', gap: 6 }}><Text style={{ fontWeight: '100' }}>w100</Text><Text style={{ fontWeight: '500' }}>w500</Text><Text style={{ fontWeight: '600' }}>w600</Text></View>
      <View style={{ flexDirection: 'row', gap: 6 }}><Text style={{ fontWeight: w() }}>w700</Text><Text style={{ fontWeight: 900 }}>w900</Text></View>
    </View>
    <View style={s.cell}>
      <Text style={{ color: '#0f172a7f' }}>Half ink</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}><Text style={{ color: on() ? 'rgba(15,23,42,0.498)' : '#0f172a' }}>Half</Text><Text style={{ color: 'transparent' }}>gone</Text></View>
    </View>
    <View style={s.cell}>
      <View style={{ width: 60, height: 40, borderWidth: 2, borderColor: '#3b82f67f' }} />
      <View style={{ position: 'absolute', left: 80, top: 8, width: 60, height: 40, backgroundColor: '#3b82f6', borderWidth: 4, borderColor: 'transparent' }} />
    </View>
    <View style={s.cell}>
      <View style={{ width: 60, height: 40, backgroundColor: 'white', shadowLevel: 3 }} />
      <View style={{ position: 'absolute', left: 80, top: 8, width: 60, height: 40, backgroundColor: 'white', shadowColor: '#00000080', shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }} />
    </View>
    <View style={s.cell}>
      <Button onClick={() => setOn(!on())} style={{ width: 120, height: 40, backgroundColor: '#e2e8f0' }}><Text>Below</Text></Button>
      <View ref={over} style={{ position: 'absolute', left: 6, top: 6, width: 120, height: 40, backgroundColor: '#22c55e33', pointerEvents: 'none' }} />
    </View>
    <View style={s.cell}>
      <View ref={hand} style={{ width: 60, height: 40, backgroundColor: '#e2e8f0', cursor: 'pointer' }} />
    </View>
    <View style={s.cell}>
      <Text style={{ textDecorationLine: 'underline', textDecorationColor: '#ef4444', textDecorationStyle: 'double' }}>Double red</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}><Text style={{ textDecorationLine: 'underline', textDecorationStyle: 'dotted' }}>Dotted</Text><Text style={{ textDecorationLine: 'line-through', textDecorationStyle: 'dashed', textDecorationColor: '#3b82f6' }}>dashed</Text></View>
    </View>
  </View>;
}
let frames = 0;
render(App, 0xf4f1ec, (dt: number) => {
  if (++frames !== 2) return;
  const b = ui.screenBox(over.node);
  console.log(`pointer under the overlay: ${ui.nodeAt(b[0] + 10, b[1] + 10) === over.node ? 'the overlay' : 'below it'}`);
  console.log(`cursor: ${(ui.inspectNode(hand.node) as ui.UiNode).cursor}`);
});
