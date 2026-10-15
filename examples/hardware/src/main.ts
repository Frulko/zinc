// Matériel: every device API of Zinc on one screen, as a web page would use them (README.md): the battery and what charges it, the network,
// the page's visibility, the screen wake lock, the motion sensor and a spirit level, the compass, the ambient light, the screen's orientation,
// the hardware keys and the media session, the system keyboard, notifications, vibration, the camera, and the TouchPad's own (the light of
// its Center button, full speed, the backlight). On the tablet, on a desktop, or as a simulated device: zinc run --simulate hp-touchpad.
import { onFrame, width, height, keep, clear, rect, rrect, drawText, textWidth, font, fontAscent, pointerX, pointerY, pointerDown, polygon, keyCount, keyKind, keyName, KeyKind, clip, unclip } from 'zinc:gfx';
import { icon } from 'zinc:icons';
import { setIndicator, setPerformance, setBacklight, cpu } from 'zinc:webos';

const BG = 0x0b0b0d, CARD = 0x1c1c1f, FILL = 0x2c2c30, TEXT = 0xf2f2f5, TEXT2 = 0x9a9aa2, BLUE = 0x0a84ff, GREEN = 0x30d158, ORANGE = 0xff9f0a, RED = 0xff453a, YELLOW = 0xffd60a, PURPLE = 0xbf5af2;
const F = { hero: font('sans-bold', 30), title: font('sans-bold', 17), big: font('sans-bold', 26), body: font('sans', 15), bodyB: font('sans-bold', 15), small: font('sans', 12) };

// ---------------------------------------------------------------- what the APIs say, kept for drawing
let dirty = true;
const log: string[] = [];
function note(s: string): void { log.unshift(s); if (log.length > 6) log.pop(); dirty = true; }

let bat: BatteryManager | null = null;
navigator.getBattery().then((b: BatteryManager) => {
  bat = b;
  b.addEventListener('chargingchange', (e: Event) => note(b.charging ? 'Branché' : 'Débranché'));
  b.addEventListener('sourcechange', (e: Event) => note(`Source : ${sourceName(b.source)}`));
  b.addEventListener('levelchange', (e: Event) => { dirty = true; });
  dirty = true;
});
function sourceName(s: string): string { return s === 'wireless' ? 'induction (Touchstone)' : s === 'usb' ? 'USB' : s === 'ac' ? 'secteur' : 'batterie'; }

addEventListener('online', (e: Event) => note('En ligne'));
addEventListener('offline', (e: Event) => note('Hors ligne'));
navigator.connection.addEventListener('change', (e: Event) => { dirty = true; });
document.addEventListener('visibilitychange', (e: Event) => note(`Page ${document.visibilityState === 'hidden' ? 'cachée' : 'visible'}`));
screen.orientation.addEventListener('change', (e: Event) => note(`Orientation : ${screen.orientation.type}`));
screen.orientation.unlock();   // this page turns with the device: its layout follows the screen's shape

let motion: number[] = [], tilt: number[] = [];
const acc = new Accelerometer({ frequency: 30, referenceFrame: 'screen' });
let accError = '';
acc.onreading = (e: Event) => { motion = [acc.x, acc.y, acc.z]; dirty = true; };
acc.onerror = (e: SensorErrorEvent) => { accError = e.error.message; dirty = true; };
acc.start();
addEventListener('deviceorientation', (e: Event) => { const o = e as DeviceOrientationEvent; tilt = [o.beta, o.gamma]; });

const compass = new AbsoluteOrientationSensor({ frequency: 10 });
let compassError = '';
compass.onreading = (e: Event) => { dirty = true; };
compass.onerror = (e: SensorErrorEvent) => { compassError = e.error.message; dirty = true; };
compass.start();

const gyro = new Gyroscope({ frequency: 30, referenceFrame: 'screen' });
let gyroError = '';
const spin: number[] = [0, 0, 0];   // the angles the rates add up to, to show them turning
gyro.onreading = (e: Event) => { spin[0] += gyro.x / 30; spin[1] += gyro.y / 30; spin[2] += gyro.z / 30; dirty = true; };
gyro.onerror = (e: SensorErrorEvent) => { gyroError = e.error.message; dirty = true; };
gyro.start();

