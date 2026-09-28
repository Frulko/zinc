// Text fields in the React model: value + onChange (every edit, like React), password, readOnly, pointer handlers.
import { useState, useRef, MutableRef } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { quit, clipboardText } from 'zinc:gfx';

let refs: MutableRef<i32>[] = [];
let field = -1, secret = -1, hovered = 0;
function Form(): i32 {
  const [name, setName] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const a = useRef<i32>(-1), b = useRef<i32>(-1), c = useRef<i32>(-1);
  refs = [a, b, c];
  return <view class="flex-col p-2 gap-2">
    <input ref={a} value={name} onChange={(v: string) => setName(v.toUpperCase())} placeholder="Name" />
    <input ref={b} type="password" value={pin} onChange={(v: string) => setPin(v)} />
    <input ref={c} value="read only" readOnly={true} />
    <text onPointerEnter={(e: ui.PointerEvent) => { hovered++; }}>{name} / {pin.length}</text>
  </view>;
}
const root = ui.createNode(ui.VIEW);
const host = ui.createNode(ui.FRAGMENT);
ui.insert(root, host, -1);
ui.pointerAt(0, 0, false);
let f = 0;
ui.mount(root, 0x0f172a, (dt: number) => {
  f++;
  if (f === 1) {
    ui.insert(host, <Form />, -1);
  }
  if (f === 3) {
    field = refs[0].current; secret = refs[1].current;
    ui.typeText(field, 'zinc');
    ui.typeText(secret, '1234');
    ui.keyDown(secret, 'a', ui.META);
    ui.keyDown(-1, 'c', ui.META);
    ui.typeText(refs[2].current, 'x'); ui.keyDown(-1, 'Backspace');
    console.log('selected', ui.selectedText(secret), 'clipboard after copy from a password field', JSON.stringify(clipboardText()));
  }
  if (f === 5) {
    console.log(ui.dump());
    const t = ui.screenBox(field);
    ui.pointerAt(20, t[1] + t[3] * 3 + 30, false);
    ui.pointerAt(20, t[1] + t[3] * 3 + 31, false);
    console.log('value', ui.getValue(field), 'hovered', hovered);
    quit();
  }
});
