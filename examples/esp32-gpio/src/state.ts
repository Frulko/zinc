// What the demo shows and its actions: the LED blinks until the button is pressed, then stays lit until the next press.
import { write, read } from 'zinc:gpio';
import { LED_PIN } from './constants';

export class State {
  blinking: boolean = true;
  led: boolean = false;
  presses: i32 = 0;
  readBack: u8 = 0;     // the pin's level as the chip reads it: proves the write reached the pin
  dirty: boolean = true;
}

export const state = new State();

export function setLed(on: boolean): void {
  state.led = on;
  write(LED_PIN, on ? 1 : 0);
  state.readBack = read(LED_PIN);
  state.dirty = true;
}

let toggles: i32 = 0;
export function tick(): void {
  if (!state.blinking) return;
  setLed(!state.led);
  if (++toggles <= 4) console.log('LED ' + (state.led ? 'on' : 'off') + ', the pin reads ' + state.readBack);
}

export function press(): void {
  state.presses++;
  state.blinking = !state.blinking;
  if (!state.blinking) setLed(true);
  console.log('button: press ' + state.presses + ', ' + (state.blinking ? 'blinking' : 'steady'));
}
