// The control panel of a simulated device (zinc run --simulate <device>, docs/guide/09-web-apis.md "Simulated devices"), in the spirit of
// the Android emulator's extended controls. It reads the device's definition (ZINC_SIM_DEVICE, devices/<id>.json) and writes its state to
// ZINC_SIM_STATE, one `key=value` a line, which the program's host reads for the web APIs (navigator.getBattery, the sensors...); a key
// pressed here is a line appended to <state>.keys; what the program asks of the device (the screen kept on, the lights, a notification...)
// comes back in <state>.app and is shown at the bottom. The battery drains or charges as the definition says.
import { onFrame, width, height, keep, clear, rect, rrect, drawText, textWidth, font, fontAscent, pointerX, pointerY, pointerDown } from 'zinc:gfx';
import { exists, readText, writeText, appendText, rename } from 'zinc:fs';
import { env } from 'zinc:sys';
import { icon } from 'zinc:icons';
import { setSize } from 'zinc:system/window';

const BG = 0x111113, CARD = 0x1c1c1f, FILL = 0x2c2c30, TEXT = 0xf2f2f5, TEXT2 = 0x9a9aa2, ACCENT = 0x0a84ff, GREEN = 0x30d158, ORANGE = 0xff9f0a, RED = 0xff453a;
const F = { title: font('sans-bold', 20), head: font('sans-bold', 13), body: font('sans', 14), bodyB: font('sans-bold', 14), small: font('sans', 12) };

// ---------------------------------------------------------------- the device: its definition and its state
const DEF_PATH = env('ZINC_SIM_DEVICE'), STATE = env('ZINC_SIM_STATE');
const def: any = DEF_PATH !== '' && exists(DEF_PATH) ? JSON.parse(readText(DEF_PATH)) : JSON.parse('{"name":"No device","sensors":{},"keys":[],"outputs":{}}');
function has(o: any, k: string): boolean { return o !== undefined && o !== null && o[k] !== undefined && o[k] !== null && o[k] !== false; }
const battery: any = def.battery, network: any = def.network, sensors: any = def.sensors, outputs: any = def.outputs;
/** The angle from the program's natural screen to the sensors' frame (devices/<id>.json "sensorAngle": 90 on the TouchPad, portrait inside). */
const sensorAngle: number = def.sensorAngle !== undefined ? def.sensorAngle as number : 0;

class State {
  level: number = has(battery, 'level') ? battery.level as number : 1;
  source: string = has(battery, 'source') ? '' + battery.source : 'none';
  batteryRelay: boolean = has(battery, 'relay');
  online: boolean = !has(network, 'online') || network.online === true;
  netType: string = has(network, 'type') ? '' + network.type : 'wifi';
  ssid: string = has(network, 'ssid') ? '' + network.ssid : '';
  netRelay: boolean = has(network, 'relay');
  beta: number = 90;    // front-back tilt: 90 held upright, 0 flat on its back
  gamma: number = 0;    // left-right tilt
  heading: number = 0;
  lux: number = has(sensors, 'light') && has(sensors.light, 'lux') ? sensors.light.lux as number : 300;
  visible: boolean = true;
  fastTime: boolean = false;
  rotation: i32 = 0;   // the device turned clockwise: 0, 90, 180, 270
  gx: number = 0; gy: number = 0; gz: number = 0;   // rotation rate, °/s, from how fast the tilt and the heading change
  // a console's own inputs (ZN-759, zinc:hardware): the microphone's level, the 3DS's 3D slider, a finger on the Vita's rear pad (-1: none)
  mic: number = has(sensors, 'microphone') && has(sensors.microphone, 'level') ? sensors.microphone.level as number : 0.2;
  depth: number = has(sensors, 'stereo') && has(sensors.stereo, 'depth') ? sensors.stereo.depth as number : 0.5;
  rearX: number = -1; rearY: number = -1;
}
const st = new State();
let dirty = true, saveFor = 0;