const light = new AmbientLightSensor({ frequency: 5 });
let lightError = '';
light.onreading = (e: Event) => { dirty = true; };
light.onerror = (e: SensorErrorEvent) => { lightError = e.error.message; dirty = true; };
light.start();

const keysSeen: string[] = [];
addEventListener('keydown', (e: Event) => { const k = (e as KeyboardEvent).key; keysSeen.unshift(k); if (keysSeen.length > 5) keysSeen.pop(); note(`Touche ${k}`); });
navigator.mediaSession.metadata = new MediaMetadata({ title: 'Démo Matériel', artist: 'Zinc' });
navigator.mediaSession.setActionHandler('play', () => { navigator.mediaSession.playbackState = 'playing'; note('Média : lecture'); });
navigator.mediaSession.setActionHandler('pause', () => { navigator.mediaSession.playbackState = 'paused'; note('Média : pause'); });
navigator.mediaSession.setActionHandler('nexttrack', () => note('Média : suivant'));

let wake: WakeLockSentinel | null = null, wakeError = '';
let text = '', typing = false;
let notified = '', vibrated = '', camera = '', indicator = 'off', fast = false, darkFor = 0;
navigator.mediaDevices.getUserMedia({ video: true }).then((s: unknown) => { camera = 'ouverte'; }).catch((e: Error) => { camera = `${e.name} : ${e.message}`; dirty = true; });

// ---------------------------------------------------------------- touch zones
class Zone { x: number = 0; y: number = 0; w: number = 0; h: number = 0; f: () => void = () => {}; }
let zones: Zone[] = [];
function onTap(x: number, y: number, w: number, h: number, f: () => void): void { const z = new Zone(); z.x = x; z.y = y - scrollY; z.w = w; z.h = h; z.f = f; zones.push(z); }
let wasDown = false, downY = 0, downScroll = 0, moved = false, scrollY = 0, contentH = 0;

// ---------------------------------------------------------------- drawing
function glyph(name: string, x: number, y: number, s: number, c: u32): void { const svg = icon(name, c as i32, 2); if (svg !== null) svg.draw(x, y - scrollY, s, s, 255); }
function t(f: i32, x: number, y: number, s: string, c: u32): void { drawText(f, x, y - scrollY, s, c, 255, 0); }
function box(x: number, y: number, w: number, h: number, r: number, c: u32, a: i32 = 255): void { rrect(x, y - scrollY, w, h, r, c, a); }
function card(x: number, y: number, w: number, h: number, title: string, ic: string, color: u32): void {
  box(x, y, w, h, 16, CARD);
  box(x + 16, y + 16, 30, 30, 8, color);
  glyph(ic, x + 21, y + 21, 20, 0xffffff);
  t(F.title, x + 56, y + 21, title, TEXT);
}
function button(x: number, y: number, w: number, label: string, f: () => void, on: boolean = false): void {
  box(x, y, w, 36, 10, on ? BLUE : FILL);
  t(F.bodyB, x + (w - textWidth(F.bodyB, label, 0)) / 2, y + (36 - fontAscent(F.bodyB)) / 2 - 1, label, TEXT);
  onTap(x, y, w, 36, () => { f(); dirty = true; });
}
function bar(x: number, y: number, w: number, v: number, c: u32): void { box(x, y, w, 8, 4, FILL); box(x, y, Math.max(8, w * Math.max(0, Math.min(1, v))), 8, 4, c); }

