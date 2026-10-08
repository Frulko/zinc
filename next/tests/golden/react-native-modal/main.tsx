// zinc:react-native Modal and Alert (ZN-367.04): a slide-up Modal shows over the app as a modal layer, animates in, and Escape asks onRequestClose, which
// hides it; Alert.alert shows a dialog whose buttons close it and call their onPress, Escape presses its cancel button.
import { useState } from 'zinc:ui/react';
import { render } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { View, Text, Modal, Alert } from 'zinc:react-native';
import { quit } from 'zinc:gfx';

const log: string[] = [];
let open: (v: boolean) => void = (v: boolean): void => {};
function App() {
  const [visible, setVisible] = useState(false);
  open = setVisible;
  return <View style={{ flex: 1, backgroundColor: '#f2f2f7', padding: 20 }}>
    <Text>app</Text>
    <Modal visible={visible} animationType="slide" onRequestClose={() => { log.push('request close'); setVisible(false); }} onShow={() => { log.push('show'); }}>
      <View style={{ padding: 40 }}><Text>inside the modal</Text></View>
    </Modal>
  </View>;
}
function y(text: string): number { const h = ui.find(text); return h < 0 ? -1 : Math.round(ui.screenBox(h)[1]); }
let f = 0;
render(App, 0xf2f2f7, (dt: number) => {
  f++;
  if (f === 2) { console.log(`closed: modal text ${y('inside the modal')} hidden`); open(true); }
  if (f === 6) console.log(`sliding: ${y('inside the modal') > 40 ? 'below its place' : 'already up'}`);
  if (f === 40) { console.log(`open: ${log.join(' ')}, text at ${y('inside the modal')}`); ui.sendKey('Escape'); }
  if (f === 42) { console.log(`after Escape: ${log.join(' ')}`); log.length = 0;
    Alert.alert('Delete draft?', 'This cannot be undone.', [{ text: 'Cancel', style: 'cancel', onPress: () => { log.push('cancel'); } }, { text: 'Delete', style: 'destructive', onPress: () => { log.push('delete'); } }]); }
  if (f === 44) { console.log(`alert shown: ${ui.find('Delete draft?') >= 0}`); ui.click(ui.find('Delete')); }
  if (f === 46) { console.log(`pressed Delete: ${log.join(' ')}, alert gone ${ui.find('Delete draft?') < 0}`); log.length = 0; Alert.alert('Sure?', '', [{ text: 'No', style: 'cancel', onPress: () => { log.push('no'); } }, { text: 'Yes', onPress: () => { log.push('yes'); } }]); }
  if (f === 48) ui.sendKey('Escape');
  if (f === 50) { console.log(`Escape on an alert: ${log.join(' ')}, gone ${ui.find('Sure?') < 0}`); Alert.alert('Saved'); }
  if (f === 52) { ui.click(ui.find('OK')); }
  if (f === 54) { console.log(`one-button alert closed by OK: ${ui.find('Saved') < 0}`); quit(); }
});
