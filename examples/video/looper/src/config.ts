// Settings: the video_looper.ini keys of videolooper.de, read from an INI file and overridden by CLI flags.
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import { EXTENSIONS } from 'zinc:video';

const settings = new Map<string, string>();

/** Every key with its default value, as pairs. */
const DEFAULTS: string[] = [
  'path', 'media', 'playlist', '', 'extensions', EXTENSIONS.join(', '),
  'is_random', 'false', 'is_random_unique', 'false', 'resume_playlist', 'false', 'one_shot_playback', 'false',
  'play_on_startup', 'true', 'wait_time', '0', 'bgcolor', '0, 0, 0', 'fgcolor', '255, 255, 255',
  'osd', 'true', 'countdown_time', '5', 'show_titles', 'false', 'title_duration', '10',
  'keyboard_control', 'true', 'console_output', 'false', 'info', 'false', 'gpio_pin_map', '', 'gpio_pin_mode', 'true',
];

export const HELP = `looper [folder] [options]   plays every video of the folder in a seamless loop
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

/** Raw value of a setting. */
export function setting(key: string): string { return settings.get(key) ?? ''; }

/** true / 1 / yes / on. */
export function flag(key: string): boolean {
  const v = setting(key).toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

/** A number, 0 when unset or invalid. */
export function num(key: string): number {
  const v = parseFloat(setting(key));
  return isNaN(v) ? 0 : v;
}

/** "R, G, B" as 0xRRGGBB (black when malformed). */
export function color(key: string): u32 {
  const c = setting(key).split(',');
  if (c.length !== 3) return 0;
  const channel = (s: string): i32 => parseInt(s.trim()) & 255;
  return (channel(c[0]) << 16) | (channel(c[1]) << 8) | channel(c[2]);
}

/** INI file: `key = value` lines, # or ; comments; `[directory] path` and `[playlist] path` get their own names. */
function loadIni(file: string): void {
  let section = '';
  for (const raw of fs.readText(file).split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#') || line.startsWith(';')) continue;
    if (line.startsWith('[')) { section = line.slice(1, line.indexOf(']')).trim(); continue; }
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    let key = line.slice(0, eq).trim();
    if (key === 'path') key = section === 'playlist' ? 'playlist' : 'path';
    settings.set(key, line.slice(eq + 1).trim());
  }
}

/** The INI file to read: --config FILE, else the first of the usual places that exists ('' if none). */
function findIni(args: string[]): string {
  for (let i = 0; i < args.length; i++) if (args[i] === '--config' && i + 1 < args.length) return args[i + 1];
  for (const c of ['video_looper.ini', '/boot/video_looper.ini', '/boot/firmware/video_looper.ini']) if (fs.exists(c)) return c;
  return '';
}

/** Flags override the file: --key value, --key=value, --key (true), --no-key (false); a bare argument is the folder. */
function applyFlags(args: string[]): void {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') { console.log(HELP); sys.exit(0); }
    if (a === '--config') { i++; continue; }
    if (!a.startsWith('--')) { settings.set('path', a); continue; }
    const eq = a.indexOf('=');
    if (eq > 0) { settings.set(a.slice(2, eq), a.slice(eq + 1)); continue; }
    const key = a.slice(2);
    if (key.startsWith('no-')) settings.set(key.slice(3), 'false');
    else if (i + 1 < args.length && !args[i + 1].startsWith('--')) { settings.set(key, args[i + 1]); i++; }
    else settings.set(key, 'true');
  }
}

/** Loads defaults, then the INI file, then the command line. Returns the INI file used ('' if none). */
export function loadSettings(): string {
  for (let i = 0; i < DEFAULTS.length; i += 2) settings.set(DEFAULTS[i], DEFAULTS[i + 1]);
  const args = sys.args();
  const ini = findIni(args);
  if (ini !== '') {
    try { loadIni(ini); } catch (e) { console.error(`looper: cannot read ${ini}`); sys.exit(1); }
  }
  applyFlags(args);
  if (num('wait_time') > 0 && flag('one_shot_playback')) console.warn('looper: one_shot_playback ignores wait_time');
  return ini;
}

/** Prints a state change when console_output is on. */
export function log(message: string): void {
  if (flag('console_output')) console.log(`looper: ${message}`);
}
