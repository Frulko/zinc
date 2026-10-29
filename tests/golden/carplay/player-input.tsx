import { render, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { KeyboardCapture, installKeyboardCapture } from '../../../examples/carplay/src/services/keyboard';
import { fitDisplay } from '../../../examples/carplay/src/services/display';
function check(ok: boolean, why: string): void { if (!ok) throw new Error(why); }
const field = createNodeRef();
const sent: string[] = [];
const capture = new KeyboardCapture((key: string) => { sent.push(key); }, (_active: boolean) => {});
let trackpad = false;
const handle = installKeyboardCapture(capture, () => { trackpad = !trackpad; });
function App(): i32 {
  return <View onKeyDown={handle}>
    <Input ref={field} value="abc" />
    <Button><Text>Debug control</Text></Button>
  </View>;
}
render(App, 0x0f172a, (_dt: number) => {});
ui.focusNode(field.node);
check(ui.focused() === -1, 'capture refuses Zinc field focus');
check(ui.keyDown(-1, 'Tab') && ui.keyDown(-1, 'Tab', ui.SHIFT), 'capture consumes Tab navigation');
check(sent.join(',') === 'ArrowRight,ArrowLeft', 'Tab moves CarPlay focus');
check(ui.keyDown(-1, 'ArrowDown') && ui.focused() === -1, 'arrows do not navigate Zinc UI');
check(ui.keyDown(-1, 'F7') && trackpad, 'F7 enables trackpad without Zinc navigation');
check(ui.keyDown(-1, 'F6') && !capture.active, 'F6 releases capture');
ui.focusNode(field.node);
check(ui.focused() === field.node, 'released UI accepts focus');
check(ui.keyDown(field.node, 'F7') && !trackpad && !capture.active, 'F7 disables trackpad while UI owns keyboard');
ui.select(field.node, 3, 3);
ui.keyDown(field.node, 'Backspace');
check(ui.getValue(field.node) !== 'abc', 'released field receives editing key');
const before = sent.length;
check(ui.keyDown(field.node, 'F6') && capture.active && ui.focused() === -1, 'F6 recaptures from field');
ui.keyDown(-1, 'Enter');
check(sent.length === before + 1 && sent[sent.length - 1] === 'Enter', 'recaptured Enter goes only to CarPlay');
check(!capture.key('c', false, true, false), 'OS shortcuts remain available');
const fitted = fitDisplay(1217, 592);
check(fitted !== null && fitted.width === 1216 && fitted.height === 592, 'CarPlay display follows available player ratio');
check(fitDisplay(400, 300) === null, 'undersized player does not renegotiate display');
console.log('carplay keyboard capture: ok');
