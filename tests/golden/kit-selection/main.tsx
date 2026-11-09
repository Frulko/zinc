import * as ui from 'zinc:ui';
import { icon } from 'zinc:icons';
import { createNodeRef, createSignal, render } from 'zinc:ui/solid';
import { Checkbox, Switch, RadioGroup, Slider, RangeSlider, Chips, Rating, useQuietTheme } from 'zinc:ui/kit';
useQuietTheme();
const root = createNodeRef(), scroll = createNodeRef();
const [checked, setChecked] = createSignal(false);
const [mixed, setMixed] = createSignal(true);
const [enabled, setEnabled] = createSignal(false);
const [choice, setChoice] = createSignal('a');
const [value, setValue] = createSignal(3);
const [gesture, setGesture] = createSignal(20);
const [low, setLow] = createSignal(20);
const [high, setHigh] = createSignal(80);
const [chips, setChips] = createSignal<string[]>([]);
const [rating, setRating] = createSignal(2);
let frame = 0;
function App(): i32 {
  return <View ref={root} className="p-4 gap-4 w-[500px]">
    <ScrollView ref={scroll} className="h-[40px]"><View className="gap-8"><Slider accessibilityLabel="Gesture" value={gesture} onChange={setGesture} /><View className="h-[180px]" /></View></ScrollView>
    <Checkbox label="Mixed" checked={checked} indeterminate={mixed} onChange={(next: boolean) => { setMixed(false); setChecked(next); }} />
    <Checkbox label="Locked" checked={() => true} onChange={(next: boolean) => { throw new Error('disabled activated'); }} disabled={true} />
    <Switch label="Notifications" checked={enabled} onChange={setEnabled} />
    <RadioGroup label="Delivery" value={choice} onChange={setChoice} items={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B', disabled: true }, { value: 'c', label: 'C' }]} />
    <Slider accessibilityLabel="Offset" min={3} max={12} step={2} value={value} onChange={setValue} />
    <RangeSlider accessibilityLabel="Range" low={low} high={high} onChange={(lo: number, hi: number) => { setLow(lo); setHigh(hi); }} />
    <Chips label="Media" items={[{ value: 'audio', label: 'Audio' }]} value={chips} onChange={setChips} />
    <Rating label="Review" value={rating} onChange={setRating} />
  </View>;
}
function find(h: i32, label: string): i32 {
  const node = ui.inspectNode(h);
  if (node === null) return -1;
  if (node.label === label) return h;
  for (const child of node.children) { const found = find(child, label); if (found >= 0) return found; }
  return -1;
}
function control(label: string): i32 {
  const node = find(root.node, label);
  if (node < 0) throw new Error('missing control: ' + label);
  return node;
}
function rail(label: string): i32 {
  let h = control(label);
  while (h >= 0) {
    const node = ui.inspectNode(h);
    if (node === null) break;
    const handlers = node.hs;
    if (handlers !== null && handlers.down !== null) return h;
    h = node.parent;
  }
  throw new Error('missing slider rail');
}
render(App, 0xf2f2f2, (dt: number) => {
  frame++;
  if (frame === 2) {
    const outlined = icon('star', 0x333333), filled = icon('star', 0x333333, 2, true);
    if (outlined === null || filled === null || !filled.ok || outlined === filled) throw new Error('filled icon must retain its own parsed variant');
    ui.keyDown(control('Mixed'), ' ');
  }
  if (frame === 3) {
    ui.keyUp(' ');
    if (!checked() || mixed()) throw new Error('mixed checkbox');
    ui.click(control('Locked'));
    ui.keyDown(control('Notifications'), 'Enter');
  }
  if (frame === 4) {
    ui.keyUp('Enter');
    if (!enabled()) throw new Error('switch keyboard');
    ui.keyDown(control('A'), 'ArrowRight');
    if (ui.focused() !== control('C') || choice() !== 'c') throw new Error('radio disabled skip/focus');
    ui.keyDown(control('Offset'), 'ArrowUp', ui.SHIFT);
    ui.keyDown(control('Range minimum'), 'End');
    ui.keyDown(control('Range maximum'), 'Home');
    ui.keyDown(control('Audio'), 'Enter');
  }
  if (frame === 5) {
    ui.keyUp('Enter');
    if (value() !== 12 || low() !== 80 || high() !== 80 || chips().length !== 1) throw new Error('slider/range/chip state');
    ui.keyDown(control('2 of 5'), 'ArrowRight');
  }
  if (frame === 6) {
    if (rating() !== 3) throw new Error('rating arrow');
    ui.systemSignal('reducemotion 1');
    ui.keyDown(control('3 of 5'), 'Delete');
    ui.keyDown(control('Offset'), 'Home');
    ui.keyDown(control('C'), 'ArrowRight');
  }
  if (frame === 7) {
    if (rating() !== 0 || value() !== 3 || choice() !== 'a') throw new Error('clear/home/radio wrap');
  }
  if (frame === 8) {
    const thumb = ui.screenBox(control('Gesture'));
    const x = thumb[0] + thumb[2] / 2, y = thumb[1] + thumb[3] / 2;
    ui.touchAt(41, x, y, 0); ui.touchAt(41, x, y + 30, 1); ui.touchAt(41, x, y + 30, 2);
    if (gesture() !== 20) throw new Error('scroll cancel changed slider');
    ui.scrollTo(scroll.node, 0, 0);
    ui.pointerAt(x + 30, y, true); ui.pointerAt(x + 100, y, true); ui.pointerAt(x + 100, y, false);
    if (gesture() <= 20) throw new Error('slider did not restart after cancel');
    const box = ui.screenBox(rail('Offset'));
    ui.pointerAt(box[0] + box[2] / 2, box[1] + box[3] / 2, true);
    ui.pointerAt(box[0] + box[2] / 2, box[1] + box[3] / 2, false);
    if (value() !== 7) throw new Error('pointer step must start at min');
    console.log('selection: ok');
  }
});
