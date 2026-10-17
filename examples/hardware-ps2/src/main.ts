// Every part of a PlayStation 2, one screen each (ZN-759): the DualShock 2's buttons with how hard each is pressed (pressure-sensitive), both
// sticks and their clicks, both motors, the sound (zinc:audio through the SPU2), the memory card (save and load with zinc:storage) and the
// 640x448 picture. A PS2 has no battery, Wi-Fi, touch or motion sensor: the screens say so. START and SELECT move between the screens.
// On a desktop: `zinc run --simulate ps2 examples/hardware-ps2` (a gamepad gives the sticks and the motors; the keyboard the buttons).
import { GamepadButton as B } from 'zinc:gfx';
import { App, missing, say, k, DIM } from '../../hardware-kit/kit';
import { Spot, buttonsPage, sticksPage, soundPage, screenPage, systemPage } from '../../hardware-kit/pages';
import { vibrationPage, memcardPage } from '../../hardware-kit/more';

const app = new App('PlayStation 2');
const buttons = buttonsPage([
  new Spot(B.Up, 'playstation_dpad_up', 64, 52, 'UP'), new Spot(B.Left, 'playstation_dpad_left', 26, 90, 'LEFT'),
  new Spot(B.Right, 'playstation_dpad_right', 102, 90, 'RIGHT'), new Spot(B.Down, 'playstation_dpad_down', 64, 128, 'DOWN'),
  new Spot(B.North, 'playstation_button_color_triangle', 382, 52, 'TRIANGLE'), new Spot(B.West, 'playstation_button_color_square', 344, 90, 'SQUARE'),
  new Spot(B.East, 'playstation_button_color_circle', 420, 90, 'CIRCLE'), new Spot(B.South, 'playstation_button_color_cross', 382, 128, 'CROSS'),
  new Spot(B.LeftTrigger, 'playstation_trigger_l2', 150, 28, 'L2'), new Spot(B.LeftShoulder, 'playstation_trigger_l1', 190, 28, 'L1'),
  new Spot(B.RightShoulder, 'playstation_trigger_r1', 256, 28, 'R1'), new Spot(B.RightTrigger, 'playstation_trigger_r2', 296, 28, 'R2'),
  new Spot(B.Back, 'playstation3_button_select', 186, 100, 'SELECT'), new Spot(B.Start, 'playstation3_button_start', 260, 100, 'START'),
  new Spot(B.LeftStick, 'playstation_button_l3', 150, 150, 'L3'), new Spot(B.RightStick, 'playstation_button_r3', 296, 150, 'R3'),
], true);
app.add('Buttons and pressure', (dt: number) => { buttons(dt); say(0, 16 * k(), 232 * k(), 'the bars: how hard each button is pressed (the DualShock 2 measures 0 to 255)', DIM); });
app.add('Sticks', sticksPage(2));
app.add('Vibration', vibrationPage('', true));
app.add('Sound', soundPage('48000 Hz stereo through audsrv on the SPU2'));
app.add('Memory card', memcardPage());
app.add('Screen', screenPage('640x448 interlaced; PAL shows 640x512, the frame centred'));
const system = systemPage();
app.add('System', (dt: number) => { system(dt); missing('No battery, Wi-Fi, touch or motion sensor on a PS2'); });
app.run();
