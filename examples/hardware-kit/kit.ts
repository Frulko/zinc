// The shared part of the console hardware demos (ZN-759: examples/hardware-psp, hardware-vita, hardware-ps2, hardware-n3ds): one screen per
// feature, a header with the clock and the battery, START and SELECT to move between the screens, Kenney's icons (Input Prompts, Puzzle Pack;
// CC0, each project's assets/kenney), and a line on the screen for what the hardware or the emulator does not give.
// The pad is zinc:gfx's gamepad 0 (a console's own pad); on a desktop without a gamepad the keyboard stands in (zinc:gfx's buttons: the arrows,
// Z X A S, Enter, Shift; the second stick on I J K L).
import { clear, rect, rrect, drawText, font, textWidth, image, drawImage, width, height, onFrame, isDown, Btn, gamepadConnected, gamepadButton,
  gamepadButtonValue, gamepadAxis, GamepadButton, GamepadAxis, keyCount, keyKind, keyName, KeyKind } from 'zinc:gfx';
import { tone, Sound, Wave } from 'zinc:audio';
import { battery } from 'zinc:hardware';

export const BG: u32 = 0x1b2140;
export const CARD: u32 = 0x283063;
export const RULE: u32 = 0x3a4583;
export const INK: u32 = 0xe8ecff;
export const DIM: u32 = 0x8f9bd0;
export const ACCENT: u32 = 0xffc93c;
export const GOOD: u32 = 0x5ee38f;
export const BAD: u32 = 0xff8a5c;

/** The scale of the screen against the PSP's 480x272, the size every layout is drawn for. */
export function k(): number { return Math.min(width() / 480, height() / 272); }
let fonts: i32[] = [];
let fontsFor = -1;
/** 0 small, 1 body, 2 title, 3 big: the baked sans at the screen's scale. */
export function f(size: i32): i32 {
  if (fontsFor !== width()) {
    fontsFor = width();
    const s = k();   // literal sizes: zinc pack bakes the sizes its font() calls name (3DS, PSP, PS2, Vita)
    if (s < 0.9) fonts = [font('sans', 9), font('sans', 10), font('sans-bold', 12), font('sans-bold', 18)];
    else if (s < 1.2) fonts = [font('sans', 10), font('sans', 12), font('sans-bold', 14), font('sans-bold', 22)];
    else if (s < 1.6) fonts = [font('sans', 13), font('sans', 16), font('sans-bold', 18), font('sans-bold', 28)];
    else fonts = [font('sans', 20), font('sans', 24), font('sans-bold', 28), font('sans-bold', 44)];
  }
  return fonts[size];
}
export function say(size: i32, x: number, y: number, s: string, color: u32): void { drawText(f(size), x, y, s, color, 255, 0); }
export function sayWidth(size: i32, s: string): number { return textWidth(f(size), s, 0); }
export function card(x: number, y: number, w: number, h: number): void { rrect(x, y, w, h, 6 * k(), CARD, 255); }

const images = new Map<string, i32>();
/** A Kenney sprite of assets/kenney by name, -1 when it was not baked. */
export function img(name: string): i32 {
  const at = images.get(name);
  if (at !== undefined) return at;
  const i = image('kenney/' + name + '.png');
  images.set(name, i);
  return i;
}
/** A sprite, full when `on`, faint otherwise. */
export function icon(name: string, x: number, y: number, s: number, on: boolean): void {
  const i = img(name);
  if (i >= 0) drawImage(i, x, y, s, s, on ? 255 : 70, 0);
  else rrect(x, y, s, s, s / 4, on ? ACCENT : RULE, 255);
}

// ---------------------------------------------------------------- the pad
const KEYS: i32[] = [GamepadButton.South, GamepadButton.East, GamepadButton.West, GamepadButton.North, GamepadButton.LeftShoulder, GamepadButton.RightShoulder,
  GamepadButton.Back, GamepadButton.Start, GamepadButton.Up, GamepadButton.Down, GamepadButton.Left, GamepadButton.Right];
