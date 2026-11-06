#!/bin/sh
# Gesture and navigation state that a lost or out-of-order event used to leave behind (ZN-997, docs/reports/implicit-state-machines.md, lib/std):
# - ui: a long press that selected a word in a field ate its onPointerUp; a press that spanned the app going to the background still clicked;
#   the second finger of a pinch lifted first left the pointer finger unable to scroll;
# - navigation: a swipe or a back gesture that started during a pop kept the route; a push during a predictive back kept the shrink;
#   the sheet dragged down and the back key in one frame popped the screen under the modal too;
# - react-native: Pressable missed onPressOut on a tap within one frame; Alert's button ran twice;
# - kit: the keyboard's backspace repeated forever once its press was lost; the image viewer zoomed while it closed.
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
run() {   # file frames want
  got=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=$2 "$ZINC" run "$tmp/$1" 2>&1 | grep '^log' | tail -1)
  [ "$got" = "log $3" ] || { echo "$1: want 'log $3', got '$got'"; fail=1; }
}
cat > "$tmp/longpress.ts" <<'P'
import * as ui from 'zinc:ui';
const root = ui.createNode(ui.VIEW);
const wrap = ui.createNode(ui.VIEW);
ui.setClass(wrap, 'w-[200px] h-[60px] p-2');
const f = ui.createNode(ui.INPUT);
ui.setClass(f, 'w-[180px] h-[40px]');
ui.insert(wrap, f, -1); ui.insert(root, wrap, -1);
const log: string[] = [];
ui.onPointer(f, ui.PDOWN, (e: ui.PointerEvent) => { log.push('down'); });
ui.onPointer(f, ui.PUP, (e: ui.PointerEvent) => { log.push('up'); });
ui.onPointer(f, ui.PMOVE, (e: ui.PointerEvent) => { log.push('move'); });
let fr = 0;
ui.mount(root, 0xffffff, (dt: number) => {
  fr++;
  const b = ui.screenBox(f);
  const x = b[0] + 20, y = b[1] + 20;
  if (fr === 2) ui.touchAt(1, x, y, 0);
  if (fr === 60) ui.touchAt(1, x, y, 2);
  if (fr === 61) { ui.pointerAt(x + 30, y, false); console.log('log ' + log.join(',')); }
});
P
run longpress.ts 62 'move,down,up,move'
cat > "$tmp/background.ts" <<'P'
import * as ui from 'zinc:ui';
const root = ui.createNode(ui.VIEW);
const btn = ui.createNode(ui.VIEW);
ui.setClass(btn, 'w-[100px] h-[40px]');
ui.insert(root, btn, -1);
const log: string[] = [];
ui.listen(btn, () => { log.push('click'); });
ui.onPointer(btn, ui.PDOWN, (e: ui.PointerEvent) => { log.push('down'); });
ui.onPointer(btn, ui.PUP, (e: ui.PointerEvent) => { log.push('up'); });
ui.onPointer(btn, ui.PCANCEL, (e: ui.PointerEvent) => { log.push('cancel'); });
let fr = 0;
ui.mount(root, 0xffffff, (dt: number) => {
  fr++;
  if (fr !== 2) return;
  const b = ui.screenBox(btn);
  const x = b[0] + 20, y = b[1] + 20;
  ui.pointerAt(x, y, true, 2); ui.pointerAt(x, y, false, 2);   // a right click
  ui.pointerAt(x, y, true);
  ui.systemSignal('background');
  ui.systemSignal('foreground');
  ui.pointerAt(x, y, false);   // the press began before the app went away: no click
  ui.pointerAt(x, y, true); ui.pointerAt(x, y, false);   // a new click works
  console.log('log ' + log.join(','));
});
P
run background.ts 4 'down,up,down,cancel,down,up,click'
cat > "$tmp/pinch.ts" <<'P'
import * as ui from 'zinc:ui';
const root = ui.createNode(ui.VIEW);
const s = ui.createNode(ui.VIEW);
ui.setClass(s, 'w-[200px] h-[200px] overflow-scroll');
const c = ui.createNode(ui.VIEW);
ui.setClass(c, 'h-[900px]');
ui.insert(s, c, -1); ui.insert(root, s, -1);
const log: string[] = [];
ui.onPointer(c, ui.PPINCH, (e: ui.PointerEvent) => { log.push('pinch' + e.phase); });
let fr = 0;
ui.mount(root, 0xffffff, (dt: number) => {
  fr++;
  if (fr !== 2) return;
  const b = ui.screenBox(s);
  const x = b[0] + 50, y = b[1] + 150;
  ui.touchAt(1, x, y, 0);
  ui.touchAt(2, x + 60, y, 0);
  ui.touchAt(2, x + 90, y, 1);
  ui.touchAt(2, x + 90, y, 2);   // the second finger lifts first
  for (let k = 1; k <= 8; k++) ui.touchAt(1, x, y - k * 10, 1);
  ui.touchAt(1, x, y - 80, 2);
  console.log('log ' + log.join(',') + ' top ' + Math.round(ui.scrollTop(s)));
});
P
run pinch.ts 4 'pinch0,pinch1,pinch2 top 80'
cat > "$tmp/nav.tsx" <<'P'
import * as ui from 'zinc:ui';
import { render } from 'zinc:ui/react';
import { Stack, Navigation, Route } from 'zinc:ui/navigation';
let nav: Navigation | null = null;
function App(): i32 {
  return <Stack initial="a" style="android" renderScreen={(r: Route, n: Navigation) => { nav = n; return <Text>{r.name}</Text>; }} />;
}
function names(n: Navigation): string { return n.routes.map((r: Route): string => r.name + (r.modal ? '*' : '')).join(''); }
function ev(phase: i32, dx: number): ui.PointerEvent { const e = new ui.PointerEvent(); e.phase = phase; e.dx = dx; return e; }
const log: string[] = [];
let f = 0;
render(App, 0xffffff, (dt: number) => {
  f++;
  if (nav === null) return;
  const n = nav as Navigation;
  if (f === 3) { n.push('b'); n.finish(); n.push('c'); n.finish(); }
  if (f === 4) {   // a swipe that lands during a pop: the pop ends, the route goes
    n.pop(); n.swipe(ev(0, 0)); n.swipe(ev(2, 5)); n.finish(); log.push('swipe ' + names(n));
  }
  if (f === 5) {   // Android's back gesture that starts during a pop
    n.push('c'); n.finish(); n.pop(); n.signal('backstart', 'left'); n.finish(); log.push('backstart ' + names(n));
  }
  if (f === 6) {   // a push during a predictive back: no predictive shrink left on the push
    n.signal('backstart', 'left'); n.push('d'); log.push('push predictive ' + n.predictive); n.finish(); log.push(names(n));
  }
  if (f === 7) n.present('m');
  if (f === 9) { ui.goBack(); ui.goBack(); }   // the modal's back twice in a frame
  if (f === 12) { log.push('modal ' + names(n)); console.log('log ' + log.join(', ')); }
});
P
run nav.tsx 14 'swipe ab, backstart ab, push predictive false, abd, modal abd'
cat > "$tmp/sheet.tsx" <<'P'
import * as ui from 'zinc:ui';
import { render } from 'zinc:ui/react';
import { width, height } from 'zinc:gfx';
import { Stack, Navigation, Route } from 'zinc:ui/navigation';
let nav: Navigation | null = null;
function App(): i32 {
  return <Stack initial="a" style="ios" renderScreen={(r: Route, n: Navigation) => { nav = n; return <Text>{r.name}</Text>; }} />;
}
function names(n: Navigation): string { return n.routes.map((r: Route): string => r.name + (r.modal ? '*' : '')).join(''); }
let f = 0;
render(App, 0xffffff, (dt: number) => {
  f++;
  if (nav === null) return;
  const n = nav as Navigation;
  if (f === 3) { n.push('b'); n.finish(); n.present('m'); }
  if (f === 30) {   // the sheet dragged down past a quarter and the back key in the same frame: the modal closes, b stays
    const x = width() / 2, y = ui.safeArea()[0] + 22;
    ui.pointerAt(x, y, true);
    for (let k = 1; k <= 10; k++) ui.pointerAt(x, y + k * height() / 20, true);
    ui.pointerAt(x, y + height() / 2, false);
    ui.goBack();
  }
  if (f === 34) console.log('log ' + names(n) + ' kind ' + n.kind);
});
P
run sheet.tsx 36 'ab kind 0'
cat > "$tmp/rn.tsx" <<'P'
import * as ui from 'zinc:ui';
import { Pressable, Alert, AppRegistry, View, Text } from 'zinc:react-native';
const log: string[] = [];
function App(): i32 {
  return <View style={{ flex: 1 }}>
    <Pressable onPressIn={() => { log.push('in'); }} onPressOut={() => { log.push('out'); }} onPress={() => { log.push('press'); }}
      style={{ width: 100, height: 40 }}><Text>tap</Text></Pressable>
  </View>;
}
AppRegistry.registerComponent('main', () => App);
let f = 0;
ui.addStepper((): void => {
  f++;
  if (f === 3) { ui.pointerAt(20, 20, true); ui.pointerAt(20, 20, false); }   // down and up in one frame
  if (f === 5) Alert.alert('Sure?', '', [{ text: 'Cancel', style: 'cancel', onPress: () => { log.push('ok'); } }]);
  if (f === 8) { ui.goBack(); ui.goBack(); ui.sendKey('Escape'); ui.sendKey('Escape'); }
  if (f === 10) console.log('log ' + log.join(','));
});
P
run rn.tsx 12 'in,out,press,ok'
cat > "$tmp/keyboard.tsx" <<'P'
import * as ui from 'zinc:ui';
import { render } from 'zinc:ui/solid';
import { Keyboard } from 'zinc:ui/kit';
import { quit } from 'zinc:gfx';
const log: string[] = [];
function App(): i32 {
  return <View className="flex-col w-full h-full bg-white"><View className="absolute bottom-0 left-0 right-0"><Keyboard layouts={['en']} mode="always" preview={false} onKey={(k: string) => { log.push(k); }} /></View></View>;
}
let f = 0, bx: number = 0, by: number = 0;
render(App, 0xffffff, (dt: number) => {
  f++;
  if (f === 3) {   // backspace held, then the app goes to the background: the repeat stops
    const b = ui.screenBox(ui.find('⌫'));
    bx = b[0] + b[2] / 2; by = b[1] + b[3] / 2;
    ui.pointerAt(bx, by, true);
    ui.systemSignal('background'); ui.systemSignal('foreground');
  }
  if (f === 70) {   // held again, the finger slides off the key: the repeat stops
    ui.pointerAt(bx, by, true);
    ui.pointerAt(bx, by - 200, true);
  }
  if (f === 140) { ui.pointerAt(bx, by - 200, false); console.log('log ' + log.length + ' ' + log.join(',')); quit(); }
});
P
run keyboard.tsx 150 '2 Backspace,Backspace'
cat > "$tmp/viewer.ts" <<'P'
import * as ui from 'zinc:ui';
import { openImageViewer, closeImageViewer, imageViewerState } from 'zinc:ui/kit';
import { createImage, quit } from 'zinc:gfx';
const root = ui.createNode(ui.VIEW);
ui.mount(root, 0x112233, null);
const img = createImage(40, 40);
const wait = (ms: number): Promise<void> => new Promise<void>((resolve: () => void) => { setTimeout(resolve, ms); });
async function run(): Promise<void> {
  openImageViewer({ items: [{ image: img, width: 40, height: 40 }], index: 0 });
  await wait(350);
  ui.sendKey('+');
  const z0 = imageViewerState()[1];
  closeImageViewer();
  ui.sendKey('+'); ui.wheelAt(200, 150, 3);   // while it flies back
  console.log('log open ' + Math.round(z0 * 100) + ' closing ' + Math.round(imageViewerState()[1] * 100));
  quit();
}
run();
P
run viewer.ts 1000000 'open 150 closing 150'
[ $fail = 0 ] && echo "ui gesture state: ok"
exit $fail
