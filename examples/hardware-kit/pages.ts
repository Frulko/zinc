// The screens the console demos share (ZN-759): buttons, sticks, sound, the screen itself and the system (battery, clock, network, saving).
// Each takes what differs per console (where the buttons sit, how many sticks, the rate of the sound) and draws in the PSP's 480x272 layout,
// scaled to the screen (kit.k()).
import { rect, rrect, width, height, drawImage, line, GamepadButton, GamepadAxis, frame } from 'zinc:gfx';
import { tone, Sound, Wave, backend } from 'zinc:audio';
import { battery, network, saveLocation } from 'zinc:hardware';
import { get, set } from 'zinc:storage';
import { platform } from 'zinc:sys';
import { k, say, sayWidth, card, icon, img, held, value, pressed, axis, beep, scale, missing, top, stick, meter, readout, INK, DIM, ACCENT, GOOD, BAD, RULE, CARD } from './kit';

/** A button of the buttons screen: which one (W3C order), its Kenney icon, its place in the 480x272 layout, its name. */
export class Spot {
  b: i32; name: string; icon: string; x: number; y: number;
  constructor(b: i32, icon: string, x: number, y: number, name: string) { this.b = b; this.icon = icon; this.x = x; this.y = y; this.name = name; }
}

/** Every button lit while held, a note each (a scale over the buttons), the presses counted; `pressure` draws each button's value under it. */
export function buttonsPage(spots: Spot[], pressure: boolean): (dt: number) => void {
  let presses = 0;
  let last = '';
  return (dt: number) => {
    const s = k();
    let names = '';
    for (let i = 0; i < spots.length; i++) {
      const p = spots[i];
      const on = held(p.b);
      const size = 34 * s;
      if (on) rrect(p.x * s - 3 * s, p.y * s - 3 * s, size + 6 * s, size + 6 * s, 8 * s, ACCENT, 90);
      icon(p.icon, p.x * s, p.y * s, size, on);
      if (pressure) meter(p.x * s, p.y * s + size + 2 * s, size, 4 * s, value(p.b), GOOD);
      if (on) names += (names === '' ? '' : ' ') + p.name;
      if (pressed(p.b) && p.b !== GamepadButton.Start && p.b !== GamepadButton.Back) { presses++; last = p.name; beep(scale(i), 'square'); }
    }
    say(1, 16 * s, 200 * s, `held: ${names === '' ? '-' : names}`, INK);
    say(0, 16 * s, 216 * s, `${presses} presses, last ${last === '' ? '-' : last}; each button plays its note`, DIM);
  };
}

/** The sticks: their rings and values, and a ball each to steer around, collecting stars. */
export function sticksPage(count: i32, icons: string[] = ['playstation_stick_l', 'playstation_stick_r']): (dt: number) => void {
  const bx: number[] = [120, 360], by: number[] = [130, 130];
  let sx = 240, sy = 110, got = 0;
  return (dt: number) => {
    const s = k(), w = width() / s;
    const fieldTop = 30, fieldBottom = 174;
    card(8 * s, fieldTop * s, (w - 16) * s, (fieldBottom - fieldTop) * s);
    drawImage(img('particleSmallStar'), (sx - 8) * s, (sy - 8) * s, 16 * s, 16 * s, 255, 0);
    for (let i = 0; i < count; i++) {
      const ax = axis(i === 0 ? GamepadAxis.LeftX : GamepadAxis.RightX), ay = axis(i === 0 ? GamepadAxis.LeftY : GamepadAxis.RightY);
      bx[i] = Math.max(20, Math.min(w - 20, bx[i] + ax * 160 * dt));
      by[i] = Math.max(fieldTop + 12, Math.min(fieldBottom - 12, by[i] + ay * 160 * dt));
      drawImage(img('ballGrey'), (bx[i] - 9) * s, (by[i] - 9) * s, 18 * s, 18 * s, 255, 0);
      if (Math.abs(bx[i] - sx) < 16 && Math.abs(by[i] - sy) < 16) {   // a star: the next one somewhere else
        got++; beep(scale(7 + (got % 7)), 'triangle');
        sx = 30 + ((got * 97) % Math.floor(w - 60)); sy = fieldTop + 20 + ((got * 53) % (fieldBottom - fieldTop - 40));
      }
      stick((count === 1 ? w / 2 : 70 + i * (w - 140)) * s, 198 * s, 16 * s, ax, ay, i === 0 ? 'left' : 'right', icons[i], i === 1);
    }
    say(1, 16 * s, 34 * s, `stars ${got}`, ACCENT);
  };
}