function flag(b: boolean): string { return b ? '1' : '0'; }
function save(): void {
  if (STATE === '') return;
  const g = 9.80665, b = st.beta * Math.PI / 180, c = st.gamma * Math.PI / 180;
  const x0 = -g * Math.sin(c), r = g * Math.cos(c), y0 = r * Math.sin(b), z = r * Math.cos(b);
  const t = st.rotation * Math.PI / 180;   // the device turned clockwise: the up of the world turns the other way in its own axes
  const xs = x0 * Math.cos(t) - y0 * Math.sin(t), ys = x0 * Math.sin(t) + y0 * Math.cos(t);
  const sa = -sensorAngle * Math.PI / 180;   // into the sensor's frame (the device's natural one)
  const x = xs * Math.cos(sa) - ys * Math.sin(sa), y = xs * Math.sin(sa) + ys * Math.cos(sa);
  const lines = [
    `device.name=${def.name}`, `device.model=${def.model ?? def.name}`, `device.os=${def.os ?? ''}`, `language=${def.language ?? ''}`,
    `device.natural=${def.screen !== undefined && def.screen.height > def.screen.width ? 'portrait' : 'landscape'}`, `device.sensorAngle=${sensorAngle}`,
    `can.battery=${flag(battery !== undefined && battery !== null)}`, `battery.level=${st.level.toFixed(3)}`, `battery.source=${st.source}`,
    `battery.relay=${flag(st.batteryRelay)}`, `battery.temperature=${has(battery, 'temperature') ? battery.temperature : 25}`,
    `network.online=${flag(st.online)}`, `network.type=${st.netType}`, `network.ssid=${st.ssid}`, `network.relay=${flag(st.netRelay)}`,
    `can.motion=${flag(has(sensors, 'motion'))}`, `motion.x=${x.toFixed(3)}`, `motion.y=${y.toFixed(3)}`, `motion.z=${z.toFixed(3)}`,
    `can.compass=${flag(has(sensors, 'compass'))}`, `compass.heading=${st.heading.toFixed(1)}`, `compass.accuracy=80`,
    `can.light=${flag(has(sensors, 'light'))}`, `light.lux=${Math.round(st.lux)}`, `visible=${flag(st.visible)}`,
    `can.gyro=${flag(has(sensors, 'gyro'))}`, `gyro.x=${st.gx.toFixed(1)}`, `gyro.y=${st.gy.toFixed(1)}`, `gyro.z=${st.gz.toFixed(1)}`, `rotation=${st.rotation}`,
  ];
  for (const l of [`can.microphone=${flag(has(sensors, 'microphone'))}`, `microphone.level=${st.mic.toFixed(3)}`, `can.stereo=${flag(has(sensors, 'stereo'))}`,
    `stereo.depth=${st.depth.toFixed(3)}`, `can.reartouch=${flag(has(sensors, 'reartouch'))}`, `reartouch=${st.rearX < 0 ? '[]' : `[[${Math.round(st.rearX)},${Math.round(st.rearY)},0]]`}`]) lines.push(l);
  for (const k of ['wakelock', 'keyboard', 'indicator', 'backlight', 'performance', 'vibrate', 'notifications']) lines.push(`can.${k}=${flag(has(outputs, k))}`);
  try { writeText(STATE + '.new', lines.join('\n') + '\n'); rename(STATE + '.new', STATE); } catch (e) { console.error(`devicesim: ${e.message}`); }
}
function press(key: string): void { if (STATE !== '') { try { appendText(STATE + '.keys', key + '\n'); } catch (e) { /* the program is gone */ } } flash = key; flashFor = 0.4; dirty = true; }

// what the program asked of the device
let asked = new Map<string, string>();
function readAsked(): void {
  if (STATE === '' || !exists(STATE + '.app')) return;
  const m = new Map<string, string>();
  for (const line of readText(STATE + '.app').split('\n')) { const i = line.indexOf('='); if (i > 0) m.set(line.slice(0, i), line.slice(i + 1)); }
  asked = m;
  dirty = true;
}

