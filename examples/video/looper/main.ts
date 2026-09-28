// Fullscreen video looper in the spirit of videolooper.de / adafruit pi_video_looper: plays every video of a folder
// (or an M3U playlist) in a seamless loop. Settings come from video_looper.ini and/or the same keys as CLI flags.
// Usage: looper [folder] [--config file.ini] [--is_random] [--bgcolor "0,0,0"] [--osd false] ...   (see README.md)
// Keys: Right (k) skip, Left (b) back, Enter (s) stop/start, Space pause, Tab info, Esc quit.
import * as gfx from 'zinc:gfx';
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import * as storage from 'zinc:storage';
import * as gpio from 'zinc:gpio';
import { Player, EXTENSIONS, isVideo, RANDOM, RANDOM_UNIQUE, SEQUENTIAL, LOOP, ONE_SHOT } from 'zinc:video';

// ---------------------------------------------------------------- settings (video_looper.ini keys)
const cfg = new Map<string, string>();
const DEFAULTS: string[] = [
  'path', 'media', 'playlist', '', 'extensions', EXTENSIONS.join(', '),
  'is_random', 'false', 'is_random_unique', 'false', 'resume_playlist', 'false', 'one_shot_playback', 'false',
  'play_on_startup', 'true', 'wait_time', '0', 'bgcolor', '0, 0, 0', 'fgcolor', '255, 255, 255',
  'osd', 'true', 'countdown_time', '5', 'show_titles', 'false', 'title_duration', '10',
  'keyboard_control', 'true', 'console_output', 'false', 'info', 'false', 'gpio_pin_map', '', 'gpio_pin_mode', 'true',
];
for (let i = 0; i < DEFAULTS.length; i += 2) cfg.set(DEFAULTS[i], DEFAULTS[i + 1]);

function str(k: string): string { return cfg.get(k) ?? ''; }
function flag(k: string): boolean { const v = str(k).toLowerCase(); return v === 'true' || v === '1' || v === 'yes' || v === 'on'; }
function num(k: string): number { const v = parseFloat(str(k)); return isNaN(v) ? 0 : v; }
function color(k: string): u32 {
  const c = str(k).split(',');
  if (c.length !== 3) return 0;
  return ((parseInt(c[0].trim()) & 255) << 16) | ((parseInt(c[1].trim()) & 255) << 8) | (parseInt(c[2].trim()) & 255);
}

/** INI file: `key = value` lines, # or ; comments; [directory] path and [playlist] path get their own names. */
function loadIni(file: string): void {
  let section = '';
  for (const raw of fs.readText(file).split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#') || line.startsWith(';')) continue;
    if (line.startsWith('[')) { section = line.slice(1, line.indexOf(']')).trim(); continue; }
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    let key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key === 'path') key = section === 'playlist' ? 'playlist' : 'path';
    cfg.set(key, value);
  }
}

const HELP = `looper [folder] [options]   plays every video of the folder in a seamless loop
  --config FILE            video_looper.ini to read (default: ./video_looper.ini, /boot/video_looper.ini)
  --path DIR               folder with the videos (default: media)
  --playlist FILE.m3u      fixed playlist (relative to the folder)
  --extensions "mp4, mov"  file extensions to play
  --is_random, --is_random_unique, --one_shot_playback, --resume_playlist
  --play_on_startup false  wait for Enter (s) before playing
  --wait_time SECONDS      pause between videos (0 = seamless)
  --bgcolor "R, G, B"      letterbox / idle colour; --fgcolor "R, G, B" for text
  --osd false, --countdown_time N, --show_titles, --title_duration N, --console_output
  --keyboard_control false, --gpio_pin_map '"11": 1, "13": "+1"', --info (playback info overlay, Tab)
Any video_looper.ini key works as --key value, --key=value, --key (true) or --no-key (false).`;

// CLI: config file first, then flags override it
const args = sys.args();
let iniFile = '';
for (let i = 0; i < args.length; i++) if (args[i] === '--config' && i + 1 < args.length) iniFile = args[i + 1];
if (iniFile === '') for (const c of ['video_looper.ini', '/boot/video_looper.ini', '/boot/firmware/video_looper.ini']) if (fs.exists(c)) { iniFile = c; break; }
if (iniFile !== '') {
  try { loadIni(iniFile); } catch (e) { console.error(`looper: cannot read ${iniFile}`); sys.exit(1); }
}
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--help' || a === '-h') { console.log(HELP); sys.exit(0); }
  if (a === '--config') { i++; continue; }
  if (!a.startsWith('--')) { cfg.set('path', a); continue; }
  const eq = a.indexOf('=');
  if (eq > 0) { cfg.set(a.slice(2, eq), a.slice(eq + 1)); continue; }
  const key = a.slice(2);
  if (key.startsWith('no-')) cfg.set(key.slice(3), 'false');
  else if (i + 1 < args.length && !args[i + 1].startsWith('--')) { cfg.set(key, args[i + 1]); i++; }
  else cfg.set(key, 'true');
}
if (num('wait_time') > 0 && flag('one_shot_playback')) console.warn('looper: one_shot_playback ignores wait_time');