function batteryCard(x: number, y: number, w: number): void {
  card(x, y, w, 196, 'Batterie', bat !== null && (bat as BatteryManager).charging ? 'battery-charging' : 'battery', GREEN);
  if (bat === null) { t(F.body, x + 16, y + 70, 'navigator.getBattery()…', TEXT2); return; }
  const b = bat as BatteryManager;
  t(F.big, x + 16, y + 64, `${Math.round(b.level * 100)} %`, b.level < 0.15 ? RED : TEXT);
  bar(x + 16, y + 104, w - 32, b.level, b.level < 0.15 ? RED : GREEN);
  t(F.body, x + 16, y + 124, b.charging ? `En charge · ${sourceName(b.source)}` : 'Sur batterie', b.charging ? GREEN : TEXT2);
  if (b.source === 'wireless') { glyph('zap', x + w - 40, y + 60, 24, YELLOW); }
  const more: string[] = [];
  if (!isNaN(b.temperature)) more.push(`${b.temperature} °C`);
  if (b.chargingTime !== Infinity && b.chargingTime > 0) more.push(`pleine dans ${Math.round(b.chargingTime / 60)} min`);
  if (b.dischargingTime !== Infinity) more.push(`${Math.round(b.dischargingTime / 60)} min restantes`);
  t(F.small, x + 16, y + 150, more.join(' · '), TEXT2);
}
function networkCard(x: number, y: number, w: number): void {
  const c = navigator.connection, on = navigator.onLine;
  card(x, y, w, 196, 'Réseau', on ? 'wifi' : 'wifi-off', BLUE);
  t(F.big, x + 16, y + 64, on ? 'En ligne' : 'Hors ligne', on ? TEXT : RED);
  t(F.body, x + 16, y + 104, `${c.type}${c.ssid !== '' ? ' · ' + c.ssid : ''}`, TEXT2);
  if (c.ip !== '') t(F.small, x + 16, y + 128, `IP ${c.ip} · ${c.effectiveType}`, TEXT2);
  t(F.small, x + 16, y + 160, 'navigator.onLine, connection, online / offline', TEXT2);
}
function screenCard(x: number, y: number, w: number): void {
  card(x, y, w, 196, 'Écran', 'monitor', PURPLE);
  t(F.body, x + 16, y + 62, `Page ${document.visibilityState} · ${screen.orientation.type}`, TEXT);
  const bw = (w - 40) / 2;
  button(x + 16, y + 96, bw, wake !== null ? 'Veille : bloquée' : 'Bloquer la veille', () => {
    if (wake !== null) { (wake as WakeLockSentinel).release(); wake = null; note('Verrou relâché'); return; }
    navigator.wakeLock.request('screen').then((s: WakeLockSentinel) => { wake = s; note('Écran maintenu allumé'); dirty = true; }).catch((e: Error) => { wakeError = e.name; note(`Verrou : ${e.name}`); });
  }, wake !== null);
  button(x + 24 + bw, y + 96, bw, 'Éteindre 3 s', () => { if (setBacklight(false)) { darkFor = 3; note('Rétroéclairage éteint'); } else note('Rétroéclairage : indisponible'); });
  t(F.small, x + 16, y + 152, wakeError !== '' ? `wakeLock : ${wakeError}` : 'wakeLock, visibilité, setBacklight', TEXT2);
}
function perfCard(x: number, y: number, w: number): void {
  card(x, y, w, 196, 'Performance', 'gauge', RED);
  const c = cpu();
  t(F.big, x + 16, y + 60, c !== null ? `${Math.round(c.mhz)} MHz` : `${loopFps} i/s`, TEXT);
  t(F.small, x + 16, y + 96, c !== null ? `${c.cores} cœur${c.cores > 1 ? 's' : ''} · ${c.governor} · ${loopFps} i/s` : 'état du processeur inconnu ici', TEXT2);
  const bw = (w - 40) / 2;
  button(x + 16, y + 124, bw, 'Auto', () => { fast = false; note(setPerformance(false) ? 'Vitesse auto' : 'Performance : indisponible'); }, !fast);
  button(x + 24 + bw, y + 124, bw, 'Pleine vitesse', () => { fast = true; note(setPerformance(true) ? 'Pleine vitesse' : 'Performance : indisponible'); }, fast);
  t(F.small, x + 16, y + 172, 'setPerformance, cpu() de zinc:webos', TEXT2);
}
function motionCard(x: number, y: number, w: number): void {
  card(x, y, w, 196, 'Mouvement', 'move-3d', ORANGE);
  if (accError !== '') { t(F.body, x + 16, y + 70, accError, TEXT2); return; }
  const names = ['x', 'y', 'z'];
  for (let i = 0; i < 3; i++) {
    const v = motion.length === 3 ? motion[i] : 0;
    t(F.small, x + 16, y + 64 + i * 26, `${names[i]} ${v.toFixed(1)}`, TEXT2);
    box(x + 70, y + 68 + i * 26, 100, 6, 3, FILL);
    const cx = x + 120, k = Math.max(-1, Math.min(1, v / 9.81)) * 50;
    box(Math.min(cx, cx + k), y + 68 + i * 26, Math.abs(k), 6, 3, ORANGE);
  }
  // a level: the screen, and an arrow to the real ground (gravity in the screen's axes, y up, drawn y down); a dot when it lies flat
  const cx = x + w - 70, cy = y + 112 - scrollY;
  if (motion.length === 3) {
    const gx = motion[0], gy = motion[1], up = Math.sqrt(gx * gx + gy * gy);
    rrect(cx - 44, cy - 32, 88, 64, 8, 0x3a3a3e, 255);
    rrect(cx - 38, cy - 26, 76, 52, 4, 0x5e5ce6, 255);
    if (up > 2) {
      const dx = -gx / up, dy = gy / up, len = 44 * Math.min(1, up / 9.81), px = -dy, py = dx;   // gravity points opposite the reaction
      const ex = cx + dx * len, ey = cy + dy * len;
      polygon([cx + px * 3, cy + py * 3, ex + px * 3, ey + py * 3, ex - px * 3, ey - py * 3, cx - px * 3, cy - py * 3], GREEN, 255);
      polygon([ex + px * 9, ey + py * 9, ex - px * 9, ey - py * 9, ex + dx * 14, ey + dy * 14], GREEN, 255);
    } else rrect(cx - 6, cy - 6, 12, 12, 6, GREEN, 255);
  }
  t(F.small, x + 16, y + 164, tilt.length === 2 ? `beta ${Math.round(tilt[0])}° · gamma ${Math.round(tilt[1])}° · ${screen.orientation.type}` : 'Accelerometer, deviceorientation', TEXT2);
}
function gyroCard(x: number, y: number, w: number): void {
  card(x, y, w, 196, 'Gyroscope', 'rotate-cw', 0x64d2ff);
  if (gyroError !== '') { t(F.body, x + 16, y + 70, gyroError, TEXT2); return; }
  const names = ['x', 'y', 'z'], rates = [gyro.x, gyro.y, gyro.z];
  for (let i = 0; i < 3; i++) {
    const deg = isNaN(rates[i]) ? 0 : rates[i] * 180 / Math.PI;
    t(F.small, x + 16, y + 64 + i * 26, `${names[i]} ${Math.round(deg)}°/s`, TEXT2);
    // a dial per axis: its hand turns as fast as the device
    const dx = x + 130 + i * 0, cy = y + 70 + i * 26 - scrollY;
    const a = spin[i];
    rrect(dx - 8, cy - 8 + 4, 16, 16, 8, FILL, 255);
    polygon([dx, cy + 4, dx + Math.cos(a) * 8, cy + 4 + Math.sin(a) * 8, dx + Math.cos(a + 0.3) * 6, cy + 4 + Math.sin(a + 0.3) * 6], 0x64d2ff, 255);
  }
  t(F.small, x + 16, y + 164, 'Gyroscope, devicemotion.rotationRate', TEXT2);
}
function compassCard(x: number, y: number, w: number): void {
  card(x, y, w, 196, 'Boussole', 'compass', RED);
  if (compassError !== '') { t(F.body, x + 16, y + 70, compassError, TEXT2); return; }
  const h = compass.heading;
  t(F.big, x + 16, y + 64, isNaN(h) ? '–' : `${Math.round(h)}°`, TEXT);
  t(F.small, x + 16, y + 100, `précision ${compass.accuracy}`, TEXT2);
  const r = 58, cx = x + w - r - 24, cy = y + 120 - scrollY;
  rrect(cx - r, cy - r, r * 2, r * 2, r, FILL, 255);
  const a = (isNaN(h) ? 0 : -h) * Math.PI / 180, s = Math.sin(a), c = Math.cos(a);
  polygon([cx + s * (r - 8), cy - c * (r - 8), cx + c * 7, cy + s * 7, cx - c * 7, cy - s * 7], RED, 255);
  polygon([cx - s * (r - 8), cy + c * (r - 8), cx + c * 7, cy + s * 7, cx - c * 7, cy - s * 7], 0xd1d1d6, 255);
  drawText(F.small, cx + s * (r + 2) - 4, cy - c * (r + 2) - 7, 'N', TEXT, 255, 0);
}
function lightCard(x: number, y: number, w: number): void {
  card(x, y, w, 196, 'Lumière', 'sun', YELLOW);
  if (lightError !== '') { t(F.body, x + 16, y + 70, lightError, TEXT2); return; }
  const lux = light.illuminance;
  t(F.big, x + 16, y + 64, isNaN(lux) ? '–' : `${Math.round(lux)} lx`, TEXT);
  bar(x + 16, y + 104, w - 32, isNaN(lux) ? 0 : Math.log10(lux + 1) / 4, YELLOW);
  t(F.body, x + 16, y + 124, isNaN(lux) ? '' : lux < 10 ? 'Nuit : écran au minimum' : lux < 200 ? 'Intérieur' : lux < 2000 ? 'Lumineux' : 'Plein jour', TEXT2);
  t(F.small, x + 16, y + 160, 'AmbientLightSensor', TEXT2);
}
function keysCard(x: number, y: number, w: number): void {
  card(x, y, w, 196, 'Touches et média', 'circle-dot', BLUE);
  t(F.body, x + 16, y + 62, keysSeen.length > 0 ? keysSeen.join('  ') : 'Appuie sur un bouton de l\'appareil', keysSeen.length > 0 ? TEXT : TEXT2);
  t(F.body, x + 16, y + 92, `mediaSession : ${navigator.mediaSession.playbackState}`, TEXT2);
  const bw = (w - 48) / 3;
  button(x + 16, y + 130, bw, 'Allumer', () => { indicator = 'on'; note(setIndicator('on') ? 'Lumière allumée' : 'Lumière : indisponible'); }, indicator === 'on');
  button(x + 24 + bw, y + 130, bw, 'Clignoter', () => { indicator = 'blink'; setIndicator('blink'); note('Lumière clignote'); }, indicator === 'blink');
  button(x + 32 + bw * 2, y + 130, bw, 'Éteindre', () => { indicator = 'off'; setIndicator('off'); note('Lumière éteinte'); }, indicator === 'off');
  t(F.small, x + 16, y + 176, 'keydown (AudioVolumeUp, GoHome…), setIndicator', TEXT2);
}
let fieldY = 0;   // where the text field is in the page: the page scrolls to it while the keyboard takes the bottom of the screen
function inputCard(x: number, y: number, w: number): void {
  fieldY = y + 60;
  card(x, y, w, 196, 'Clavier, alertes', 'keyboard', GREEN);
  box(x + 16, y + 60, w - 32, 38, 10, FILL);
  t(F.body, x + 28, y + 70, text !== '' ? text : 'Touche ici pour écrire', text !== '' ? TEXT : TEXT2);
  onTap(x + 16, y + 60, w - 32, 38, () => { typing = true; if (!navigator.virtualKeyboard.show()) note('Clavier système : celui de la machine'); });
  const bw = (w - 40) / 2;
  button(x + 16, y + 110, bw, 'Notification', () => {
    const n = new Notification('Zinc', { body: 'Bonjour depuis la démo Matériel' });
    n.onshow = (e: Event) => { notified = 'affichée'; note('Notification affichée'); };
    n.onerror = (e: Event) => { notified = 'refusée'; note('Notification : refusée par l\'appareil'); };
  });
  button(x + 24 + bw, y + 110, bw, 'Vibrer', () => { vibrated = navigator.vibrate(200) ? 'oui' : 'pas de moteur'; note(`Vibration : ${vibrated}`); });
  t(F.small, x + 16, y + 160, `Notification ${notified !== '' ? notified : Notification.permission} · vibrate ${vibrated !== '' ? vibrated : '–'}`, TEXT2);
}
function deviceCard(x: number, y: number, w: number): void {
  card(x, y, w, 196, 'Appareil', 'cpu', 0x8e8e93);
  const d = navigator.deviceInfo;
  t(F.bodyB, x + 16, y + 62, d !== null ? `${d.model}` : 'inconnu', TEXT);
  t(F.body, x + 16, y + 86, d !== null ? `${d.os}${d.name !== undefined && d.name !== '' ? ' · ' + d.name : ''}` : '', TEXT2);
  t(F.body, x + 16, y + 110, `Langue ${navigator.language}`, TEXT2);
  t(F.small, x + 16, y + 140, `Caméra : ${camera !== '' ? camera : '…'}`, TEXT2);
}

