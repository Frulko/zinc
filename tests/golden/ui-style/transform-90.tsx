// ui-style scene (ZN-263.02): a rect, a border, a shadow, an image and a text turned 90 degrees through the paint matrix, around their centre
// and, in the second row, around origin-top-left; software frame pinned by ui_style.sh, the GL replay held to it by ui_style_gl.sh.
import { render } from 'zinc:ui/solid';
import { imageFromPixels } from 'zinc:gfx';
import { StyleSheet } from 'zinc:ui';

function checker(): i32 {
  const px: u8[] = [];
  for (let i = 0; i < 64; i++) { const on = ((i % 8) >> 2) !== ((i >> 5) & 1); px.push(on ? 37 : 250); px.push(on ? 99 : 204); px.push(on ? 235 : 21); px.push(255); }
  return imageFromPixels(px, 8, 8);
}
const img = checker();
const s = StyleSheet.create({ turn: { transform: [{ rotate: '90deg' }] } });
function Row(p: { origin: string }): i32 {
  return <View className="flex-row gap-3 items-center">
    <View className={`w-7 h-7 bg-rose-500 ${p.origin}`} style={s.turn} />
    <View className={`w-7 h-7 border-2 border-slate-700 rounded-md ${p.origin}`} style={s.turn} />
    <View className={`w-7 h-7 bg-white rounded-lg shadow-md ${p.origin}`} style={s.turn} />
    <Image image={img} className={`w-7 h-7 ${p.origin}`} style={s.turn} />
    <Text className={`text-sm text-slate-900 ${p.origin}`} style={s.turn}>Zinc</Text>
  </View>;
}
function App(): i32 {
  return <View className="flex-col p-4 gap-8 bg-slate-100 w-full h-full"><Row origin="" /><Row origin="origin-top-left" /></View>;
}

render(App, 0xffffff, (dt: number) => {});