// ---------------------------------------------------------------- touch: zones registered while drawing
class Zone { x: number = 0; y: number = 0; w: number = 0; h: number = 0; tap: (() => void) | null = null; drag: ((x: number, y: number) => void) | null = null; }
let zones: Zone[] = [];
function onTap(x: number, y: number, w: number, h: number, f: () => void): void { const z = new Zone(); z.x = x; z.y = y; z.w = w; z.h = h; z.tap = f; zones.push(z); }
function onDrag(x: number, y: number, w: number, h: number, f: (x: number, y: number) => void): void { const z = new Zone(); z.x = x; z.y = y; z.w = w; z.h = h; z.drag = f; zones.push(z); }
let wasDown = false, held: Zone | null = null, flash = '', flashFor = 0, rearHeld = false;
function input(): void {
  const d = pointerDown(), x = pointerX(), y = pointerY();
  if (d && !wasDown) {
    held = null;
    for (let i = zones.length - 1; i >= 0; i--) { const z = zones[i]; if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) { held = z; break; } }
    if (held !== null && (held as Zone).tap !== null) { const f = (held as Zone).tap as () => void; f(); dirty = true; }
  }
  if (d && held !== null && (held as Zone).drag !== null) { const f = (held as Zone).drag as (x: number, y: number) => void; f(x, y); dirty = true; saveFor = 0.05; }
  if (!d && wasDown) { held = null; if (rearHeld) { rearHeld = false; st.rearX = st.rearY = -1; dirty = true; saveFor = 0.01; } }   // the finger leaves the rear pad
  wasDown = d;
}

// ---------------------------------------------------------------- drawing kit
function glyph(name: string, x: number, y: number, s: number, color: u32): void { const svg = icon(name, color as i32, 2); if (svg !== null) svg.draw(x, y, s, s, 255); }
function label(f: i32, x: number, y: number, s: string, c: u32): void { drawText(f, x, y, s, c, 255, 0); }
function section(y: number, title: string, ic: string): number {
  glyph(ic, 16, y, 16, TEXT2);
  label(F.head, 40, y + 1, title.toUpperCase(), TEXT2);
  return y + 24;
}
function toggle(x: number, y: number, on: boolean, f: () => void): void {
  rrect(x, y, 44, 26, 13, on ? GREEN : FILL, 255);
  rrect(on ? x + 20 : x + 2, y + 2, 22, 22, 11, 0xffffff, 255);
  onTap(x - 6, y - 6, 56, 38, f);
}
function chips(x: number, y: number, items: string[], selected: string, f: (v: string) => void): number {
  let cx = x;
  for (const it of items) {
    const w = textWidth(F.body, it, 0) + 20, on = it === selected, v = it;
    rrect(cx, y, w, 28, 14, on ? ACCENT : FILL, 255);
    label(F.body, cx + 10, y + (28 - fontAscent(F.body)) / 2 - 1, it, on ? 0xffffff : TEXT);
    onTap(cx, y - 4, w, 36, () => { f(v); saveFor = 0.01; });
    cx += w + 6;
  }
  return y + 36;
}
function slider(x: number, y: number, w: number, v: number, color: u32, f: (v: number) => void): void {
  rrect(x, y - 3, w, 6, 3, FILL, 255);
  rrect(x, y - 3, Math.max(6, w * v), 6, 3, color, 255);
  rrect(x + w * v - 10, y - 10, 20, 20, 10, 0xffffff, 255);
  onDrag(x - 12, y - 18, w + 24, 36, (px: number, py: number) => f(Math.max(0, Math.min(1, (px - x) / w))));
}
function button(x: number, y: number, w: number, text: string, ic: string, f: () => void, on: boolean = false): void {
  rrect(x, y, w, 34, 8, on ? ACCENT : FILL, 255);
  glyph(ic, x + 10, y + 9, 16, TEXT);
  label(F.body, x + 32, y + (34 - fontAscent(F.body)) / 2 - 1, text, TEXT);
  onTap(x, y, w, 34, f);
}

