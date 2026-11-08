// Space and Enter press a focused Pressable until their release; the keys scroll a focused ScrollView.
import * as ui from 'zinc:ui';
import { Pressable, AppRegistry, View, Text, ScrollView } from 'zinc:react-native';
import { useRef, MutableRef } from 'zinc:ui/react';
const log: string[] = [];
let svRef: MutableRef<i32> | null = null;
function App(): i32 {
  const ref = useRef<i32>(-1);
  svRef = ref;
  return <View style={{ flex: 1 }}>
    <Pressable onPressIn={() => { log.push('in'); }} onPressOut={() => { log.push('out'); }} onPress={() => { log.push('press'); }}
      style={{ width: 100, height: 40 }}>{({ pressed }) => <Text>{pressed ? 'held' : 'idle'}</Text>}</Pressable>
    <ScrollView ref={ref} tabIndex={0} style={{ height: 100 }}><View style={{ height: 1000 }} /></ScrollView>
  </View>;
}
AppRegistry.registerComponent('main', () => App);
let f = 0;
const sv = (): i32 => { const r = svRef; return r !== null ? r.current : -1; };
const top = (): string => '' + Math.round(ui.scrollTop(sv()));
ui.addStepper((): void => {
  f++;
  if (f === 2) ui.keyDown(-1, 'Tab');
  if (f === 3) ui.keyDown(-1, ' ');
  if (f === 5) { log.push(ui.find('held') >= 0 ? 'shows held' : 'not held'); ui.keyUp(' '); }
  if (f === 7) { log.push(ui.find('idle') >= 0 ? 'shows idle' : 'stuck'); ui.keyDown(-1, 'Enter'); }
  if (f === 9) { log.push(ui.find('held') >= 0 ? 'held' : 'not held'); ui.keyUp('Enter'); }
  if (f === 11) ui.keyDown(sv(), 'ArrowDown');
  if (f === 40) { log.push('down ' + top()); ui.keyDown(sv(), 'PageDown'); }
  if (f === 70) { log.push('page ' + top()); ui.keyDown(sv(), 'End'); }
  if (f === 100) { log.push('end ' + top()); ui.keyDown(sv(), 'Home'); }
  if (f === 130) { log.push('home ' + top()); console.log('keys ' + log.join(',')); }
});
