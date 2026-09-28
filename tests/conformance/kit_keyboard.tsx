// zinc-test: skip ps1 esp32
// (~80 key nodes do not fit the 256 KiB / 160 KiB heaps of these profiles; ESP32 touch panels use smaller layouts)
// zinc:ui/kit Keyboard driven by the test hooks: taps type into the focused field through the real key path,
// shift is one-shot, a long press offers accents (slide, release), backspace deletes, the language key switches
// layouts, the numeric inputMode gets the digit pad, and pressing keys never takes the focus from the field.
import { createSignal, createNodeRef, render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';
import { Keyboard } from 'zinc:ui/kit';

const [text, setText] = createSignal<string>('');
const [digits, setDigits] = createSignal<string>('');
const field = createNodeRef(), pinField = createNodeRef();

function App(): i32 {
  return <View class="flex-col h-full">
    <View class="flex-row gap-2 p-2">
      <Input ref={field} class="grow" value={text()} onInput={(v: string) => setText(v)} />
      <Input ref={pinField} class="w-[80]" inputMode="numeric" value={digits()} onInput={(v: string) => setDigits(v)} />
    </View>
    <View class="grow" />
    <Keyboard layouts={['fr', 'en']} keyHeight={30} gap={3} />
  </View>;
}

/** Centre of the key whose caption is `label`. */
function keyAt(label: string): number[] {
  const b = ui.screenBox(ui.parentOf(ui.find(label)));
  return [b[0] + b[2] / 2, b[1] + b[3] / 2];
}
/** True when the node or one of its ancestors is hidden (the keyboard slid away). */
function hiddenUp(h: i32): boolean {
  for (let p = h; p >= 0; p = ui.parentOf(p)) { const n = ui.inspectNode(p); if (n !== null && n.hidden) return true; }
  return false;
}
function tap(label: string): void { const p = keyAt(label); ui.pointerAt(p[0], p[1], true); ui.pointerAt(p[0], p[1], false); }

let frame = 0, holdX = 0, holdY = 0;
render(App, 0xffffff, (dt: number) => {
  frame++;
  if (frame === 2) {
    ui.pointerAt(0, 0, false);
    ui.focusNode(field.node);
  }
  if (frame === 12) {   // the keyboard has slid in
    tap('b'); tap('o'); tap('n');
    tap('⇧'); tap('J');   // shifted page shows capitals; shift is one-shot
    tap('o');
    console.log('typed', text(), 'focus kept', ui.focused() === field.node);
    const p = keyAt('e'); holdX = p[0]; holdY = p[1];
    ui.pointerAt(holdX, holdY, true);   // long press: accents appear after ~0.4 s
  }
  if (frame === 40) {
    ui.pointerAt(holdX + 30, holdY - 40, true);   // slide onto the second variant
    ui.pointerAt(holdX + 30, holdY - 40, false);
    console.log('accent', text());
    tap('⌫');
    console.log('backspace', text());
    tap('EN');   // next layout: QWERTY, the space bar says English
    console.log('layout', ui.find('English') >= 0, ui.find('Français') >= 0);
    ui.focusNode(pinField.node);
  }
  if (frame === 44) {
    tap('4'); tap('2');
    console.log('digits', digits(), 'digit pad', ui.find('q') < 0);
    ui.focusNode(-1);
  }
  if (frame === 58) { console.log('hidden after blur', hiddenUp(ui.find('4'))); quit(); }
});