const log = (s: string) => { if (flag('console_output')) console.log(`looper: ${s}`); };
const BG = color('bgcolor'), FG = color('fgcolor');

// ---------------------------------------------------------------- playlist
const W = gfx.width(), H = gfx.height();
let player = new Player(W, H);  // decoded at screen size: drawing is a plain row copy
const titles: string[] = [];

function baseName(p: string): string {
  const parts = p.split('/');
  const s = parts[parts.length - 1];
  const ext = s.split('.');
  return ext.length > 1 && s.indexOf('.') > 0 ? s.slice(0, s.length - ext[ext.length - 1].length - 1) : s;
}
/** `name_repeat_3x.mp4` plays three times in a row (pi_video_looper convention). */
function repeats(p: string): i32 {
  const i = p.indexOf('_repeat_');
  if (i < 0) return 1;
  const n = parseInt(p.slice(i + 8));
  return isNaN(n) || n < 1 ? 1 : n;
}
function addFile(p: string, title: string): void {
  const n = repeats(p);
  for (let k = 0; k < n; k++) if (player.add(p)) titles.push(title.replace(`_repeat_${n}x`, ''));
}
function load(): void {
  const dir = str('path');
  const exts = str('extensions').split(',').map(e => e.trim());
  const m3u = str('playlist');
  if (m3u !== '') {
    const file = m3u.startsWith('/') ? m3u : dir + '/' + m3u;
    if (!fs.exists(file)) return;
    let title = '';
    for (const raw of fs.readText(file).split('\n')) {
      const line = raw.trim();
      if (line.startsWith('#EXTINF')) { title = line.slice(line.indexOf(',') + 1); continue; }
      if (line === '' || line.startsWith('#')) continue;
      addFile(line.startsWith('/') ? line : dir + '/' + line, title !== '' ? title : baseName(line));
      title = '';
    }
    return;
  }
  if (!fs.exists(dir)) return;
  for (const f of fs.list(dir)) if (isVideo(f, exts)) addFile(dir + '/' + f, baseName(f));
}

function configure(): void {
  player.background = BG;
  player.order = flag('is_random_unique') ? RANDOM_UNIQUE : flag('is_random') ? RANDOM : SEQUENTIAL;
  // wait_time > 0: every file stops on its own and the looper restarts the next one after the pause
  player.repeat = flag('one_shot_playback') || num('wait_time') > 0 ? ONE_SHOT : LOOP;
}
configure();
load();
log(`${player.count} file(s) in ${str('path')}${iniFile !== '' ? ` (config ${iniFile})` : ''}`);

// ---------------------------------------------------------------- state
let countdown = flag('osd') && player.count > 0 ? num('countdown_time') : 0;
let started = false, stopped = !flag('play_on_startup'), paused = false, info = flag('info');
let waitLeft = 0, rescan = 0, lastIndex = -1, titleLeft = 0, fps = 0;

function start(): void {
  if (flag('resume_playlist')) {
    const saved = parseInt(storage.get('looper.index'));
    if (!isNaN(saved) && saved >= 0 && saved < player.count) { player.jump(saved); return; }
  }
  player.play();
}
function toggleStop(): void {
  stopped = !stopped;
  if (stopped) { player.stop(); log('stopped'); }
  else { player.play(); log('started'); }
}
function togglePause(): void { paused = !paused; player.pause(paused); log(paused ? 'paused' : 'resumed'); }