const WAVES: Wave[] = ['sine', 'square', 'triangle', 'sawtooth', 'noise'];
/** zinc:audio: the output, five waves at any pitch (left and right), a chord and a jingle, the samples of the last sound drawn. */
export function soundPage(rateLine: string): (dt: number) => void {
  let wave = 0, step = 0;
  let shown: Sound | null = null;
  let samples: number[] = [];
  const play = (hz: number, secs: number): void => {
    const t = tone(hz, secs, WAVES[wave]);
    t.volume = 0.4;
    t.play();
    if (shown !== null) (shown as Sound).unload();
    shown = t;
    samples = t.samples(0);
  };
  return (dt: number) => {
    const s = k(), w = width() / s;
    if (pressed(GamepadButton.Up)) wave = (wave + WAVES.length - 1) % WAVES.length;
    if (pressed(GamepadButton.Down)) wave = (wave + 1) % WAVES.length;
    if (pressed(GamepadButton.Left)) step = Math.max(-7, step - 1);
    if (pressed(GamepadButton.Right)) step = Math.min(14, step + 1);
    if (pressed(GamepadButton.South)) play(scale(step), 0.4);
    if (pressed(GamepadButton.East)) { beep(scale(step), 'sine', 0.5, 0.25); beep(scale(step + 2), 'sine', 0.5, 0.25); beep(scale(step + 4), 'sine', 0.5, 0.25); }
    if (pressed(GamepadButton.North)) for (let i = 0; i < 4; i++) { const n = tone(scale(step + i * 2), 0.12, 'square'); n.volume = 0.3; n.voice(0.3, 1, 0, false, 0, i * 0.12); }
    if (pressed(GamepadButton.West)) play(220, 0.3);
    readout(16 * s, 30 * s, 'output', backend());
    say(0, 16 * s, 46 * s, rateLine, DIM);
    readout(16 * s, 62 * s, 'wave', `${WAVES[wave]}   (up / down)`);
    readout(16 * s, 78 * s, 'pitch', `${Math.round(scale(step))} Hz   (left / right)`);
    say(0, 16 * s, 96 * s, 'CROSS plays it, CIRCLE a chord, TRIANGLE a jingle (delayed voices), SQUARE a low note', DIM);
    // the samples of the last sound, its first 20 ms
    const gx = 16, gy = 112, gw = w - 32, gh = 78;
    card(gx * s, gy * s, gw * s, gh * s);
    rect(gx * s, (gy + gh / 2) * s, gw * s, 1, RULE);
    const n = Math.min(samples.length, 960);
    for (let i = 1; i < n; i++) {
      const x0 = gx + (i - 1) / n * gw, x1 = gx + i / n * gw;
      line(x0 * s, (gy + gh / 2 - samples[i - 1] * gh * 0.8) * s, x1 * s, (gy + gh / 2 - samples[i] * gh * 0.8) * s, ACCENT);
    }
    if (n === 0) say(0, (gx + 8) * s, (gy + 8) * s, 'press CROSS: the samples of the sound are drawn here', DIM);
  };
}

