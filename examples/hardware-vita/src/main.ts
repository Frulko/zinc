// Every part of a PS Vita, one screen each (ZN-759): the buttons, both sticks, the front touch screen (multitouch), the rear touch pad, the
// accelerometer and gyroscope, the sound (zinc:audio at 48 kHz), the 960x544 screen, vibration (only a PS TV with a DualShock 3 has a motor) and
// the system: battery, clock, Wi-Fi, the cameras, saving. START and SELECT move between the screens.
// On a desktop: `zinc run --simulate vita examples/hardware-vita` (the mouse is the front screen, the right button or the panel's pad the rear
// one, the panel tilts it).
import { GamepadButton as B } from 'zinc:gfx';
import { device } from 'zinc:sys';
import { App, missing } from '../../hardware-kit/kit';
import { Spot, buttonsPage, sticksPage, soundPage, screenPage, systemPage } from '../../hardware-kit/pages';
import { touchPage, rearPage, motionPage, vibrationPage } from '../../hardware-kit/more';

const app = new App('PS Vita');
const buttons = buttonsPage([
  new Spot(B.Up, 'playstation_dpad_up', 64, 52, 'UP'), new Spot(B.Left, 'playstation_dpad_left', 26, 90, 'LEFT'),
  new Spot(B.Right, 'playstation_dpad_right', 102, 90, 'RIGHT'), new Spot(B.Down, 'playstation_dpad_down', 64, 128, 'DOWN'),
  new Spot(B.North, 'playstation_button_color_triangle', 382, 52, 'TRIANGLE'), new Spot(B.West, 'playstation_button_color_square', 344, 90, 'SQUARE'),
  new Spot(B.East, 'playstation_button_color_circle', 420, 90, 'CIRCLE'), new Spot(B.South, 'playstation_button_color_cross', 382, 128, 'CROSS'),
  new Spot(B.LeftShoulder, 'playstation_trigger_l1', 150, 34, 'L'), new Spot(B.RightShoulder, 'playstation_trigger_r1', 296, 34, 'R'),
  new Spot(B.Back, 'playstation3_button_select', 186, 140, 'SELECT'), new Spot(B.Start, 'playstation3_button_start', 260, 140, 'START'),
], false);
app.add('Buttons', buttons);
app.add('Sticks', sticksPage(2));
app.add('Front touch', touchPage('(the screen, multitouch)'));
app.add('Rear touch', rearPage());
app.add('Motion', motionPage('All zero: the emulator gives no motion (Vita3K reads a gamepad\'s sensors)'));
app.add('Sound', soundPage('48000 Hz stereo through a BGM port'));
app.add('Screen', screenPage('960x544 OLED (PCH-1000) or LCD (PCH-2000), 60 Hz'));
const shake = vibrationPage('No motor in a PS Vita: only a PS TV with a DualShock 3 vibrates', false);
app.add('Vibration', shake);
const system = systemPage();
app.add('System', (dt: number) => {
  system(dt);
  const cams = device('cameras');
  if (cams === '') missing('No cameras here');
  else if (cams.indexOf('true') < 0) missing('The cameras do not open (Vita3K gives none)');
  else missing(`Cameras: ${cams.indexOf('"front":true') >= 0 ? 'front' : ''} ${cams.indexOf('"back":true') >= 0 ? 'back' : ''} open (the picture is not shown here)`);
});
app.run();
