// Every part of a Sony PSP, one screen each (ZN-759): the buttons (d-pad, the four face buttons, L and R, START, SELECT), the analog nub, the
// sound (zinc:audio at 44.1 kHz), the 480x272 screen at 60 fps, and the system: battery, clock, the Wi-Fi switch, saving to the memory stick.
// A PSP has no second stick, no vibration, no touch and no motion sensor: the screens say so. START and SELECT move between the screens.
// Runs on a desktop too (`zinc run --simulate psp examples/hardware-psp`: the keyboard is the pad, the panel sets the battery and Wi-Fi).
import { GamepadButton as B } from 'zinc:gfx';
import { App, missing } from '../../hardware-kit/kit';
import { Spot, buttonsPage, sticksPage, soundPage, screenPage, systemPage } from '../../hardware-kit/pages';

const app = new App('PSP');
const buttons = buttonsPage([
  new Spot(B.Up, 'playstation_dpad_up', 64, 52, 'UP'), new Spot(B.Left, 'playstation_dpad_left', 26, 90, 'LEFT'),
  new Spot(B.Right, 'playstation_dpad_right', 102, 90, 'RIGHT'), new Spot(B.Down, 'playstation_dpad_down', 64, 128, 'DOWN'),
  new Spot(B.North, 'playstation_button_color_triangle', 382, 52, 'TRIANGLE'), new Spot(B.West, 'playstation_button_color_square', 344, 90, 'SQUARE'),
  new Spot(B.East, 'playstation_button_color_circle', 420, 90, 'CIRCLE'), new Spot(B.South, 'playstation_button_color_cross', 382, 128, 'CROSS'),
  new Spot(B.LeftShoulder, 'playstation_trigger_l1', 150, 34, 'L'), new Spot(B.RightShoulder, 'playstation_trigger_r1', 296, 34, 'R'),
  new Spot(B.Back, 'playstation3_button_select', 186, 140, 'SELECT'), new Spot(B.Start, 'playstation3_button_start', 260, 140, 'START'),
], false);
app.add('Buttons', (dt: number) => { buttons(dt); missing('No vibration motor in a PSP'); });
const nub = sticksPage(1);
app.add('Analog nub', (dt: number) => { nub(dt); missing('One analog nub: a PSP has no second stick'); });
app.add('Sound', soundPage('44100 Hz stereo: the PSP\'s own rate (its resampler is broken: only 44.1, 22.05 and 11.025 kHz)'));
app.add('Screen', screenPage('480x272 LCD, 60 Hz'));
const system = systemPage();
app.add('System', (dt: number) => { system(dt); missing('No touch screen, motion sensor or microphone in a PSP'); });
app.run();