const BTNS: Btn[] = [Btn.A, Btn.B, Btn.X, Btn.Y, Btn.L, Btn.R, Btn.Select, Btn.Start, Btn.Up, Btn.Down, Btn.Left, Btn.Right];
/** Whether button `b` (W3C standard order) is held: on gamepad 0, else on the keyboard's zinc:gfx buttons. */
export function held(b: i32): boolean {
  if (gamepadConnected(0)) return gamepadButton(0, b as GamepadButton);
  const i = KEYS.indexOf(b);
  return i >= 0 && isDown(BTNS[i]);
}
/** How far it is pressed, 0..1 (a pressure-sensitive button's own value, else 1 when held). */
export function value(b: i32): number { return gamepadConnected(0) ? gamepadButtonValue(0, b as GamepadButton) : held(b) ? 1 : 0; }
const keysHeld = new Set<string>();
function keyAxis(minus: string, plus: string): number { return (keysHeld.has(plus) ? 1 : 0) - (keysHeld.has(minus) ? 1 : 0); }
/** A stick's axis, -1..1 (down and right positive); on a desktop the arrows are the left stick, I J K L the right one. */
export function axis(a: i32): number {
  if (gamepadConnected(0)) return gamepadAxis(0, a as GamepadAxis);
  if (a === GamepadAxis.LeftX) return (isDown(Btn.Right) ? 1 : 0) - (isDown(Btn.Left) ? 1 : 0);
  if (a === GamepadAxis.LeftY) return (isDown(Btn.Down) ? 1 : 0) - (isDown(Btn.Up) ? 1 : 0);
  if (a === GamepadAxis.RightX) return keyAxis('j', 'l');
  return keyAxis('i', 'k');
}
let was: boolean[] = [];
let now: boolean[] = [];
for (let b = 0; b < 17; b++) now.push(false);
/** Pressed since the last frame. */
export function pressed(b: i32): boolean { return b >= 0 && b < 17 && now[b] && !was[b]; }
/** Let go since the last frame. */
export function released(b: i32): boolean { return b >= 0 && b < 17 && was[b] && !now[b]; }
function readPad(): void {
  for (let i = 0; i < keyCount(); i++) {
    if (keyKind(i) === KeyKind.Down) keysHeld.add(keyName(i));
    if (keyKind(i) === KeyKind.Up) keysHeld.delete(keyName(i));
  }
  was = now;
  now = [];
  for (let b = 0; b < 17; b++) now.push(held(b));
}

// ---------------------------------------------------------------- sound: one note per button, made once
const notes = new Map<string, Sound>();
/** Plays a short note (a square wave by default) at `hz`. */
export function beep(hz: number, wave: Wave = 'square', seconds: number = 0.12, volume: number = 0.35): void {
  const key = `${wave}${Math.round(hz)}${seconds}`;
  let s = notes.get(key);
  if (s === undefined) { s = tone(hz, seconds, wave); notes.set(key, s); }
  const v = s as Sound;
  v.volume = volume;
  v.play();
}
/** The note of the n-th step of a major scale from A4. */
export function scale(n: i32): number {
  const steps: i32[] = [0, 2, 4, 5, 7, 9, 11];
  const o = Math.floor(n / 7), i = n - o * 7;
  return 440 * Math.pow(2, (o * 12 + steps[i]) / 12);
}

// ---------------------------------------------------------------- the screens
export class Page {
  title: string;
  draw: (dt: number) => void;
  constructor(title: string, draw: (dt: number) => void) { this.title = title; this.draw = draw; }
}
let missingAt = 0;
/** One line at the bottom of the screen for what this hardware or its emulator does not give. */
export function missing(text: string): void {
  const s = k(), y = height() - (34 + 14 * missingAt) * s;
  icon('flair_disabled', 8 * s, y, 12 * s, true);
  say(0, 24 * s, y, text, BAD);
  missingAt++;
}
/** The top of the content area and its bottom (above the footer and the lines of missing()). */
export function top(): number { return 26 * k(); }
function pad2(n: number): string { return n < 10 ? '0' + n : '' + n; }

