// esp32-gpio: a LED that blinks and a button that stops and starts it, on zinc:gpio; the screen mirrors both and has its own button.
// `zinc run . --target esp32 --engine mquickjs` on the ESP32-2432S022, `--emulator` in esp32sim, or `zinc run .` on the computer, whose
// zinc:gpio is simulated (ZINC_GPIO_SCRIPT="35:0@1000,35:1@1100" presses the button).
import { setup, watch, PinEdge } from 'zinc:gpio';
import { onFrame, keep, pointerDown, pointerX, pointerY } from 'zinc:gfx';
import { BLINK_MS, BUTTON_H, BUTTON_PIN, BUTTON_W, BUTTON_X, BUTTON_Y, DEBOUNCE_MS, LED_PIN } from './constants';
import { press, setLed, state, tick } from './state';
import { draw } from './view';

setup(LED_PIN, 'out', 'none');
setup(BUTTON_PIN, 'in', BUTTON_PIN >= 34 ? 'none' : 'up');   // 34 to 39 have no internal pull: the resistor is wired
setLed(false);
setInterval(() => { tick(); }, BLINK_MS);
watch(BUTTON_PIN, 'falling', DEBOUNCE_MS, (e: PinEdge) => { press(); });

let wasDown: boolean = false;
onFrame((dt: number) => {
  const down = pointerDown() && pointerX() >= BUTTON_X && pointerX() < BUTTON_X + BUTTON_W && pointerY() >= BUTTON_Y && pointerY() < BUTTON_Y + BUTTON_H;
  if (down && !wasDown) press();
  if (down !== wasDown) state.dirty = true;
  wasDown = down;
  if (!state.dirty) { keep(); return; }
  state.dirty = false;
  draw(down);
});

console.log('esp32-gpio ready: LED on GPIO ' + LED_PIN + ', button on GPIO ' + BUTTON_PIN);
