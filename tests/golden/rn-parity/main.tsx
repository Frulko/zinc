// React Native parity (ZN-1017): ImageBackground and <Image source={{ uri }}> render (frame.hash); Pressable's hitSlop takes a press beside its box,
// pressRetentionOffset keeps a press that moved off it, delayLongPress sets the hold before onLongPress.
import { render } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { View, Text, Image, ImageBackground, Pressable, StyleSheet } from 'react-native';
import { quit } from 'zinc:gfx';

const s = StyleSheet.create({
  page: { flex: 1, padding: 16, gap: 12, backgroundColor: '#ffffff' },
  hero: { height: 90, justifyContent: 'flex-end', padding: 8 },
  title: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  thumb: { width: 60, height: 40 },
  small: { width: 40, height: 20, backgroundColor: '#0f766e' },
  label: { color: '#ffffff', fontSize: 10 },
});
const log: string[] = [];
function App(): i32 {
  return <View style={s.page}>
    <ImageBackground source={{ uri: 'stripes.png' }} style={s.hero} imageStyle={{ borderRadius: 8 }}><Text style={s.title}>Over the image</Text></ImageBackground>
    <Image source={{ uri: 'stripes.png' }} style={s.thumb} resizeMode="cover" />
    <Pressable hitSlop={20} onPress={() => log.push('slop')} style={s.small} accessibilityLabel="slop"><Text style={s.label}>slop</Text></Pressable>
    <Pressable pressRetentionOffset={{ top: 0, left: 0, right: 60, bottom: 0 }} onPress={() => log.push('kept')} style={s.small} accessibilityLabel="kept"><Text style={s.label}>kept</Text></Pressable>
    <Pressable delayLongPress={200} onLongPress={() => log.push('long')} onPress={() => log.push('short')} style={s.small} accessibilityLabel="long"><Text style={s.label}>long</Text></Pressable>
    <Pressable onPress={() => log.push('plain')} style={s.small} accessibilityLabel="plain"><Text style={s.label}>plain</Text></Pressable>
  </View>;
}
function at(label: string): number[] { const b = ui.screenBox(ui.find(label)); return [b[0], b[1], b[2], b[3]]; }
let f = 0;
render(App, 0xffffff, (dt: number) => {
  f++;
  if (f === 3) {
    const a = at('slop');
    ui.pointerAt(a[0] + a[2] + 12, a[1] + 10, true); ui.pointerAt(a[0] + a[2] + 12, a[1] + 10, false);   // 12 px right of the box: in the slop
    const p = at('plain');
    ui.pointerAt(p[0] + p[2] + 12, p[1] + 10, true); ui.pointerAt(p[0] + p[2] + 12, p[1] + 10, false);   // no slop: missed
    const k = at('kept');
    ui.pointerAt(k[0] + 10, k[1] + 10, true); ui.pointerAt(k[0] + k[2] + 40, k[1] + 10, true); ui.pointerAt(k[0] + k[2] + 40, k[1] + 10, false);   // released 40 px off: kept
    ui.pointerAt(p[0] + 10, p[1] + 10, true); ui.pointerAt(p[0] + p[2] + 40, p[1] + 10, true); ui.pointerAt(p[0] + p[2] + 40, p[1] + 10, false);   // the same off plain: no press
    const l = at('long');
    ui.pointerAt(l[0] + 10, l[1] + 10, true);
  }
  if (f === 20) { const l = at('long'); ui.pointerAt(l[0] + 10, l[1] + 10, false); }   // held 17 frames (283 ms): past 200 ms
  if (f === 22) { console.log('log ' + log.join(',')); quit(); }
});
