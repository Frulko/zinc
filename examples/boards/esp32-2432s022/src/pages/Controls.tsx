// Controls: the input widgets on one scrolling page (drag it: inertial scrolling). Buttons, sliders, switches,
// check boxes, radio buttons, a spinner with a progress bar, and a PIN keypad.
import { createSignal, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { rrect, font, drawText, textWidth } from 'zinc:gfx';
import { Button, Slider, Switch } from 'zinc:ui/kit';
import { Panel, Caption, Checkbox, Radio, tk, rgb } from '../components/ui';
import { drawSync } from '../draw/widgets';
import { Tween, easeOut } from '../app/motion';

// state lives at module level: it survives the page being unmounted while another page is shown
const [taps, setTaps] = createSignal<i32>(0);
const [volume, setVolume] = createSignal<number>(60);
const [warmth, setWarmth] = createSignal<number>(40);
const [wifi, setWifi] = createSignal<boolean>(true);
const [bluetooth, setBluetooth] = createSignal<boolean>(false);
const [notify, setNotify] = createSignal<boolean>(true);
const [autoUpdate, setAutoUpdate] = createSignal<boolean>(false);
const [quality, setQuality] = createSignal<i32>(1);
const QUALITY: string[] = ['Low', 'Medium', 'High'];

/** Sync progress 0..1 for the spinner card; loops every 4 s. */
let sync: number = 0;
export function stepControls(dt: number): void { sync = (sync + dt / 4) % 1; }

// ---- PIN keypad: type 2432 (the board's name) to unlock
const PIN: string = '2432';
const [pin, setPin] = createSignal<string>('');
const [unlocked, setUnlocked] = createSignal<boolean>(false);
const shake = new Tween(0);   // 1 → 0 after a wrong code: the dots wobble
const KEYS: string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'];

function press(k: string): void {
  if (k === 'C') { setPin(''); setUnlocked(false); return; }
  if (k === 'OK') {
    if (pin() === PIN) setUnlocked(true);
    else { shake.snap(1); shake.to(0, 0.5, easeOut); setPin(''); }
    return;
  }
  if (pin().length < 4) setPin(pin() + k);
}

// The keypad is one canvas that draws the 12 keys and finds the key under the finger, like LVGL's lv_buttonmatrix:
// 1 node instead of 25, which matters with ~160 KiB of heap for the whole UI.
const COLS: i32 = 3, KEY_H: number = 32, GAP: number = 6, DOTS_H: number = 26;
const keypad = createNodeRef();
const flash = new Tween(0);     // the last key pressed glows, 1 → 0
let flashKey: i32 = -1;
let keyFont: i32 = -1;
let upX: number = 0, upY: number = 0;

function keyAt(px: number, py: number): i32 {
  const box = ui.screenBox(keypad.node);
  const x = px - box[0], y = py - box[1] - DOTS_H;
  if (x < 0 || y < 0 || x >= box[2]) return -1;
  const kw = (box[2] - GAP * (COLS - 1)) / COLS;
  const col: i32 = Math.floor(x / (kw + GAP)), row: i32 = Math.floor(y / (KEY_H + GAP));
  if (x - col * (kw + GAP) > kw || y - row * (KEY_H + GAP) > KEY_H || row > 3) return -1;   // in a gap
  return row * COLS + col;
}

function drawKeypad(x: number, y: number, w: number, h: number, accent: u32, key: u32, text: u32, idle: u32): void {
  if (keyFont < 0) keyFont = font('sans-bold', 16);
  // PIN dots, wobbling after a wrong code
  const wob = Math.sin(shake.get() * 25) * 8 * shake.get();
  for (let i = 0; i < 4; i++) {
    const c: u32 = unlocked() ? 0x10b981 : i < pin().length ? accent : idle;
    rrect(x + w / 2 - 36 + i * 20 + wob, y + 7, 12, 12, 6, c, 255);
  }
  const kw = (w - GAP * (COLS - 1)) / COLS;
  for (let i = 0; i < KEYS.length; i++) {
    const kx = x + (i % COLS) * (kw + GAP), ky = y + DOTS_H + Math.floor(i / COLS) * (KEY_H + GAP);
    const ok = KEYS[i] === 'OK';
    rrect(kx, ky, kw, KEY_H, 8, ok ? accent : key, 255);
    if (i === flashKey && flash.get() > 0) rrect(kx, ky, kw, KEY_H, 8, 0xffffff, Math.round(flash.get() * 90));
    const lw = textWidth(keyFont, KEYS[i], 0);
    drawText(keyFont, kx + (kw - lw) / 2, ky + 7, KEYS[i], ok ? 0xffffff : text, 255, 0);
  }
}

/** Screen centre of the key `label` (the scripted keypad check in main.tsx). */
export function keyCenter(label: string): number[] {
  const box = ui.screenBox(keypad.node), i = KEYS.indexOf(label);
  const kw = (box[2] - GAP * (COLS - 1)) / COLS;
  return [box[0] + (i % COLS) * (kw + GAP) + kw / 2, box[1] + DOTS_H + Math.floor(i / COLS) * (KEY_H + GAP) + KEY_H / 2];
}
export function isUnlocked(): boolean { return unlocked(); }

function Keypad(): i32 {
  // the release position comes from onPointerUp (it fires just before onClick); a handler for pointer-up only
  // keeps drag-to-scroll working over the keypad, and onClick is not sent after a drag
  return <Canvas ref={keypad} class={`h-[176] focus:bg-${tk().card}`}
    onPointerUp={(e: ui.PointerEvent) => { upX = e.gx; upY = e.gy; }}
    onClick={() => {
      const k = keyAt(upX, upY);
      if (k < 0) return;
      flashKey = k; flash.snap(1); flash.to(0, 0.3, easeOut);
      press(KEYS[k]);
    }}
    onDraw={(x: i32, y: i32, w: i32, h: i32) => drawKeypad(x, y, w, h, rgb(tk().accent), rgb(tk().muted), rgb(tk().foreground), rgb(tk().input))} />;
}

export function Controls(): i32 {
  return <ScrollView class="grow">
    <View class="flex-col gap-3 p-2 pb-4">
      <Panel class="p-3 gap-2">
        <View class="flex-row items-center justify-between">
          <Caption text="BUTTONS" />
          <View class={`px-2 py-0.5 rounded-md bg-${tk().accentSoft}`}>
            <Text class={`text-xs font-semibold text-${tk().accentSoftForeground}`}>{`${taps()} taps`}</Text>
          </View>
        </View>
        <View class="flex-row gap-2">
          <Button label="Tap me" size="sm" class="grow" onClick={() => setTaps(taps() + 1)} />
          <Button label="Reset" size="sm" variant="outline" onClick={() => setTaps(0)} />
          <Button label="Del" size="sm" variant="destructive" onClick={() => setTaps(Math.max(0, taps() - 1))} />
        </View>
      </Panel>

      <Panel class="p-3 gap-2">
        <Caption text="SLIDERS" />
        <View class="flex-row items-center justify-between">
          <Text class={`text-xs text-${tk().foreground}`}>Volume</Text>
          <Text class={`text-xs font-semibold text-${tk().mutedForeground}`}>{`${Math.round(volume())} %`}</Text>
        </View>
        <Slider value={volume} onChange={setVolume} min={0} max={100} step={1} />
        <View class="flex-row items-center justify-between">
          <Text class={`text-xs text-${tk().foreground}`}>Warmth (steps of 10)</Text>
          <Text class={`text-xs font-semibold text-${tk().mutedForeground}`}>{`${Math.round(warmth())}`}</Text>
        </View>
        <Slider value={warmth} onChange={setWarmth} min={0} max={100} step={10} />
      </Panel>

      <Panel class="p-3 gap-2">
        <Caption text="TOGGLES" />
        <View class="flex-row justify-between">
          <Switch checked={wifi} onChange={setWifi} label="Wi-Fi" />
          <Switch checked={bluetooth} onChange={setBluetooth} label="Bluetooth" />
        </View>
        <Checkbox checked={notify} onChange={setNotify} label="Notifications" />
        <Checkbox checked={autoUpdate} onChange={setAutoUpdate} label="Automatic updates" />
        <Caption text="QUALITY" />
        <View class="flex-row justify-between">
          {QUALITY.map((q: string, i: i32) => <Radio selected={() => quality() === i} onSelect={() => setQuality(i)} label={q} />)}
        </View>
      </Panel>

      <Panel class="p-3 gap-2">
        <Caption text="ACTIVITY" />
        <Canvas class="h-9" onDraw={(x: i32, y: i32, w: i32, h: i32) =>
          drawSync(x, y, w, h, sync, rgb(tk().accent), rgb(tk().muted), rgb(tk().foreground), rgb(tk().mutedForeground))} />
      </Panel>

      <Panel class="p-3 gap-2">
        <View class="flex-row items-center justify-between">
          <Caption text="KEYPAD" />
          <Text class={`text-[10px] text-${unlocked() ? 'emerald-500' : tk().mutedForeground}`}>{unlocked() ? 'Unlocked' : 'Code: 2432'}</Text>
        </View>
        <Keypad />
      </Panel>
    </View>
  </ScrollView>;
}