// GPIO: "pin": index | "+n" | "-n" | "file name or title" | "K_SPACE" / "K_k" / "K_b" / "K_s" (pins in BOARD numbering)
const BOARD_TO_BCM: i32[] = [-1, -1, -1, 2, -1, 3, -1, 4, 14, -1, 15, 17, 18, 27, -1, 22, 23, -1, 24, 10, -1, 9, 25, 11, 8, -1, 7, 0, 1, 5, -1, 6, 12, 13, -1, 19, 16, 26, 20, -1, 21];
function gpioAction(action: string): void {
  if (!started) return;
  if (action === 'K_SPACE') togglePause();
  else if (action === 'K_k') player.next();
  else if (action === 'K_b') player.previous();
  else if (action === 'K_s') toggleStop();
  else if (action.startsWith('+') || action.startsWith('-')) {
    const n = player.count, d = parseInt(action);
    if (n > 0 && !isNaN(d)) player.jump((((player.index + d) % n) + n) % n);
  } else {
    const i = parseInt(action);
    if (!isNaN(i) && `${i}` === action) { if (i >= 0 && i < player.count) player.jump(i); return; }
    const t = titles.findIndex(x => x === baseName(action));
    if (t >= 0) player.jump(t);
  }
}
for (const entry of str('gpio_pin_map').split(',')) {
  const kv = entry.split(':');
  if (kv.length !== 2) continue;
  const pin = parseInt(kv[0].trim().replaceAll('"', ''));
  const action = kv[1].trim().replaceAll('"', '');
  if (isNaN(pin) || pin < 0 || pin >= BOARD_TO_BCM.length || BOARD_TO_BCM[pin] < 0) { console.warn(`looper: gpio pin ${kv[0].trim()} is not a BOARD GPIO pin`); continue; }
  const bcm = BOARD_TO_BCM[pin];
  const up = flag('gpio_pin_mode');
  gpio.setup(bcm, 'in', up ? 'up' : 'down');
  gpio.watch(bcm, up ? 'falling' : 'rising', 200, () => gpioAction(action));
  log(`gpio BOARD ${pin} (BCM ${bcm}) -> ${action}`);
}

// ---------------------------------------------------------------- frame loop
function centered(y: number, s: string, scale: i32): void {
  gfx.text(Math.floor((W - s.length * 8 * scale) / 2), y, s, FG, scale);
}

gfx.onFrame((dt: number) => {
  fps = fps * 0.95 + (dt > 0 ? 1 / dt : 0) * 0.05;
  if (flag('keyboard_control')) {
    if (gfx.wasPressed(gfx.Btn.Right)) player.next();
    if (gfx.wasPressed(gfx.Btn.Left)) player.previous();
    if (gfx.wasPressed(gfx.Btn.Start)) { if (!started) { started = true; countdown = 0; stopped = false; start(); } else toggleStop(); }
    if (gfx.wasPressed(gfx.Btn.A)) togglePause();
    if (gfx.wasPressed(gfx.Btn.Select)) info = !info;
  }
  gfx.clear(BG);

  if (player.count === 0) {  // nothing to play yet: rescan the folder every 2 s (a USB stick may show up)
    rescan -= dt;
    if (rescan <= 0) { rescan = 2; player.close(); player = new Player(W, H); configure(); titles.length = 0; load(); if (player.count > 0) countdown = flag('osd') ? num('countdown_time') : 0; }
    if (flag('osd')) { centered(H / 2 - 16, 'Insert USB drive with compatible movies.', 2); centered(H / 2 + 16, `(no videos in ${str('path')})`, 1); }
    return;
  }
  if (!started) {
    if (countdown > 0) {
      countdown -= dt;
      centered(H / 2 - 24, `Found ${player.count} movie${player.count === 1 ? '' : 's'}.`, 3);
      centered(H / 2 + 16, `Starting playback in ${Math.ceil(countdown)}...`, 2);
      return;
    }
    if (stopped) return;
    started = true;
    start();
  }

  // wait_time: the file stopped on its own (ONE_SHOT), show the background for a while, then the next one
  if (num('wait_time') > 0 && !flag('one_shot_playback') && !stopped && !player.playing) {
    if (waitLeft <= 0) waitLeft = num('wait_time');
    waitLeft -= dt;
    if (waitLeft <= 0) player.play();
  }

  player.draw(0, 0, W, H);

  const i = player.index;
  if (i !== lastIndex && i >= 0) {
    lastIndex = i;
    titleLeft = num('title_duration');
    log(`playing ${i + 1}/${player.count} ${titles[i]} (${player.decoder})`);
    if (flag('resume_playlist')) storage.set('looper.index', `${i}`);
  }
  if (flag('show_titles') && i >= 0 && (titleLeft > 0 || num('title_duration') < 0)) {
    titleLeft -= dt;
    gfx.text(24, H - 48, titles[i], FG, 2);
  }
  if (paused) centered(24, 'PAUSED', 2);
  if (info) {
    gfx.rect(8, 8, 360, 76, 0x000000);
    gfx.text(16, 16, `${i + 1}/${player.count} ${i >= 0 ? titles[i] : ''}`, FG, 1);
    gfx.text(16, 30, `${player.position.toFixed(2)} / ${player.duration.toFixed(2)} s  loop ${player.loops}`, FG, 1);
    gfx.text(16, 44, `${player.decoder}  ${player.width}x${player.height}`, FG, 1);
    gfx.text(16, 58, `shown ${player.frames}  dropped ${player.dropped}  ${fps.toFixed(0)} fps`, FG, 1);
  }
});