/** The screen: its size, the frame rate it holds, colour bars and sprites to load it (CROSS adds 10, SQUARE takes 10 away). */
export function screenPage(about: string): (dt: number) => void {
  const xs: number[] = [], ys: number[] = [], vx: number[] = [], vy: number[] = [];
  let acc = 0, n = 0, fps = 0, worst = 0, worstShown = 0;
  let last: f64 = performance.now();   // f64: a 32-bit number (the PSP's) cannot hold a time in ms
  const add = (count: i32): void => {
    for (let i = 0; i < count; i++) { const j = xs.length; xs.push(40 + (j * 37) % 400); ys.push(60 + (j * 23) % 120); vx.push(60 + (j * 13) % 90); vy.push(50 + (j * 29) % 80); }
  };
  add(10);
  return (dt: number) => {
    const s = k(), w = width() / s, h = height() / s;
    const t: f64 = performance.now(), real = (t - last) / 1000;   // the wall clock: a console's frame step (dt) is a fixed 1/60 s
    last = t;
    acc += real; n++; worst = Math.max(worst, real);
    if (acc >= 0.5) { fps = n / acc; acc = 0; n = 0; worstShown = worst; worst = 0; }
    if (pressed(GamepadButton.South)) add(10);
    if (pressed(GamepadButton.West) && xs.length >= 10) { xs.splice(xs.length - 10, 10); ys.splice(ys.length - 10, 10); vx.splice(vx.length - 10, 10); vy.splice(vy.length - 10, 10); }
    const bars: u32[] = [0xffffff, 0xffff00, 0x00ffff, 0x00ff00, 0xff00ff, 0xff0000, 0x0000ff, 0x000000];
    for (let i = 0; i < bars.length; i++) rect((8 + i * (w - 16) / 8) * s, 28 * s, ((w - 16) / 8 + 1) * s, 18 * s, bars[i]);
    for (let i = 0; i < 16; i++) rect((8 + i * (w - 16) / 16) * s, 46 * s, ((w - 16) / 16 + 1) * s, 6 * s, (i * 17) * 0x010101);
    for (let i = 0; i < xs.length; i++) {
      xs[i] += vx[i] * dt; ys[i] += vy[i] * dt;
      if (xs[i] < 10 || xs[i] > w - 26) vx[i] = -vx[i];
      if (ys[i] < 56 || ys[i] > h - 56) vy[i] = -vy[i];
      xs[i] = Math.max(10, Math.min(w - 26, xs[i])); ys[i] = Math.max(56, Math.min(h - 56, ys[i]));
      drawImage(img(i % 3 === 0 ? 'ballGrey' : i % 3 === 1 ? 'element_yellow_rectangle_glossy' : 'element_blue_rectangle_glossy'), xs[i] * s, ys[i] * s, 16 * s, 16 * s, 255, 0);
    }
    card(16 * s, (h - 60) * s, 300 * s, 36 * s);
    say(1, 24 * s, (h - 56) * s, `${width()} x ${height()}   ${fps.toFixed(1)} fps   slowest ${(worstShown * 1000).toFixed(1)} ms`, fps > 57 ? GOOD : ACCENT);
    say(0, 24 * s, (h - 40) * s, `${xs.length} sprites (CROSS +10, SQUARE -10)   ${about}`, DIM);
  };
}

/** The system: battery, clock, network, the platform, and a counter kept with zinc:storage (CROSS adds one; it is there at the next start). */
export function systemPage(): (dt: number) => void {
  let count = get('hardware.presses') === '' ? 0 : parseInt(get('hardware.presses'));
  let starts = get('hardware.starts') === '' ? 1 : parseInt(get('hardware.starts')) + 1;
  set('hardware.starts', '' + starts);
  return (dt: number) => {
    const s = k(), w = width() / s;
    if (pressed(GamepadButton.South)) { count++; set('hardware.presses', '' + count); beep(scale(count % 14), 'triangle'); }
    const b = battery(), n = network(), d = new Date();
    card(8 * s, 30 * s, (w / 2 - 12) * s, 156 * s);
    card((w / 2 + 4) * s, 30 * s, (w / 2 - 12) * s, 156 * s);
    let y = 36;
    say(2, 16 * s, y * s, 'Battery', INK); y += 20;
    if (b === null) { say(1, 16 * s, y * s, 'none on this machine', DIM); y += 16; }
    else {
      meter(16 * s, y * s, (w / 2 - 28) * s, 8 * s, b.level, b.level < 0.2 ? BAD : GOOD); y += 14;
      say(1, 16 * s, y * s, `${Math.round(b.level * 100)} %  ${b.charging ? 'charging' : b.source !== 'none' ? 'on the mains' : 'on battery'}`, INK); y += 16;
      say(1, 16 * s, y * s, `power: ${b.source === 'none' ? 'battery' : b.source}`, DIM); y += 16;
    }
    y += 6;
    say(2, 16 * s, y * s, 'Clock', INK); y += 20;
    const p2 = (v: number): string => (v < 10 ? '0' : '') + v;
    say(1, 16 * s, y * s, `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}  ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`, INK); y += 16;
    say(0, 16 * s, y * s, `frame ${frame()}`, DIM);
    const x = w / 2 + 12;
    y = 36;
    say(2, x * s, y * s, 'Network', INK); y += 20;
    if (n === null) { say(1, x * s, y * s, 'not known here', DIM); y += 16; }
    else {
      say(1, x * s, y * s, n.type === 'none' ? 'no network' : n.type === 'wifi' ? (n.online ? 'Wi-Fi connected' : 'Wi-Fi on, not connected') : n.type, n.online ? GOOD : INK); y += 16;
      if (n.ssid !== '') { say(1, x * s, y * s, `network ${n.ssid}`, DIM); y += 16; }
    }
    y += 6;
    say(2, x * s, y * s, 'Saved', INK); y += 20;
    say(1, x * s, y * s, `start ${starts}, CROSS pressed ${count} times`, INK); y += 16;
    const where = saveLocation();
    say(0, x * s, y * s, where.length > 44 ? '...' + where.slice(where.length - 41) : where, DIM); y += 14;
    say(0, x * s, y * s, `platform ${platform()}`, DIM);
  };
}
