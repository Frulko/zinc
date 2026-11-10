import * as ui from 'zinc:ui';
import { createSignal, render } from 'zinc:ui/solid';
import { Dialog, Sheet } from 'zinc:ui/kit';

const [dialogOpen, showDialog] = createSignal(false), [sheetOpen, showSheet] = createSignal(false);
const motions = ['none', 'fade', 'scale', 'slide', 'slide-top', 'slide-left', 'slide-right'];
const layers: i32[] = [];
function App(): i32 {
  return <View className="w-full h-full"><Button aria-label="Outside">Outside</Button>
    <Dialog title="Dialog" open={dialogOpen} onOpenChange={showDialog}><Button>Dialog action</Button></Dialog>
    <Sheet title="Sheet" open={sheetOpen} onOpenChange={showSheet}><Button>Sheet action</Button></Sheet>
  </View>;
}
function find(h: i32, label: string): i32 {
  const n = ui.inspectNode(h); if (n === null) return -1;
  if (n.label === label) return h;
  for (const child of n.children) { const found = find(child, label); if (found >= 0) return found; }
  return -1;
}
function check(ok: boolean, message: string): void { if (!ok) throw new Error(message); }
function progress(want: number): void {
  for (const h of layers) check(ui.layerProgress(h) === want, 'layer progress ' + String(want));
}
let frame = 0, dialog: i32 = -1, sheet: i32 = -1, outside: i32 = -1;
ui.systemSignal('reducemotion 1');
ui.setAfterPaint(() => {
  frame++;
  if (frame === 1) {
    dialog = find(ui.rootNode(), 'Dialog'); sheet = find(ui.rootNode(), 'Sheet'); outside = find(ui.rootNode(), 'Outside');
    check(dialog >= 0 && sheet >= 0 && outside >= 0, 'kit nodes');
    ui.focusNode(outside);
    for (const motion of motions) {
      const h = ui.createNode(ui.VIEW); ui.setClass(h, 'absolute left-0 top-0 w-10 h-10'); ui.insert(ui.rootNode(), h, -1);
      ui.openLayer(h, { motion, duration: 340 }); layers.push(h);
    }
    showDialog(true);
  } else if (frame === 2) {
    progress(1); check(ui.layerProgress(dialog) === 1 && ui.hasFocusWithin(dialog), 'dialog open and focus');
    const box = ui.screenBox(dialog); check(box[2] > 0 && box[3] > 0, 'final geometry');
    showDialog(false);
  } else if (frame === 3) {
    check(ui.layerProgress(dialog) === 0 && ui.focused() === outside, 'dialog close and restore');
    showSheet(true);
  } else if (frame === 4) {
    check(ui.layerProgress(sheet) === 1 && ui.hasFocusWithin(sheet), 'sheet open and focus'); showSheet(false);
    for (const h of layers) ui.setNumber(h, 'hidden', 1);
  } else if (frame === 5) {
    progress(0); check(ui.layerProgress(sheet) === 0 && ui.focused() === outside, 'sheet close and restore');
    ui.systemSignal('reducemotion 0'); for (const h of layers) ui.setNumber(h, 'hidden', 0);
  } else if (frame === 7) {
    for (let i = 1; i < layers.length; i++) check(ui.layerProgress(layers[i]) > 0 && ui.layerProgress(layers[i]) < 1, 'motion restored');
    ui.systemSignal('reducemotion 1');
  } else if (frame === 8) {
    progress(1); ui.systemSignal('reducemotion 0'); for (const h of layers) ui.setNumber(h, 'hidden', 1);
  } else if (frame === 10) {
    for (let i = 1; i < layers.length; i++) check(ui.layerProgress(layers[i]) > 0 && ui.layerProgress(layers[i]) < 1, 'animated close');
    ui.systemSignal('reducemotion 1');
  } else if (frame === 11) {
    progress(0); for (const h of layers) ui.setNumber(h, 'hidden', 0); showDialog(true);
  } else if (frame === 12) {
    progress(1); check(ui.layerProgress(dialog) === 1 && ui.hasFocusWithin(dialog), 'reopen'); showDialog(false);
    for (const h of layers) { ui.closeLayer(h); check(ui.layerProgress(h) === -1, 'layer cleanup'); ui.destroy(h); }
  } else if (frame === 13) {
    check(ui.focused() === outside && ui.domLayers().length === 0, 'focus and backdrop cleanup');
    console.log('layer reduced motion: ok'); ui.setAfterPaint(null);
  }
});
render(App, 0xffffff, null);
