// The default pressed feedback (tests/t1/ui_press.sh, driven by the ZINC_INPUT script beside this file): a View with onClick dims while the mouse or a
// finger is down on it and comes back after the release; dragged off it, the dim lifts and no press fires; a disabled one neither dims nor fires; Enter
// on the focused one dims it a moment; TouchableOpacity's activeOpacity and an active:opacity-70 class replace the default dim instead of adding to it.
// (zinc:react-native's Pressable shows no dim, as React Native's: tests/golden/react-native.)
import { useState } from 'zinc:ui/react';
import { render } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { View, Text, TouchableOpacity, StyleSheet } from 'zinc:react-native';
import { quit } from 'zinc:gfx';

let presses = '';
const s = StyleSheet.create({
  a: { position: 'absolute', left: 20, top: 20, width: 200, height: 50, backgroundColor: '#3366cc' },
  b: { position: 'absolute', left: 20, top: 90, width: 200, height: 50, backgroundColor: '#3366cc' },
  c: { position: 'absolute', left: 20, top: 160, width: 200, height: 50, backgroundColor: '#3366cc' },
  d: { position: 'absolute', left: 20, top: 230, width: 200, height: 50, backgroundColor: '#3366cc' },
});
function App() {
  return <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
    <View style={s.a} onClick={() => { presses += 'A'; }}><Text>A</Text></View>
    <TouchableOpacity style={s.b} activeOpacity={0.5} onPress={() => { presses += 'B'; }}><Text>B</Text></TouchableOpacity>
    <View style={s.c} disabled={true} onClick={() => { presses += 'C'; }}><Text>C</Text></View>
    <View style={s.d} className="active:opacity-70" onClick={() => { presses += 'D'; }}><Text>D</Text></View>
  </View>;
}
/** The pressable around a label: the nearest node with a click handler. */
function of(label: string): i32 {
  for (let h = ui.find(label); h >= 0;) { const n = ui.inspectNode(h); if (n === null) return -1; if (n.onClick !== null) return h; h = n.parent; }
  return -1;
}
function dim(label: string): string { const d = ui.pressDim(of(label)); return d >= 1 ? 'full' : d <= 0.61 ? 'dimmed' : 'dimming'; }
function op(label: string): number { const n = ui.inspectNode(of(label)); return n === null ? -1 : Math.round(n.opacity * 100) / 100; }
let f = 0;
render(App, 0xffffff, (dt: number) => {
  f++;   // the script's frame n is this callback's f = n + 1
  if (f === 14) console.log(`A held: ${dim('A')}, presses '${presses}'`);
  if (f === 17) console.log(`A released: ${dim('A')}, presses '${presses}'`);
  if (f === 32) console.log(`A later: ${dim('A')}`);
  if (f === 53) console.log(`A held again: ${dim('A')}`);
  if (f === 68) console.log(`A dragged off, still held: ${dim('A')}`);
  if (f === 73) console.log(`A released off it: ${dim('A')}, presses '${presses}'`);
  if (f === 82) console.log(`B held: default ${dim('B')}, its opacity ${op('B')}`);
  if (f === 90) console.log(`B released: opacity ${op('B')}, presses '${presses}'`);
  if (f === 101) console.log(`C (disabled) held: ${dim('C')}, presses '${presses}'`);
  if (f === 116) console.log(`D held: default ${dim('D')}, its opacity ${op('D')}`);
  if (f === 122) console.log(`D released: opacity ${op('D')}, presses '${presses}'`);
  if (f === 128) ui.focusNode(of('A'));
  if (f === 137) console.log(`A by Enter: ${dim('A')}, presses '${presses}'`);
  if (f === 150) console.log(`A after Enter: ${dim('A')}`);
  if (f === 162) console.log(`A under a finger: ${dim('A')}`);
  if (f === 180) { console.log(`A after the finger: ${dim('A')}, presses '${presses}'`); ui.setPressFeedback(false); }
  if (f === 193) console.log(`feedback off, A held: ${dim('A')}`);
  if (f === 198) { console.log(`presses '${presses}'`); quit(); }
});