// ---------------------------------------------------------------- the band (the default): one row of controls docked under the program's
// window, as wide as it (the host keeps it there: ZINC_SIM_DOCK); a narrow window gets two rows. "More" opens everything.
let advanced = false, bandH = 92;
const ADVANCED_W = 380, ADVANCED_H = 860;
function setAdvanced(on: boolean): void { advanced = on; setSize(on ? ADVANCED_W : width(), on ? ADVANCED_H : bandH); dirty = true; }
/** A control of the band: an icon, its value, a word under it; a tap, or a horizontal drag (`drag` gets the distance moved in points). */
function item(x: number, y: number, w: number, ic: string, value: string, caption: string, color: u32, tap: (() => void) | null,
              drag: ((d: number) => void) | null = null, on: boolean = false): void {
  rrect(x, y, w, 64, 12, on ? ACCENT : CARD, 255);
  glyph(ic, x + 12, y + 20, 24, color);
  label(F.bodyB, x + 46, y + 14, value, TEXT);
  label(F.small, x + 46, y + 36, caption, TEXT2);
  if (drag !== null) {
    let x0 = -1;
    const d = drag as (d: number) => void;
    onDrag(x, y, w, 64, (px: number, py: number) => { if (x0 < 0) x0 = px; d(px - x0); x0 = px; });
    if (tap !== null) onTap(x, y, 40, 64, tap as () => void);
  } else if (tap !== null) onTap(x, y, w, 64, tap as () => void);
}
function orientationName(): string { return st.rotation === 0 ? 'Natural' : st.rotation === 90 ? 'Turned right' : st.rotation === 180 ? 'Upside down' : 'Turned left'; }
function sourceLabel(s: string): string { const i = SOURCE_NAMES.indexOf(s); return i >= 0 ? SOURCE_LABELS[i] : s; }
function compact(W: number, H: number): void {
  clear(BG);
  zones = [];
  let x = 8, y = 14;
  const place = (w: number): number[] => { if (x + w > W - 8) { x = 8; y += 72; } const at = [x, y]; x += w + 8; return at; };
  let p = place(150);
  rrect(p[0], p[1], 150, 64, 12, CARD, 255);
  glyph(def.icon === undefined ? 'smartphone' : '' + def.icon, p[0] + 12, p[1] + 18, 28, TEXT);
  label(F.bodyB, p[0] + 50, p[1] + 14, '' + def.name, TEXT);
  label(F.small, p[0] + 50, p[1] + 36, def.screen !== undefined ? `${def.screen.width} x ${def.screen.height}` : '', TEXT2);
  if (battery !== undefined && battery !== null) {
    const order: string[] = [];
    if (battery.sources !== undefined) for (let i = 0; i < battery.sources.length; i++) order.push('' + battery.sources[i]); else for (const n of SOURCE_NAMES) order.push(n);
    p = place(128);
    item(p[0], p[1], 128, st.source !== 'none' ? 'battery-charging' : 'battery', st.batteryRelay ? 'This Mac' : `${Math.round(st.level * 100)} %`,
      st.batteryRelay ? 'battery' : sourceLabel(st.source), st.level < 0.15 ? RED : GREEN,
      st.batteryRelay ? null : () => { st.source = order[(order.indexOf(st.source) + 1) % order.length]; saveFor = 0.01; },
      st.batteryRelay ? null : (d: number) => { st.level = Math.max(0, Math.min(1, st.level + d / 300)); });
  }
  p = place(140);
  item(p[0], p[1], 140, st.online ? 'wifi' : 'wifi-off', st.netRelay ? 'This Mac' : st.online ? (st.ssid !== '' ? st.ssid : st.netType) : 'Offline', 'network', st.online ? TEXT : TEXT2,
    st.netRelay ? null : () => { st.online = !st.online; saveFor = 0.01; });
  p = place(190);
  rrect(p[0], p[1], 190, 64, 12, CARD, 255);
  glyph('rotate-ccw', p[0] + 12, p[1] + 20, 24, TEXT);
  glyph('rotate-cw', p[0] + 154, p[1] + 20, 24, TEXT);
  const on = orientationName();
  label(F.bodyB, p[0] + 95 - textWidth(F.bodyB, on, 0) / 2, p[1] + 14, on, TEXT);
  label(F.small, p[0] + 95 - textWidth(F.small, 'turn', 0) / 2, p[1] + 36, 'turn', TEXT2);
  const px0 = p[0];
  onTap(px0, p[1], 48, 64, () => { st.rotation = (st.rotation + 270) % 360; saveFor = 0.01; });
  onTap(px0 + 142, p[1], 48, 64, () => { st.rotation = (st.rotation + 90) % 360; saveFor = 0.01; });
  if (has(sensors, 'motion')) {   // tilt: drag in the square
    p = place(150);
    rrect(p[0], p[1], 150, 64, 12, CARD, 255);
    const sx = p[0] + 8, sy = p[1] + 8, sz = 48;
    rrect(sx, sy, sz, sz, 8, FILL, 255);
    const dx = sx + sz / 2 + (st.gamma / 90) * (sz / 2 - 6), dy = sy + sz / 2 - ((st.beta - 45) / 135) * (sz / 2 - 6);
    rrect(dx - 6, dy - 6, 12, 12, 6, ACCENT, 255);
    label(F.bodyB, p[0] + 66, p[1] + 14, st.beta > 60 ? 'Upright' : st.beta < 25 && st.beta > -25 ? 'Flat' : 'Tilted', TEXT);
    label(F.small, p[0] + 66, p[1] + 36, 'drag to tilt', TEXT2);
    const ox = sx, oy = sy;
    onDrag(p[0], p[1], 150, 64, (mx: number, my: number) => {
      st.gamma = Math.max(-90, Math.min(90, ((mx - ox - sz / 2) / (sz / 2 - 6)) * 90));
      st.beta = Math.max(-90, Math.min(180, 45 - ((my - oy - sz / 2) / (sz / 2 - 6)) * 135));
    });
  }
  if (has(sensors, 'compass')) { p = place(96); item(p[0], p[1], 96, 'compass', `${Math.round(st.heading)}°`, 'compass', ORANGE, null, (d: number) => { st.heading = (st.heading + d + 360) % 360; }); }
  if (has(sensors, 'light')) { p = place(110); item(p[0], p[1], 110, 'sun', `${Math.round(st.lux)} lx`, 'light', 0xffd60a, null, (d: number) => { st.lux = Math.max(0, Math.min(10000, (st.lux + 1) * Math.pow(1.02, d) - 1)); }); }
  if (has(sensors, 'microphone')) { p = place(116); item(p[0], p[1], 116, 'mic', `${Math.round(st.mic * 100)} %`, 'microphone', GREEN, null, (d: number) => { st.mic = Math.max(0, Math.min(1, st.mic + d / 150)); }); }
  if (has(sensors, 'stereo')) { p = place(116); item(p[0], p[1], 116, 'glasses', st.depth > 0 ? `${Math.round(st.depth * 100)} %` : 'Off', '3D slider', ACCENT, null, (d: number) => { st.depth = Math.max(0, Math.min(1, st.depth + d / 150)); }); }
  if (has(sensors, 'reartouch')) {   // the rear pad: hold the mouse in the box, a finger at that place of the screen
    p = place(150);
    rrect(p[0], p[1], 150, 64, 12, CARD, 255);
    const bx = p[0] + 8, by = p[1] + 8, bw = 82, bh = 48;
    rrect(bx, by, bw, bh, 6, FILL, 255);
    const sw = def.screen !== undefined ? def.screen.width as number : 960, sh = def.screen !== undefined ? def.screen.height as number : 544;
    if (st.rearX >= 0) rrect(bx + st.rearX / sw * bw - 5, by + st.rearY / sh * bh - 5, 10, 10, 5, ACCENT, 255);
    label(F.bodyB, p[0] + 98, p[1] + 14, st.rearX >= 0 ? 'Touch' : 'Free', TEXT);
    label(F.small, p[0] + 98, p[1] + 36, 'rear pad', TEXT2);
    onDrag(bx, by, bw, bh, (mx: number, my: number) => { st.rearX = Math.max(0, Math.min(1, (mx - bx) / bw)) * sw; st.rearY = Math.max(0, Math.min(1, (my - by) / bh)) * sh; rearHeld = true; });
  }
  p = place(116);
  item(p[0], p[1], 116, st.visible ? 'eye' : 'eye-off', st.visible ? 'Shown' : 'Hidden', 'program', st.visible ? TEXT : TEXT2, () => { st.visible = !st.visible; saveFor = 0.01; });
  // the keys: one button each, the word under the icon
  const keys = def.keys;
  if (keys !== undefined) for (let i = 0; i < keys.length; i++) {
    const k = '' + keys[i].key, text = '' + keys[i].label;
    const w = Math.max(60, textWidth(F.small, text, 0) + 12);
    p = place(w);
    rrect(p[0], p[1], w, 64, 12, flash === k && flashFor > 0 ? ACCENT : CARD, 255);
    glyph(keys[i].icon === undefined ? 'circle' : '' + keys[i].icon, p[0] + w / 2 - 12, p[1] + 10, 24, TEXT);
    label(F.small, p[0] + w / 2 - textWidth(F.small, text, 0) / 2, p[1] + 40, text, TEXT2);
    onTap(p[0], p[1], w, 64, () => press(k));
  }
  // what the program asks, lit when it does
  const ind = asked.get('indicator') ?? 'off';
  const lights: string[] = [], lit: boolean[] = [], words: string[] = [];
  if (has(outputs, 'indicator')) { lights.push('circle-dot'); words.push('light'); lit.push(ind.startsWith('on') || (ind.startsWith('blink') && Math.floor(clockS * 3) % 2 === 0)); }
  if (has(outputs, 'wakelock')) { lights.push('lock'); words.push('awake'); lit.push(asked.get('wakelock') === '1'); }
  if (has(outputs, 'backlight')) { lights.push('sun'); words.push('screen'); lit.push(asked.get('backlight') !== '0'); }
  if (has(outputs, 'performance')) { lights.push('gauge'); words.push('fast'); lit.push(asked.get('performance') === '1'); }
  if (has(outputs, 'keyboard')) { lights.push('keyboard'); words.push('keys'); lit.push(asked.get('keyboard') === '1'); }
  if (has(outputs, 'notifications')) { lights.push('bell'); words.push('alert'); lit.push(asked.has('notify')); }
  if (has(outputs, 'vibrate')) { lights.push('vibrate'); words.push('buzz'); lit.push(asked.has('vibrate')); }
  if (lights.length > 0) {
    const w = lights.length * 44 + 8;
    p = place(w);
    rrect(p[0], p[1], w, 64, 12, CARD, 255);
    for (let i = 0; i < lights.length; i++) {
      glyph(lights[i], p[0] + 14 + i * 44, p[1] + 10, 22, lit[i] ? GREEN : 0x48484d);
      label(F.small, p[0] + 25 + i * 44 - textWidth(F.small, words[i], 0) / 2, p[1] + 40, words[i], lit[i] ? TEXT : 0x6e6e73);
    }
  }
  p = place(64);
  item(p[0], p[1], 64, 'ellipsis', '', 'more', TEXT2, () => setAdvanced(true));
  const want = y + 64 + 14;
  if (want !== bandH) { bandH = want; setSize(W, bandH); }
}

