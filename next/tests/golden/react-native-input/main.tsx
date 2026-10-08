// zinc:react-native TextInput, Keyboard, KeyboardAvoidingView (ZN-367.02): scripted typing drives a controlled TextInput (onChangeText, maxLength 5,
// onSubmitEditing on Enter), the flags of secureTextEntry / editable / keyboardType reach the field, autoFocus focuses, Keyboard events follow the
// keyboard inset, KeyboardAvoidingView pads by it ('padding') or lifts ('position') and Keyboard.dismiss blurs.
import { useState } from 'zinc:ui/react';
import { render } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { View, Text, TextInput, Keyboard, KeyboardEvent, KeyboardAvoidingView } from 'zinc:react-native';
import { quit } from 'zinc:gfx';

const log: string[] = [];
let shown = '';
function App(): i32 {
  const [name, setName] = useState<string>('');
  shown = name;
  return <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, padding: 8, gap: 8 }}>
      <TextInput value={name} onChangeText={(t: string) => { setName(t); log.push(`change ${t}`); }} maxLength={5} placeholder="Name" autoFocus={true}
        onSubmitEditing={() => log.push('submit')} accessibilityLabel="name" />
      <TextInput secureTextEntry={true} keyboardType="number-pad" accessibilityLabel="pin" />
      <TextInput editable={false} defaultValue="fixed" multiline={true} accessibilityLabel="notes" />
      <Text>{name}</Text>
    </KeyboardAvoidingView>
    <KeyboardAvoidingView behavior="position" keyboardVerticalOffset={20} style={{ height: 40 }}><Text>footer</Text></KeyboardAvoidingView>
  </View>;
}
function byLabel(l: string): i32 { for (let h = 0; h < 400; h++) { const n = ui.inspectNode(h); if (n !== null && n.label === l) return h; } return -1; }
const sub = Keyboard.addListener('keyboardDidShow', (e: KeyboardEvent) => log.push(`did show ${e.endCoordinates.height}`));
Keyboard.addListener('keyboardDidHide', (e: KeyboardEvent) => log.push('did hide'));
let f = 0;
render(App, 0xffffff, (dt: number) => {
  f++;
  if (f === 2) {
    const name = byLabel('name'), pin = byLabel('pin'), notes = byLabel('notes');
    console.log(`autofocus ${ui.focused() === name}`);
    const pn = ui.inspectNode(pin) as ui.UiNode, nn = ui.inspectNode(notes) as ui.UiNode;
    console.log(`pin password ${(pn.ed as ui.Edit).password} mode ${pn.inputMode} | notes readOnly ${(nn.ed as ui.Edit).readOnly} multiline ${nn.tag === ui.TEXTAREA} value ${ui.getValue(notes)}`);
    ui.typeText(name, 'abc');
  }
  if (f === 3) { ui.typeText(byLabel('name'), 'defg'); }
  if (f === 4) { ui.sendKey('Enter'); console.log(`typed: ${log.join(' | ')} | field ${ui.getValue(byLabel('name'))} state ${shown}`); log.length = 0; ui.setKeyboardInset(300); }
  if (f === 7) {
    console.log(`keyboard: ${log.join(' | ')} visible ${Keyboard.isVisible()} height ${Keyboard.metrics().height}`);
    let pad = -1, lift = 0;
    for (let h = 0; h < 400; h++) { const n = ui.inspectNode(h); if (n !== null && n.pb === 300) pad = n.pb; if (n !== null && n.ty !== 0) lift = n.ty; }
    console.log(`avoiding: padding ${pad} lift ${lift}`);
    log.length = 0; Keyboard.dismiss(); ui.setKeyboardInset(0);
  }
  if (f === 9) { console.log(`dismissed: focus ${ui.focused()} ${log.join(' | ')}`); sub.remove(); quit(); }
});