export class App {
  name: string;
  pages: Page[] = [];
  at: i32 = 0;
  frames: i32 = 0;
  constructor(name: string) { this.name = name; }
  add(title: string, draw: (dt: number) => void): void { this.pages.push(new Page(title, draw)); }
  run(): void {
    onFrame((dt: number) => {
      readPad();
      this.frames++;
      // START and SELECT change the screen when they are let go (so the buttons screen shows them held)
      if (released(GamepadButton.Start)) { this.at = (this.at + 1) % this.pages.length; beep(880, 'triangle', 0.06, 0.3); }
      if (released(GamepadButton.Back)) { this.at = (this.at + this.pages.length - 1) % this.pages.length; beep(660, 'triangle', 0.06, 0.3); }
      clear(BG);
      missingAt = 0;
      const page = this.pages[this.at];
      page.draw(dt);
      this.header(page.title);
      this.footer();
    });
  }
  private header(title: string): void {
    const s = k(), w = width();
    rect(0, 0, w, 22 * s, CARD);
    rect(0, 22 * s, w, 1, RULE);
    say(2, 8 * s, 4 * s, title, INK);
    say(0, 8 * s + sayWidth(2, title) + 10 * s, 7 * s, this.name, DIM);
    const d = new Date();
    const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
    let x = w - 8 * s - sayWidth(1, clock);
    say(1, x, 5 * s, clock, INK);
    const b = battery();
    if (b !== null) {
      const pct = `${Math.round(b.level * 100)}%${b.charging ? '+' : ''}`;
      x -= sayWidth(1, pct) + 10 * s;
      say(1, x, 5 * s, pct, b.level < 0.2 ? BAD : INK);
      x -= 20 * s;
      icon(b.level > 0.66 ? 'controller_icon_battery_full' : b.level > 0.25 ? 'controller_icon_battery_half' : 'controller_icon_battery_empty', x, 3 * s, 17 * s, true);
    }
  }
  private footer(): void {
    const s = k(), w = width(), h = height();
    rect(0, h - 18 * s, w, 18 * s, CARD);
    const label = `SELECT  <   ${this.at + 1} / ${this.pages.length}   >  START`;
    say(0, (w - sayWidth(0, label)) / 2, h - 16 * s, label, DIM);
    for (let i = 0; i < this.pages.length; i++) rrect(8 * s + i * 9 * s, h - 11 * s, 6 * s, 4 * s, 2 * s, i === this.at ? ACCENT : RULE, 255);
  }
}

// ---------------------------------------------------------------- widgets
/** A stick: its ring, the dot where it points and its two values. */
export function stick(x: number, y: number, r: number, ax: number, ay: number, label: string, iconName: string, labelLeft: boolean = false): void {
  const s = k();
  rrect(x - r, y - r, 2 * r, 2 * r, r, CARD, 255);
  rect(x - r + 4 * s, y, 2 * r - 8 * s, 1, RULE); rect(x, y - r + 4 * s, 1, 2 * r - 8 * s, RULE);
  const d = 12 * s;
  icon(iconName, x + ax * (r - d) - d, y + ay * (r - d) - d, 2 * d, true);
  const t = `${label}  x ${ax.toFixed(2)}  y ${ay.toFixed(2)}`;
  say(0, labelLeft ? x - r - 6 * s - sayWidth(0, t) : x + r + 6 * s, y - 6 * s, t, DIM);
}
/** A horizontal meter of `v` (0..1). */
export function meter(x: number, y: number, w: number, h: number, v: number, color: u32): void {
  rrect(x, y, w, h, h / 2, RULE, 255);
  const c = Math.max(0, Math.min(1, v));
  if (c > 0) rrect(x, y, Math.max(h, w * c), h, h / 2, color, 255);
}
/** A label and its value on one line. */
export function readout(x: number, y: number, label: string, value: string): void {
  say(1, x, y, label, DIM);
  say(1, x + 96 * k(), y, value, INK);
}