// ---------------------------------------------------------------- the panel (advanced: everything)
const SOURCE_NAMES: string[] = ['none', 'usb', 'ac', 'wireless'];
const SOURCE_LABELS: string[] = ['Battery', 'USB', 'Mains', 'Wireless'];
function draw(W: number): void {
  clear(BG);
  zones = [];
  // the device
  rrect(12, 12, W - 24, 56, 12, CARD, 255);
  glyph(def.icon === undefined ? 'smartphone' : '' + def.icon, 26, 24, 32, TEXT);
  label(F.title, 70, 20, '' + def.name, TEXT);
  label(F.small, 70, 46, `${def.os ?? ''}  ·  ${def.screen !== undefined ? `${def.screen.width}x${def.screen.height}` : ''}`, TEXT2);
  glyph('minimize-2', W - 44, 30, 20, TEXT2);
  onTap(W - 56, 16, 44, 44, () => setAdvanced(false));
  let y = 84;
  const x = 16, w = W - 32;
  // battery
  if (battery !== undefined && battery !== null) {
    y = section(y, 'Battery', st.source !== 'none' ? 'battery-charging' : 'battery');
    if (st.batteryRelay) label(F.body, x, y + 4, 'Relayed from this machine', TEXT2);
    else {
      label(F.bodyB, x, y, `${Math.round(st.level * 100)} %`, st.level < 0.15 ? RED : TEXT);
      label(F.small, x + 60, y + 2, st.source === 'none' ? 'discharging' : 'charging', TEXT2);
      slider(x + 150, y + 8, w - 150, st.level, st.level < 0.15 ? RED : GREEN, (v: number) => { st.level = v; });
      y += 28;
      const allowed: string[] = [], labels: string[] = [];
      const list = battery.sources;
      for (let i = 0; i < SOURCE_NAMES.length; i++) {
        let ok = list === undefined;
        if (list !== undefined) for (let j = 0; j < list.length; j++) if ('' + list[j] === SOURCE_NAMES[i]) ok = true;
        if (ok) { allowed.push(SOURCE_NAMES[i]); labels.push(SOURCE_LABELS[i]); }
      }
      const shown = labels[Math.max(0, allowed.indexOf(st.source))];
      y = chips(x, y, labels, shown, (v: string) => { st.source = allowed[labels.indexOf(v)]; }) - 4;
    }
    y += 8;
    label(F.small, x, y + 4, 'Fast time (1 min = 1 h)', TEXT2);
    toggle(W - 60, y, st.fastTime, () => { st.fastTime = !st.fastTime; });
    y += 40;
  }
  // network
  y = section(y, 'Network', st.online ? 'wifi' : 'wifi-off');
  if (st.netRelay) { label(F.body, x, y + 4, 'Relayed from this machine', TEXT2); y += 30; }
  else {
    label(F.body, x, y + 4, st.online ? `${st.netType}${st.ssid !== '' ? '  ·  ' + st.ssid : ''}` : 'Offline', st.online ? TEXT : TEXT2);
    toggle(W - 60, y, st.online, () => { st.online = !st.online; saveFor = 0.01; });
    y += 34;
    if (network !== undefined && network.types !== undefined && network.types.length > 1) {
      const types: string[] = [];
      for (let i = 0; i < network.types.length; i++) types.push('' + network.types[i]);
      y = chips(x, y, types, st.netType, (v: string) => { st.netType = v; });
    }
  }
  y += 6;
  // motion: presets and a tilt pad
  if (has(sensors, 'motion')) {
    y = section(y, 'Orientation and tilt', 'move-3d');
    const presets: string[] = ['Upright', 'Flat', 'Upside down', 'Left', 'Right'];
    const at: number[] = [90, 0, 0, 0, -90, 0, 90, 90, 90, -90];
    y = chips(x, y, presets, '', (v: string) => { const i = presets.indexOf(v); st.beta = at[i * 2]; st.gamma = at[i * 2 + 1]; });
    const pad = 120, px = x, py = y + 4;
    rrect(px, py, pad, pad, 12, CARD, 255);
    rect(px + pad / 2, py + 8, 1, pad - 16, FILL); rect(px + 8, py + pad / 2, pad - 16, 1, FILL);
    const dx = px + pad / 2 + (st.gamma / 90) * (pad / 2 - 10), dy = py + pad / 2 - ((st.beta - 45) / 135) * (pad / 2 - 10);
    rrect(dx - 9, dy - 9, 18, 18, 9, ACCENT, 255);
    onDrag(px, py, pad, pad, (mx: number, my: number) => {
      st.gamma = Math.max(-90, Math.min(90, ((mx - px - pad / 2) / (pad / 2 - 10)) * 90));
      st.beta = Math.max(-90, Math.min(180, 45 - ((my - py - pad / 2) / (pad / 2 - 10)) * 135));
    });
    label(F.small, px + pad + 14, py + 10, `front-back ${Math.round(st.beta)}°`, TEXT2);
    label(F.small, px + pad + 14, py + 30, `left-right ${Math.round(st.gamma)}°`, TEXT2);
    label(F.small, px + pad + 14, py + 58, 'Drag the dot to tilt', TEXT2);
    y = py + pad + 14;
  }
  if (has(sensors, 'compass')) {
    y = section(y, 'Compass', 'compass');
    label(F.bodyB, x, y, `${Math.round(st.heading)}°`, TEXT);
    slider(x + 60, y + 8, w - 60, st.heading / 360, ORANGE, (v: number) => { st.heading = v * 360; });
    y += 36;
  }
  if (has(sensors, 'light')) {
    y = section(y, 'Ambient light', 'sun');
    label(F.bodyB, x, y, `${Math.round(st.lux)} lx`, TEXT);
    slider(x + 80, y + 8, w - 80, Math.log10(st.lux + 1) / 4, 0xffd60a, (v: number) => { st.lux = Math.pow(10, v * 4) - 1; });
    y += 36;
  }
  // the program's card
  y = section(y, 'Program', 'eye');
  label(F.body, x, y + 4, st.visible ? 'Shown' : 'Hidden (in the background)', TEXT);
  toggle(W - 60, y, st.visible, () => { st.visible = !st.visible; saveFor = 0.01; });
  y += 40;
  // keys
  const keys = def.keys;
  if (keys !== undefined && keys.length > 0) {
    y = section(y, 'Hardware keys', 'circle-dot');
    const bw = (w - 8) / 2;
    for (let i = 0; i < keys.length; i++) {
      const k = '' + keys[i].key;
      button(x + (i % 2) * (bw + 8), y + Math.floor(i / 2) * 42, bw, '' + keys[i].label, keys[i].icon === undefined ? 'circle' : '' + keys[i].icon, () => press(k), flash === k && flashFor > 0);
    }
    y += Math.ceil(keys.length / 2) * 42 + 6;
  }
  // what the program asks
  y = section(y, 'Asked by the program', 'cpu');
  const rows: string[][] = [];
  const ind = asked.get('indicator') ?? 'off';
  if (has(outputs, 'indicator')) rows.push(['Center light', ind.startsWith('blink') ? 'blinking' : ind.startsWith('on') ? 'on' : 'off']);
  if (has(outputs, 'wakelock')) rows.push(['Screen kept on', asked.get('wakelock') === '1' ? 'yes' : 'no']);
  if (has(outputs, 'backlight')) rows.push(['Backlight', asked.get('backlight') === '0' ? 'off' : 'on']);
  if (has(outputs, 'performance')) rows.push(['Full speed', asked.get('performance') === '1' ? 'yes' : 'no']);
  if (has(outputs, 'keyboard')) rows.push(['System keyboard', asked.get('keyboard') === '1' ? 'shown' : 'hidden']);
  if (has(outputs, 'vibrate')) rows.push(['Vibration', asked.has('vibrate') ? `${(asked.get('vibrate') ?? '').split('@')[0]} ms` : '-']);
  if (has(outputs, 'notifications')) {
    const n = asked.get('notify') ?? '';
    let text = '-';
    try { if (n !== '') { const j = JSON.parse(n); text = '' + j.title; } } catch (e) { text = n; }
    rows.push(['Last notification', text]);
  }
  for (const r of rows) {
    label(F.body, x, y, r[0], TEXT2);
    const on = r[1] !== 'no' && r[1] !== 'off' && r[1] !== '-' && r[1] !== 'hidden';
    if (r[0] === 'Center light') rrect(W - 30, y + 2, 12, 12, 6, on ? (r[1] === 'blinking' && Math.floor(clockS * 3) % 2 === 0 ? FILL : GREEN) : FILL, 255);
    else label(F.bodyB, W - 16 - textWidth(F.bodyB, r[1], 0), y, r[1], on ? TEXT : TEXT2);
    y += 22;
  }
}

