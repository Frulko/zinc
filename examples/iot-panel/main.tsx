// iot-panel: GPIO button -> LED, live sensor curve, telemetry and OSC, in the Solid model.
// On macOS/Linux the board is simulated (DEV-09): press X (or click "press button") to pull pin 27 low.
// ZINC_GPIO_SCRIPT="27:0@1000,27:1@1200" scripts presses; ZINC_TELEMETRY=udp://127.0.0.1:9999 + `zinc monitor`.
import { createSignal, render } from 'zinc:ui/solid';
import { rect, line, isDown, Btn } from 'zinc:gfx';
import * as gpio from 'zinc:gpio';
import * as telemetry from 'zinc:telemetry';
import { send } from 'zinc:osc';

const LED: u8 = 17, BUTTON: u8 = 27;
const [led, setLed] = createSignal<boolean>(false);
const [presses, setPresses] = createSignal<i32>(0);
const [temp, setTemp] = createSignal<number>(21);
const history: number[] = [];
let time = 0;

gpio.setup(LED, 'out', 'none');
gpio.setup(BUTTON, 'in', 'up');
gpio.watch(BUTTON, 'falling', 20, (e: gpio.PinEdge) => {
  const on = !led();
  gpio.write(LED, on ? 1 : 0);
  setLed(on);
  setPresses(presses() + 1);
  telemetry.counter('button.presses', 1);
  send('127.0.0.1', 9000, '/panel/led', [on ? 1 : 0, e.timestampMs]);
});
telemetry.expose('temperature', () => temp());

function Chart(x: i32, y: i32, w: i32, h: i32): void {
  rect(x, y, w, h, 0x0b1220);
  for (let i = 1; i < history.length; i++) {
    const x0 = x + (i - 1) * w / 120, x1 = x + i * w / 120;
    const y0 = y + h - (history[i - 1] - 15) * h / 15, y1 = y + h - (history[i] - 15) * h / 15;
    line(x0, y0, x1, y1, 0x22d3ee);
  }
}

function App(): i32 {
  return <view class="flex-col h-full p-2 gap-2 bg-slate-900">
    <text class="text-lg text-amber-400">IoT panel</text>
    <view class="flex-row gap-2 items-center">
      <view class="w-4 h-4" bg={led() ? 0x22c55e : 0x334155}></view>
      <text>LED {led() ? 'on' : 'off'} - {presses()} press(es)</text>
    </view>
    <view class="flex-row gap-2">
      <button onClick={() => { gpio.simulate(BUTTON, 0); gpio.simulate(BUTTON, 1); }}><text>press button</text></button>
      <text class="text-cyan-400">temp {temp().toFixed(1)} C</text>
    </view>
    <canvas class="grow" onDraw={Chart}></canvas>
  </view>;
}

let wasX = false;
render(App, 0x0f172a, (dt: number) => {
  time += dt;
  const v = 21 + Math.sin(time * 1.3) * 3 + Math.sin(time * 5.1) * 0.6;
  setTemp(v);
  history.push(v);
  if (history.length > 120) history.shift();
  const x = isDown(Btn.B);
  if (x !== wasX) gpio.simulate(BUTTON, x ? 0 : 1);
  wasX = x;
});
