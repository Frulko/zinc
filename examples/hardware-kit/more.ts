// The screens of the parts only some consoles have (ZN-759): touch screens, the Vita's rear pad, motion sensors, a pad's motors and pressure,
// the microphone, the memory card and the 3DS's stereoscopic screen. Each says on screen when the machine (or its emulator) gives nothing.
import { rect, rrect, width, height, drawImage, touchCount, touchX, touchY, touchId, pointerDown, pointerX, pointerY, gamepadRumble, GamepadButton } from 'zinc:gfx';
import { rearTouches, hasRearTouch, accelerometer, gyroscope, microphoneLevel, stereoDepth, setStereo, stereoEye, saveLocation } from 'zinc:hardware';
import { get, set, remove } from 'zinc:storage';
import { k, say, card, icon, img, held, value, pressed, beep, scale, missing, meter, readout, INK, DIM, ACCENT, GOOD, BAD, RULE } from './kit';

const COLORS: u32[] = [0xffc93c, 0x5ee38f, 0x54a0ff, 0xff6b9d, 0xff8a5c, 0x9b59b6, 0x1dd1a1, 0xfeca57, 0xc8d6e5, 0xff4d4d];

/** The front touch screen: every finger with its id, and the trail it paints. */
export function touchPage(what: string): (dt: number) => void {
  const trail: number[] = [];   // x, y, colour index
  let most = 0;
  return (dt: number) => {
    const s = k();
    const n = touchCount();
    most = Math.max(most, n);
    for (let i = 0; i < n; i++) { trail.push(touchX(i)); trail.push(touchY(i)); trail.push(touchId(i) % COLORS.length); }
    if (n === 0 && pointerDown()) { trail.push(pointerX()); trail.push(pointerY()); trail.push(0); }
    while (trail.length > 3 * 600) trail.splice(0, 3);
    if (pressed(GamepadButton.South)) trail.splice(0, trail.length);
    for (let i = 0; i < trail.length; i += 3) rrect(trail[i] - 3 * s, trail[i + 1] - 3 * s, 6 * s, 6 * s, 3 * s, COLORS[trail[i + 2]], 160);
    for (let i = 0; i < n; i++) {
      const x = touchX(i), y = touchY(i);
      icon('touch_finger_one', x - 16 * s, y - 30 * s, 32 * s, true);
      say(0, x + 14 * s, y - 8 * s, `#${touchId(i)} ${Math.round(x)},${Math.round(y)}`, INK);
    }
    say(1, 16 * s, 30 * s, `${n} finger${n === 1 ? '' : 's'} now, ${most} at most   ${what}`, INK);
    say(0, 16 * s, 46 * s, 'draw with several fingers at once; CROSS clears', DIM);
  };
}

/** The rear touch pad: each finger pushes a brick; where they are, mapped onto the screen. */
export function rearPage(): (dt: number) => void {
  const bx: number[] = [120, 240, 360], by: number[] = [130, 130, 130];
  return (dt: number) => {
    const s = k();
    const f = rearTouches();
    for (const t of f) {
      rrect(t.x - 14 * s, t.y - 14 * s, 28 * s, 28 * s, 14 * s, COLORS[t.id % COLORS.length], 120);
      for (let i = 0; i < bx.length; i++) if (Math.abs(t.x / s - bx[i]) < 30 && Math.abs(t.y / s - by[i]) < 20) { bx[i] = t.x / s; by[i] = t.y / s; }
    }
    for (let i = 0; i < bx.length; i++) drawImage(img(i === 1 ? 'element_blue_rectangle_glossy' : 'element_yellow_rectangle_glossy'), (bx[i] - 24) * s, (by[i] - 12) * s, 48 * s, 24 * s, 255, 0);
    say(1, 16 * s, 30 * s, `${f.length} finger${f.length === 1 ? '' : 's'} on the back`, INK);
    let line = '';
    for (const t of f) line += `#${t.id} ${Math.round(t.x)},${Math.round(t.y)}  `;
    say(0, 16 * s, 46 * s, line === '' ? 'touch the back of the console: your fingers move the bricks' : line, DIM);
    if (!hasRearTouch()) missing('No rear touch pad on this machine');
  };
}