// ---------------------------------------------------------------- the loop: the battery's behaviour, the program's answers
let clockS = 0, tRead = 0, lastBeta = 90, lastGamma = 0, lastHeading = 0;
save();
onFrame((dt: number) => {
  clockS += dt;
  input();
  if (flashFor > 0) { flashFor -= dt; if (flashFor <= 0) dirty = true; }
  // the battery as the definition says: drains on its own, charges on a source (per hour; a minute is an hour in fast time)
  if (battery !== undefined && battery !== null && !st.batteryRelay) {
    const hours = dt / 3600 * (st.fastTime ? 60 : 1);
    const before = st.level;
    if (st.source === 'none') st.level = Math.max(0, st.level - (has(battery, 'drainPerHour') ? battery.drainPerHour as number : 0.1) * hours);
    else { const rate = battery.chargePerHour !== undefined && battery.chargePerHour[st.source] !== undefined ? battery.chargePerHour[st.source] as number : 0.3; st.level = Math.min(1, st.level + rate * hours); }
    if (Math.floor(before * 1000) !== Math.floor(st.level * 1000)) { saveFor = saveFor > 0 ? saveFor : 0.5; dirty = true; }
  }
  // the rotation rate from how fast the tilt and the heading change (°/s), easing back to 0 when nothing moves
  if (dt > 0) {
    const k = Math.min(1, dt * 8);
    st.gx += ((st.beta - lastBeta) / dt - st.gx) * k; st.gy += ((st.gamma - lastGamma) / dt - st.gy) * k;
    let dh = st.heading - lastHeading; if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
    st.gz += (dh / dt - st.gz) * k;
    if (Math.abs(st.gx) + Math.abs(st.gy) + Math.abs(st.gz) > 0.5 && saveFor <= 0) saveFor = 0.03;
    lastBeta = st.beta; lastGamma = st.gamma; lastHeading = st.heading;
  }
  if (saveFor > 0) { saveFor -= dt; if (saveFor <= 0) save(); }
  tRead += dt;
  if (tRead >= 0.3) { tRead = 0; readAsked(); }
  if (asked.get('indicator') !== undefined && (asked.get('indicator') ?? '').startsWith('blink')) dirty = true;
  if (!dirty) { keep(); return; }
  dirty = false;
  if (advanced) draw(width()); else compact(width(), height());
});
