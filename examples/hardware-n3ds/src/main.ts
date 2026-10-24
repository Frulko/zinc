// Every part of a Nintendo 3DS, one screen each (ZN-759): the buttons (with ZL and ZR on a New 3DS), the circle pad and the New 3DS's C-stick, both
// screens (the bottom one is a zinc:gfx window: its stylus picks the screen and draws), the stereoscopic top screen following the 3D slider, the
// accelerometer and gyroscope, the microphone's level, the sound (ndsp, or CSND when the DSP firmware is missing) and the system: battery, clock,
// Wi-Fi, saving. START and SELECT, or a tap on the bottom screen, move between the screens.
// On a desktop: `zinc run --simulate n3ds examples/hardware-n3ds` (a second window is the bottom screen; the panel sets the slider, the tilt and
// the microphone).
import { GamepadButton as B, openWindow, clear, rrect, rect, width, height, pointerDown, pointerX, pointerY, gamepadName, gamepadConnected } from 'zinc:gfx';
import { App, missing, pressed, say, sayWidth, k, INK, DIM, ACCENT, CARD, RULE, BG } from '../../hardware-kit/kit';
import { Spot, buttonsPage, sticksPage, soundPage, screenPage, systemPage } from '../../hardware-kit/pages';
import { motionPage, micPage, stereoPage, objectPage } from '../../hardware-kit/more';

const app = new App('3DS');
const newModel = (): boolean => !gamepadConnected(0) || gamepadName(0).indexOf('New') >= 0;   // a desktop's keyboard has them all
const buttons = buttonsPage([
  new Spot(B.Up, 'switch_dpad_up', 64, 60, 'UP'), new Spot(B.Left, 'switch_dpad_left', 26, 98, 'LEFT'),
  new Spot(B.Right, 'switch_dpad_right', 102, 98, 'RIGHT'), new Spot(B.Down, 'switch_dpad_down', 64, 136, 'DOWN'),
  new Spot(B.North, 'switch_button_x', 382, 60, 'X'), new Spot(B.West, 'switch_button_y', 344, 98, 'Y'),
  new Spot(B.East, 'switch_button_a', 420, 98, 'A'), new Spot(B.South, 'switch_button_b', 382, 136, 'B'),
  new Spot(B.LeftShoulder, 'switch_button_l', 20, 28, 'L'), new Spot(B.LeftTrigger, 'switch_button_zl', 70, 28, 'ZL'),
  new Spot(B.RightTrigger, 'switch_button_zr', 370, 28, 'ZR'), new Spot(B.RightShoulder, 'switch_button_r', 420, 28, 'R'),
  new Spot(B.Back, 'switch_button_minus', 186, 140, 'SELECT'), new Spot(B.Start, 'switch_button_plus', 260, 140, 'START'),
], false);
app.add('Buttons', (dt: number) => { buttons(dt); if (!newModel()) missing('ZL and ZR are a New 3DS\'s: not on this one'); missing('No vibration motor in a 3DS'); });
const sticks = sticksPage(2, ['switch_stick_l', 'switch_stick_r']);
app.add('Circle pad', (dt: number) => { sticks(dt); if (!newModel()) missing('The C-stick (right) is a New 3DS\'s: not on this one'); });
// the bottom screen's drawing, shown on the top screen too
const strokes: number[] = [];
app.add('Touch screen', (dt: number) => {
  const s = k();
  say(1, 16 * s, 30 * s, 'Draw on the bottom screen with the stylus (a tap on a name changes the screen)', INK);
  rrect(40 * s, 50 * s, 320 * s * 1.2, 240 * s * 0.55, 6 * s, CARD, 255);
  for (let i = 0; i < strokes.length; i += 2) rect((40 + strokes[i] * 1.2) * s, (50 + strokes[i + 1] * 0.55) * s, 3 * s, 3 * s, ACCENT);
  say(0, 16 * s, 190 * s, `${strokes.length / 2} points; B clears`, DIM);
  if (pressed(B.South)) strokes.splice(0, strokes.length);
});
app.add('3D screen', stereoPage());
app.add('3D object', objectPage());
app.add('Motion', motionPage('All zero: give Azahar a motion source (its right mouse button drag, or a gamepad\'s sensors)'));
app.add('Microphone', micPage('Silence: the emulator\'s microphone is off (Azahar: Settings, Audio)'));
app.add('Sound', soundPage('22050 Hz stereo through the DSP (ndsp), or CSND when sdmc:/3ds/dspfirm.cdc is missing'));
app.add('Screen', screenPage('top 400x240 x2 eyes, 60 Hz'));
const system = systemPage();
app.add('System', (dt: number) => { system(dt); missing('No vibration motor in a 3DS'); });

// the bottom screen: the screens' names to tap, and the drawing pad
const bottom = openWindow('Bottom screen', 320, 240, (dt: number) => {
  clear(BG);
  const w = width(), cols = 3, bw = (w - 16) / cols, bh = 22;
  for (let i = 0; i < app.pages.length; i++) {
    const x = 6 + (i % cols) * (bw + 2), y = 6 + Math.floor(i / cols) * (bh + 2);
    rrect(x, y, bw, bh, 5, i === app.at ? ACCENT : CARD, 255);
    const t = app.pages[i].title;
    say(0, x + (bw - sayWidth(0, t)) / 2, y + 5, t, i === app.at ? BG : INK);
    if (pointerDown() && pointerX() >= x && pointerX() < x + bw && pointerY() >= y && pointerY() < y + bh) app.at = i;
  }
  const top = 6 + Math.ceil(app.pages.length / cols) * (bh + 2) + 4;
  rrect(6, top, w - 12, height() - top - 6, 6, CARD, 255);
  if (pointerDown() && pointerY() > top) { strokes.push(pointerX()); strokes.push(pointerY()); if (strokes.length > 2400) strokes.splice(0, 2); }
  for (let i = 0; i < strokes.length; i += 2) if (strokes[i + 1] > top) rect(strokes[i], strokes[i + 1], 3, 3, ACCENT);
  say(0, 12, height() - 18, pointerDown() ? `stylus ${Math.round(pointerX())}, ${Math.round(pointerY())}` : 'bottom screen: 320x240, touch', DIM);
});
if (bottom < 0) app.add('Bottom screen', (dt: number) => { missing('No second screen here'); });
app.run();
