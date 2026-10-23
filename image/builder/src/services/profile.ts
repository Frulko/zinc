// The profile the builder edits: the keys of image/profile.json a person chooses. It is laid over the repository's
// defaults by tools/pi-image, so the base image and the Zinc release stay pinned there unless the file names them.
// Saving keeps the keys the builder does not know, and the file is readable by its owner only.
import * as fs from 'zinc:fs';

export class Profile {
  name: string = 'zinc-pios';
  board: string = 'all';
  display: string = 'auto';
  hostname: string = 'zinc';
  userName: string = '';
  password: string = '';
  /** One public key per line. */
  sshKeys: string = '';
  ssh: boolean = false;
  wifiName: string = '';
  wifiPassword: string = '';
  wifiCountry: string = '';
  timezone: string = '';
  keyboard: string = '';
  bluetooth: boolean = false;
  agent: boolean = false;
  debugConsole: boolean = false;
  libraries: string[] = [];
  /** More Debian packages, separated by spaces. */
  packages: string = '';
  /** A Zinc project or .zapp started at boot; '' for the player alone. */
  app: string = '';
}

function stringOf(o: any, key: string, fallback: string): string { return typeof o[key] === 'string' ? o[key] as string : fallback; }
function booleanOf(o: any, key: string, fallback: boolean): boolean { return typeof o[key] === 'boolean' ? o[key] as boolean : fallback; }
function stringsOf(o: any, key: string): string[] {
  const values: string[] = [];
  if (Array.isArray(o[key])) for (const v of o[key] as any[]) if (typeof v === 'string') values.push(v as string);
  return values;
}
function objectOf(o: any, key: string): any { return typeof o[key] === 'object' && o[key] !== null ? o[key] : JSON.parse('{}'); }
function wordsOf(text: string, separator: string): string[] {
  return text.split(separator).map((w: string) => w.trim()).filter((w: string) => w !== '');
}

export function decodeProfile(text: string): Profile {
  const profile = new Profile();
  if (text.trim() === '') return profile;
  const o: any = JSON.parse(text);
  const user: any = objectOf(o, 'user');
  const wifi: any = objectOf(o, 'wifi');
  profile.name = stringOf(o, 'name', profile.name);
  profile.board = stringOf(o, 'board', profile.board);
  profile.display = stringOf(o, 'display', profile.display);
  profile.hostname = stringOf(o, 'hostname', profile.hostname);
  profile.userName = stringOf(user, 'name', '');
  profile.password = stringOf(user, 'password', '');
  profile.sshKeys = stringsOf(user, 'sshKeys').join('\n');
  profile.ssh = booleanOf(o, 'ssh', false);
  profile.wifiName = stringOf(wifi, 'ssid', '');
  profile.wifiPassword = stringOf(wifi, 'password', '');
  profile.wifiCountry = stringOf(wifi, 'country', '');
  profile.timezone = stringOf(o, 'timezone', '');
  profile.keyboard = stringOf(o, 'keyboard', '');
  profile.bluetooth = booleanOf(o, 'bluetooth', false);
  profile.agent = booleanOf(o, 'agent', false);
  profile.debugConsole = booleanOf(o, 'debug', false);
  profile.libraries = stringsOf(o, 'libraries');
  profile.packages = stringsOf(o, 'packages').join(' ');
  profile.app = stringOf(o, 'app', '');
  return profile;
}

/** The profile written over `previousText` (the file as it was): its other keys stay. */
export function encodeProfile(profile: Profile, previousText: string): string {
  const o: any = previousText.trim() === '' ? JSON.parse('{}') : JSON.parse(previousText);
  const user: any = objectOf(o, 'user');
  const wifi: any = objectOf(o, 'wifi');
  o.name = profile.name;
  o.board = profile.board;
  o.display = profile.display;
  o.hostname = profile.hostname;
  user.name = profile.userName;
  user.password = profile.password;
  user.sshKeys = wordsOf(profile.sshKeys, '\n');
  o.user = user;
  o.ssh = profile.ssh;
  wifi.ssid = profile.wifiName;
  wifi.password = profile.wifiPassword;
  wifi.country = profile.wifiCountry.toUpperCase();
  o.wifi = wifi;
  o.timezone = profile.timezone;
  o.keyboard = profile.keyboard;
  o.bluetooth = profile.bluetooth;
  o.agent = profile.agent;
  o.debug = profile.debugConsole;
  o.libraries = profile.libraries;
  o.packages = wordsOf(profile.packages, ' ');
  o.app = profile.app;
  return JSON.stringify(o) + '\n';
}

function readOrEmpty(path: string): string {
  try { return fs.readText(path); } catch (e) { return ''; }
}

export function loadProfile(path: string): Profile { return decodeProfile(readOrEmpty(path)); }

export function saveProfile(path: string, profile: Profile): void {
  fs.mkdir(path.slice(0, path.lastIndexOf('/')), true);
  fs.writeText(path, encodeProfile(profile, readOrEmpty(path)));
  fs.chmod(path, 0o600);
}
