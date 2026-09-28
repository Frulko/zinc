// ZINC_CHATAIGNE_DEMO=1: a few scripted gestures, for screenshots and the round-trip check (tools/fake-chataigne.mjs).
import { channels, toggles } from './state';
import { go, sendChat, sendXY, sendColor, sendToggle, sendFader } from './link';

class Step { constructor(public at: number, public run: () => void) {} }

const STEPS: Step[] = [
  new Step(0.9, () => sendChat('Hi Chataigne, ready for the show?')),
  new Step(1.4, () => sendFader(channels[2], 0.9)),
  new Step(1.6, () => sendXY(0.72, 0.64)),
  new Step(1.8, () => sendToggle(toggles[1], true)),
  new Step(2.0, () => sendColor(0x06b6d4)),
  new Step(2.2, () => go()),
  new Step(2.4, () => sendChat('go')),
];
let clock: number = 0, next: i32 = 0;

/** Called every frame while the demo runs. */
export function tickDemo(dt: number): void {
  clock += dt;
  while (next < STEPS.length && STEPS[next].at <= clock) STEPS[next++].run();
}
