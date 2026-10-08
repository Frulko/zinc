import * as gpio from 'zinc:gpio';
import { send } from 'zinc:osc';

gpio.setup(17, 'out', 'none');
gpio.setup(27, 'in', 'up');
gpio.watch(27, 'falling', 20, (e: gpio.PinEdge) => {
  gpio.write(17, 1);
  send('127.0.0.1', 9000, '/button', [e.pin, e.timestampMs]);
  console.log('button', e.pin);
});
console.log('waiting for the button on pin 27 (ZINC_GPIO_SCRIPT="27:0@500" simulates a press)');
