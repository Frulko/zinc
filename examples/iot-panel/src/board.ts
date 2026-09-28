// The board: a push button on pin 27 toggles an LED on pin 17. Each press is counted, sent to telemetry and
// announced over OSC. On macOS / Linux the pins are simulated (press X or the on-screen button); on a Pi they are
// real (libgpiod), wired button-to-ground with the internal pull-up.
import { createSignal } from 'zinc:ui/solid';
import { isDown, Btn } from 'zinc:gfx';
import * as gpio from 'zinc:gpio';
import * as telemetry from 'zinc:telemetry';
import { send } from 'zinc:osc';

export const LED_PIN: u8 = 17;
export const BUTTON_PIN: u8 = 27;
const OSC_HOST = '127.0.0.1', OSC_PORT: i32 = 9000;

export const [ledOn, setLedOn] = createSignal<boolean>(false);
export const [presses, setPresses] = createSignal<i32>(0);

/** Falling edge on the button (pressed): flip the LED and report it. */
function onButton(edge: gpio.PinEdge): void {
  const on = !ledOn();
  gpio.write(LED_PIN, on ? 1 : 0);
  setLedOn(on);
  setPresses(presses() + 1);
  telemetry.counter('button.presses', 1);
  send(OSC_HOST, OSC_PORT, '/panel/led', [on ? 1 : 0, edge.timestampMs]);
}

export function setupBoard(): void {
  gpio.setup(LED_PIN, 'out', 'none');
  gpio.setup(BUTTON_PIN, 'in', 'up');
  gpio.watch(BUTTON_PIN, 'falling', 20, onButton);   // 20 ms debounce
}

/** A full simulated press: the pin goes low (pressed) then high again. */
export function simulatePress(): void {
  gpio.simulate(BUTTON_PIN, 0);
  gpio.simulate(BUTTON_PIN, 1);
}

let keyWasDown = false;

/** The X key (pad B) holds the simulated button down; called every frame. */
export function pollKeyboard(): void {
  const down = isDown(Btn.B);
  if (down !== keyWasDown) gpio.simulate(BUTTON_PIN, down ? 0 : 1);
  keyWasDown = down;
}