function draw(W: number, H: number): void {
  clear(BG);
  zones = [];
  t(F.hero, 24, 24, 'Matériel', TEXT);
  t(F.small, 24 + textWidth(F.hero, 'Matériel', 0) + 14, 38, 'les API du web sur cet appareil', TEXT2);
  const fps = `${loopFps} i/s · ${drawFps} redessinées`;
  box(W - 24 - textWidth(F.small, fps, 0) - 20, 28, textWidth(F.small, fps, 0) + 20, 26, 13, FILL);
  t(F.small, W - 34 - textWidth(F.small, fps, 0), 34, fps, loopFps >= 50 ? GREEN : loopFps >= 30 ? ORANGE : RED);
  const cols = W >= 900 ? 3 : W >= 600 ? 2 : 1, gap = 16, cw = (W - 24 * 2 - gap * (cols - 1)) / cols;
  const cards = [batteryCard, networkCard, screenCard, perfCard, motionCard, gyroCard, compassCard, lightCard, keysCard, inputCard, deviceCard];
  for (let i = 0; i < cards.length; i++) {
    const f = cards[i];
    f(24 + (i % cols) * (cw + gap), 76 + Math.floor(i / cols) * (196 + gap), cw);
  }
  let y = 76 + Math.ceil(cards.length / cols) * (196 + gap);
  t(F.title, 24, y, 'Événements', TEXT);
  for (let i = 0; i < log.length; i++) t(F.body, 24, y + 30 + i * 22, log[i], i === 0 ? TEXT : TEXT2);
  contentH = y + 30 + 6 * 22 + 24;
  if (darkFor > 0) rect(0, 0, W, H, 0x000000);
}

