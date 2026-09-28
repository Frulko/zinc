// GPIO buttons (gpio_pin_map): each Raspberry Pi header pin (BOARD numbering) triggers an action string such as
// "K_SPACE", "+1" or "video.mp4"; main.ts decides what the action does.
import * as gpio from 'zinc:gpio';
import { setting, flag, log } from './config';

/** BOARD header pin -> BCM GPIO number (-1: power, ground or not a GPIO). */
const BOARD_TO_BCM: i32[] = [-1, -1, -1, 2, -1, 3, -1, 4, 14, -1, 15, 17, 18, 27, -1, 22, 23, -1, 24, 10, -1, 9, 25, 11, 8,
  -1, 7, 0, 1, 5, -1, 6, 12, 13, -1, 19, 16, 26, 20, -1, 21];

/** Parses `"11": 1, "13": "+1"` and watches each pin; a press calls `onAction` with the mapped action. */
export function watchButtons(onAction: (action: string) => void): void {
  const pullUp = flag('gpio_pin_mode');   // true: pull-up, button to ground
  for (const entry of setting('gpio_pin_map').split(',')) {
    const kv = entry.split(':');
    if (kv.length !== 2) continue;
    const pin = parseInt(kv[0].trim().replaceAll('"', ''));
    const action = kv[1].trim().replaceAll('"', '');
    if (isNaN(pin) || pin < 0 || pin >= BOARD_TO_BCM.length || BOARD_TO_BCM[pin] < 0) {
      console.warn(`looper: gpio pin ${kv[0].trim()} is not a BOARD GPIO pin`);
      continue;
    }
    const bcm = BOARD_TO_BCM[pin];
    gpio.setup(bcm, 'in', pullUp ? 'up' : 'down');
    gpio.watch(bcm, pullUp ? 'falling' : 'rising', 200, () => onAction(action));
    log(`gpio BOARD ${pin} (BCM ${bcm}) -> ${action}`);
  }
}