/** The accelerometer and the gyroscope: a ball rolls with the tilt, the readings live. */
export function motionPage(emulatorNote: string): (dt: number) => void {
  let x = 240, y = 120, vx = 0, vy = 0;
  return (dt: number) => {
    const s = k(), w = width() / s;
    const a = accelerometer(), g = gyroscope();
    card(8 * s, 30 * s, (w - 16) * s, 120 * s);
    if (a !== null) {
      vx = (vx - a.x * 30 * dt) * 0.98; vy = (vy + a.y * 30 * dt) * 0.98;
      x += vx * dt; y += vy * dt;
      if (x < 20 || x > w - 20) { vx = -vx * 0.5; x = Math.max(20, Math.min(w - 20, x)); }
      if (y < 42 || y > 138) { vy = -vy * 0.5; y = Math.max(42, Math.min(138, y)); }
    }
    drawImage(img('ballGrey'), (x - 10) * s, (y - 10) * s, 20 * s, 20 * s, a === null ? 90 : 255, 0);
    if (a !== null) readout(16 * s, 158 * s, 'accelerometer', `${a.x.toFixed(2)}  ${a.y.toFixed(2)}  ${a.z.toFixed(2)} m/s²`);
    else missing('No accelerometer here');
    if (g !== null) readout(16 * s, 176 * s, 'gyroscope', `${g.x.toFixed(1)}  ${g.y.toFixed(1)}  ${g.z.toFixed(1)} °/s`);
    else missing('No gyroscope here');
    if (a !== null && Math.abs(a.x) + Math.abs(a.y) + Math.abs(a.z) < 0.01) missing(emulatorNote);
  };
}

/** The pad's motors (gamepadRumble: the big one with CROSS, the small one with CIRCLE, both with the pressure of R2 on a PS2). */
export function vibrationPage(note: string, pressure: boolean): (dt: number) => void {
  let asked = '';
  return (dt: number) => {
    const s = k();
    if (pressed(GamepadButton.South)) asked = `big motor: ${gamepadRumble(0, 1, 0, 400) ? 'asked' : 'no pad'}`;
    if (pressed(GamepadButton.East)) asked = `small motor: ${gamepadRumble(0, 0, 1, 400) ? 'asked' : 'no pad'}`;
    const r2 = pressure ? value(GamepadButton.RightTrigger) : 0;
    if (r2 > 0.05) { gamepadRumble(0, r2, r2 > 0.5 ? 1 : 0, 100); asked = `both, ${Math.round(r2 * 100)} %`; }
    icon('playstation_button_color_cross', 40 * s, 50 * s, 40 * s, held(GamepadButton.South));
    say(1, 90 * s, 62 * s, 'CROSS: the big motor for 0.4 s', INK);
    icon('playstation_button_color_circle', 40 * s, 100 * s, 40 * s, held(GamepadButton.East));
    say(1, 90 * s, 112 * s, 'CIRCLE: the small motor for 0.4 s', INK);
    if (pressure) { meter(90 * s, 150 * s, 200 * s, 8 * s, r2, ACCENT); say(0, 300 * s, 146 * s, 'R2: both, by its pressure', DIM); }
    say(1, 40 * s, 176 * s, asked === '' ? '-' : asked, GOOD);
    if (note !== '') missing(note);
  };
}

/** The microphone's level, with its last seconds drawn as bars. */
export function micPage(emulatorNote: string): (dt: number) => void {
  const levels: number[] = [];
  let loud = 0, silent = 0;
  return (dt: number) => {
    const s = k(), w = width() / s;
    const l = microphoneLevel();
    if (l < 0) { say(1, 16 * s, 30 * s, 'no microphone here', DIM); missing('No microphone on this machine'); return; }
    levels.push(l);
    if (levels.length > 120) levels.splice(0, 1);
    if (l > 0.5) { loud++; if (loud === 1) beep(scale(9), 'triangle'); } else loud = 0;
    card(8 * s, 30 * s, (w - 16) * s, 130 * s);
    const bw = (w - 32) / 120;
    for (let i = 0; i < levels.length; i++) rect((16 + i * bw) * s, (150 - levels[i] * 110) * s, Math.max(1, bw - 1) * s, levels[i] * 110 * s, levels[i] > 0.5 ? ACCENT : GOOD);
    readout(16 * s, 168 * s, 'level', `${Math.round(l * 100)} %`);
    if (l === 0) silent++; else silent = 0;
    say(0, 16 * s, 186 * s, 'speak or blow: a loud sound rings', DIM);
    if (emulatorNote !== '' && silent > 60) missing(emulatorNote);
  };
}

