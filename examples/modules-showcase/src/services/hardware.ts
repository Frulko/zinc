// zinc:gpio, zinc:events, zinc:telemetry: a button on pin 27 toggles an LED on pin 17 (simulated on desktops,
// real pins on a Pi or an ESP32); each toggle goes through a typed event bus into telemetry.
import { createSignal } from 'zinc:ui/solid';
import * as gpio from 'zinc:gpio';
import * as telemetry from 'zinc:telemetry';
import { Emitter } from 'zinc:events';

export const LED_PIN: u8 = 17, BUTTON_PIN: u8 = 27;

export const [ledOn, setLedOn] = createSignal<boolean>(false);
export const [lastEvent, setLastEvent] = createSignal<string>('');

const bus = new Emitter<string>();

function onButton(edge: gpio.PinEdge): void {
  const on = !ledOn();
  gpio.write(LED_PIN, on ? 1 : 0);
  setLedOn(on);
  bus.emit(`button → LED ${on ? 'on' : 'off'}`);
}

export function startHardware(secondsUp: () => number): void {
  gpio.setup(LED_PIN, 'out', 'none');
  gpio.setup(BUTTON_PIN, 'in', 'up');
  gpio.watch(BUTTON_PIN, 'falling', 20, onButton);
  bus.on((message: string) => {
    setLastEvent(message);
    telemetry.event('bus', message);
  });
  telemetry.expose('uptime', secondsUp);
}

/** A simulated press: the pin goes low, then high again. */
export function pressButton(): void {
  gpio.simulate(BUTTON_PIN, 0);
  gpio.simulate(BUTTON_PIN, 1);
}

/** Once a second. */
export function reportTick(tick: i32): void {
  telemetry.gauge('tick', tick);
}
