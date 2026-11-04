import { render } from 'zinc:ui/react';
import { View, TextInput } from 'zinc:react-native';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';

let submits = 0;
function byLabel(label: string): i32 {
  for (let h = 0; h < 400; h++) { const n = ui.inspectNode(h); if (n !== null && n.label === label) return h; }
  return -1;
}
function submitted(): void { submits++; }
function App(): i32 {
  return <View>
    <TextInput accessibilityLabel="single" onSubmitEditing={submitted} />
    <TextInput accessibilityLabel="keep" submitBehavior="submit" onSubmitEditing={submitted} />
    <TextInput accessibilityLabel="multi" multiline={true} onSubmitEditing={submitted} />
    <TextInput accessibilityLabel="multi-submit" multiline={true} submitBehavior="blurAndSubmit" onSubmitEditing={submitted} />
    <TextInput accessibilityLabel="legacy" blurOnSubmit={false} onSubmitEditing={submitted} />
    <TextInput accessibilityLabel="next" onSubmitEditing={() => { submits++; ui.focusNode(byLabel('multi')); }} />
  </View>;
}
let frame = 0;
render(App, 0xffffff, (dt: number): void => {
  frame++;
  if (frame === 2) { ui.focusNode(byLabel('single')); ui.sendKey('Enter'); console.log('single', ui.focused() === -1, submits); }
  if (frame === 3) { const h = byLabel('keep'); ui.focusNode(h); ui.sendKey('Enter'); console.log('keep', ui.focused() === h, submits); }
  if (frame === 4) { const h = byLabel('multi'); ui.focusNode(h); ui.sendKey('Enter'); console.log('multiline', ui.getValue(h) === '\n', submits); }
  if (frame === 5) { ui.focusNode(byLabel('multi-submit')); ui.sendKey('Enter'); console.log('multi-submit', ui.focused() === -1, submits); }
  if (frame === 6) { const h = byLabel('legacy'); ui.focusNode(h); ui.sendKey('Enter'); console.log('legacy', ui.focused() === h, submits); }
  if (frame === 7) { const h = byLabel('multi'); ui.focusNode(byLabel('next')); ui.sendKey('Enter'); console.log('next', ui.focused() === h, ui.getValue(h) === '\n', submits); }
  if (frame === 8) { const h = ui.createNode(ui.INPUT); ui.focusNode(h); ui.sendKey('Enter'); console.log('raw', ui.focused() === -1); }
  if (frame === 9) { ui.systemSignal('keyboard 200 250 2'); console.log('metadata', ui.keyboardInset(), ui.keyboardAnimationDuration(), ui.keyboardAnimationEasing()); ui.focusNode(byLabel('multi')); ui.systemSignal('imeaction done'); console.log('done', ui.focused() === -1, ui.getValue(byLabel('multi')) === '\n'); quit(); }
});