/** zinc:storage on the memory card: CROSS saves the time and a counter, CIRCLE reads them back, SQUARE erases them. */
export function memcardPage(): (dt: number) => void {
  let shown = 'CIRCLE reads what is saved';
  return (dt: number) => {
    const s = k();
    if (pressed(GamepadButton.South)) {
      const n = (get('card.saves') === '' ? 0 : parseInt(get('card.saves'))) + 1;
      const d = new Date();
      set('card.saves', '' + n);
      set('card.when', `${d.getHours()}:${d.getMinutes() < 10 ? '0' : ''}${d.getMinutes()}:${d.getSeconds() < 10 ? '0' : ''}${d.getSeconds()}`);
      shown = `saved: number ${n}`;
      beep(scale(4), 'triangle');
    }
    if (pressed(GamepadButton.East)) shown = get('card.saves') === '' ? 'nothing saved yet' : `read: ${get('card.saves')} saves, the last at ${get('card.when')}`;
    if (pressed(GamepadButton.West)) { remove('card.saves'); remove('card.when'); shown = 'erased'; }
    icon('playstation_button_color_cross', 30 * s, 40 * s, 30 * s, held(GamepadButton.South));
    say(1, 70 * s, 48 * s, 'CROSS saves', INK);
    icon('playstation_button_color_circle', 30 * s, 80 * s, 30 * s, held(GamepadButton.East));
    say(1, 70 * s, 88 * s, 'CIRCLE loads', INK);
    icon('playstation_button_color_square', 30 * s, 120 * s, 30 * s, held(GamepadButton.West));
    say(1, 70 * s, 128 * s, 'SQUARE erases', INK);
    say(2, 30 * s, 164 * s, shown, GOOD);
    say(0, 30 * s, 186 * s, `in ${saveLocation()}`, DIM);
  };
}

/** The 3DS's stereoscopic screen: two Kenney sprites at different depths, drawn per eye and shifted by the 3D slider. */
export function stereoPage(): (dt: number) => void {
  let t = 0, asked = false;
  return (dt: number) => {
    const s = k(), w = width() / s;
    const depth = stereoDepth();
    if (!asked) { asked = true; setStereo(true); }
    const eye = stereoEye();
    if (eye === 0) t += dt;   // the world moves on the left eye's frames only
    const shift = (eye === 0 ? -1 : 1) * Math.max(0, depth) * 6;   // near things apart, far ones together
    for (let i = 0; i < 12; i++) drawImage(img('particleSmallStar'), (20 + i * 31 - shift * 0.2) * s, (40 + (i * 37) % 120) * s, 10 * s, 10 * s, 140, 0);   // far
    drawImage(img('element_blue_rectangle_glossy'), (w / 2 - 70 + Math.sin(t) * 40) * s, 90 * s, 64 * s, 32 * s, 255, 0);   // the screen's depth
    drawImage(img('ballGrey'), (w / 2 + 20 + shift) * s, (70 + Math.cos(t) * 20) * s, 36 * s, 36 * s, 255, 0);   // in front
    readout(16 * s, 30 * s, '3D slider', depth < 0 ? 'none' : depth === 0 ? 'down (flat)' : `${Math.round(depth * 100)} %`);
    say(0, 16 * s, 172 * s, `this frame: the ${eye === 0 ? 'left' : 'right'} eye; the ball comes out of the screen, the stars go in`, DIM);
    if (depth < 0) missing('No stereoscopic screen here');
  };
}
