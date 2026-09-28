// iot-panel: GPIO button → LED, a live sensor chart, telemetry and OSC, in the Solid model.
// ZINC_GPIO_SCRIPT="27:0@1000,27:1@1200" scripts presses; ZINC_TELEMETRY=udp://127.0.0.1:9999 + `zinc monitor`.
import { render } from 'zinc:ui/solid';
import { setupBoard, pollKeyboard } from './board';
import { sample } from './sensor';
import { App } from './app';

setupBoard();

render(App, 0xfafafa, (dt: number) => {
  sample(dt);
  pollKeyboard();
});
