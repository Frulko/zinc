// zinc:react-native, first slice (ZN-367.01): a screen written with React Native's names. Scripted presses check Pressable (onPressIn/Out, onPress,
// onLongPress, disabled), TouchableOpacity's activeOpacity and TouchableHighlight's underlay while pressed, a controlled Switch, ActivityIndicator,
// SafeAreaView, StatusBar, and the APIs Platform, Dimensions (+ change), useWindowDimensions, PixelRatio, Appearance / useColorScheme.
import { useState } from 'zinc:ui/react';
import { render } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { View, Text, StyleSheet, Pressable, TouchableOpacity, TouchableHighlight, TouchableWithoutFeedback, Switch, ActivityIndicator, SafeAreaView,
  StatusBar, Platform, Dimensions, DimensionsChange, useWindowDimensions, PixelRatio, Appearance, useColorScheme, processColor, statusBarProps } from 'zinc:react-native';
import { quit } from 'zinc:gfx';

const s = StyleSheet.create({
  page: { flex: 1, padding: 16, gap: 12, backgroundColor: '#f4f1ec' },
  button: { height: 44, borderRadius: 10, backgroundColor: '#0f766e', alignItems: 'center', justifyContent: 'center' },
  label: { color: '#ffffff', fontSize: 16 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
});
const log: string[] = [];
let pressCount = 0;
let seen = '';   // what the last render saw through useWindowDimensions and useColorScheme
function App(): i32 {
  const [on, setOn] = useState<boolean>(false);
  const win = useWindowDimensions();
  const scheme = useColorScheme();
  seen = `${win.width}x${win.height} ${scheme}`;
  return <SafeAreaView style={s.page}>
    <StatusBar barStyle="dark-content" />
    <Pressable style={s.button} onPress={() => { pressCount++; log.push('press'); }} onPressIn={() => log.push('in')} onPressOut={() => log.push('out')}
      onLongPress={() => log.push('long')} accessibilityLabel="Go"><Text style={s.label}>Pressable</Text></Pressable>
    <Pressable style={[s.button, { backgroundColor: '#999999' }]} disabled={true} onPress={() => log.push('disabled press')}><Text style={s.label}>Disabled</Text></Pressable>
    <TouchableOpacity style={s.button} activeOpacity={0.5} onPress={() => log.push('opacity press')}><Text style={s.label}>Opacity</Text></TouchableOpacity>
    <TouchableHighlight style={s.button} underlayColor="#ff5a36" onPress={() => log.push('highlight press')}><Text style={s.label}>Highlight</Text></TouchableHighlight>
    <TouchableWithoutFeedback onPress={() => log.push('plain press')}><Text>Plain</Text></TouchableWithoutFeedback>
    <View style={s.row}>
      <Switch value={on} onValueChange={(v: boolean) => { setOn(v); log.push(`switch ${v}`); }} trackColor={{ false: '#767577', true: '#81b0ff' }} thumbColor="#f4f3f4" />
      <ActivityIndicator size="large" color="#0f766e" />
      <ActivityIndicator animating={false} />
      <Text>{`${win.width}x${win.height} ${scheme}`}</Text>
    </View>
  </SafeAreaView>;
}
let f = 0;
function hex(v: i32): string { let o = ''; for (let k = 20; k >= 0; k -= 4) o += '0123456789abcdef'.charAt((v >> k) & 15); return o; }
const at = (y: number, down: boolean): void => ui.pointerAt(100, y, down);
const opacityAt = (y: number): string => { const h = ui.hitAt(100, y); const n = ui.inspectNode(h); return n === null ? '?' : n.opacity.toFixed(2); };
const bgAt = (y: number): string => { const h = ui.hitAt(100, y); const n = ui.inspectNode(h); return n === null ? '?' : hex(n.bg); };
console.log(`Platform.OS ${Platform.OS} select ${Platform.select({ macos: 'mac', web: 'web', default: 'other' }, 'none')} ratio ${PixelRatio.get()} round ${PixelRatio.roundToNearestPixel(10.26)}`);
console.log(`colors ${hex(processColor('#81b0ff'))} ${hex(processColor('#fff'))} ${processColor('nope')}`);
const sub = Dimensions.addEventListener('change', (e: DimensionsChange) => console.log(`dimensions change ${e.window.width}x${e.window.height}`));
render(App, 0xf4f1ec, (dt: number) => {
  f++;
  if (f === 2) { console.log(`window ${Dimensions.get('window').width}x${Dimensions.get('window').height} status ${statusBarProps().barStyle ?? ''}`); at(38, true); }
  if (f === 3) { at(38, false); console.log(`tap: ${log.join(' ')}`); log.length = 0; at(38, true); }
  if (f === 40) { at(38, false); console.log(`long: ${log.join(' ')}`); log.length = 0; at(94, true); }
  if (f === 41) { at(94, false); console.log(`disabled: [${log.join(' ')}]`); at(150, true); }
  if (f === 42) { console.log(`opacity while pressed ${opacityAt(150)}`); at(150, false); }
  if (f === 43) { console.log(`opacity after ${opacityAt(150)}`); at(206, true); }
  if (f === 44) { console.log(`underlay while pressed ${bgAt(206)}`); at(206, false); }
  if (f === 45) { console.log(`underlay after ${bgAt(206)}`); at(254, true); }
  if (f === 46) { at(254, false); ui.pointerAt(40, 300, true); }
  if (f === 47) { ui.pointerAt(40, 300, false); }
  if (f === 48) { ui.pointerAt(40, 300, true); }
  if (f === 49) { ui.pointerAt(40, 300, false); Appearance.setColorScheme('dark'); }
  if (f === 51) { console.log(`after: ${log.join(' ')} presses ${pressCount} rendered ${seen}`); sub.remove(); quit(); }
});