let clockS = 0, tSec = 0, loops = 0, draws = 0, fpsAt = 0, loopFps = 0, drawFps = 0;   // the frame rate: loops of onFrame and frames drawn, a second
onFrame((dt: number) => {
  const W = width(), H = height();
  clockS += dt;
  loops++;
  if (clockS - fpsAt >= 1) { loopFps = loops; drawFps = draws; loops = 0; draws = 0; fpsAt = clockS; dirty = true; }
  const d = pointerDown(), px = pointerX(), py = pointerY();
  if (d && !wasDown) { downY = py; downScroll = scrollY; moved = false; }
  if (d && Math.abs(py - downY) > 10) { moved = true; scrollY = Math.max(0, Math.min(Math.max(0, contentH - H), downScroll - (py - downY))); dirty = true; }
  if (!d && wasDown && !moved) for (let i = zones.length - 1; i >= 0; i--) { const z = zones[i]; if (px >= z.x && px < z.x + z.w && py >= z.y && py < z.y + z.h) { z.f(); break; } }
  wasDown = d;
  if (typing) for (let i = 0; i < keyCount(); i++) {
    const k = keyKind(i), n = keyName(i);
    if (k === KeyKind.Text) text += n;
    else if (k === KeyKind.Down && n === 'Backspace') text = text.slice(0, Math.max(0, text.length - 1));
    else if (k === KeyKind.Down && (n === 'Enter' || n === 'Escape')) { typing = false; navigator.virtualKeyboard.hide(); }
    dirty = true;
  }
  if (typing) { const want = Math.max(0, Math.min(Math.max(0, contentH - H), fieldY - 12)); if (want !== scrollY) { scrollY = want; dirty = true; } }
  if (darkFor > 0) { darkFor -= dt; if (darkFor <= 0) { setBacklight(true); note('Rétroéclairage rallumé'); } }
  tSec += dt;
  if (tSec >= 1) { tSec = 0; dirty = true; }   // the values that change without an event (the network's details, the battery's times)
  if (!dirty) { keep(); return; }
  dirty = false;
  draws++;
  draw(W, H);
});
