// The profile the builder edits: the keys of image/profile.json a person chooses. It is laid over the repository's
// defaults by tools/pi-image, so the base image and the Zinc release stay pinned there unless the file names them.
// Saving keeps the keys the builder does not know, and the file is readable by its owner only.
import * as fs from 'zinc:fs';

export class Profile {
  name: string = 'zinc-pios';
  board: string = 'all';
  display: string = 'auto';
  hostname: string = '';
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
  /** Boot into the Zinc shell (top bar, app hub, store): ZINC_SHELL=1 in /etc/zinc/session.conf. */
  shell: boolean = false;
  /** Two system slots and safe updates (RAUC). */
  ab: boolean = false;
  /** Free space added to the system partition, in MiB. */
  growMiB: string = '1536';
  libraries: string[] = [];
  /** More Debian packages, separated by spaces. */
  packages: string = '';
  /** A Zinc project or .zapp started at boot; '' for the player alone. */
  app: string = '';
}

function stringOf(o: any, key: string, fallback: string): string { return typeof o[key] === 'string' ? o[key] as string : fallback; }
function numberText(o: any, key: string, fallback: string): string { return typeof o[key] === 'number' ? '' + (o[key] as number) : fallback; }
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
  if (o === null || typeof o !== 'object' || Array.isArray(o)) throw new Error('The profile must be a JSON object.');
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
  profile.shell = booleanOf(o, 'shell', false);
  profile.ab = booleanOf(o, 'ab', false);
  profile.growMiB = numberText(o, 'growMiB', profile.growMiB);
  profile.libraries = stringsOf(o, 'libraries');
  profile.packages = stringsOf(o, 'packages').join(' ');
  profile.app = stringOf(o, 'app', '');
  return profile;
}

/** The profile written over `previousText` (the file as it was): its other keys stay. */
export function encodeProfile(profile: Profile, previousText: string): string {
  const o: any = previousText.trim() === '' ? JSON.parse('{}') : JSON.parse(previousText);
  if (o === null || typeof o !== 'object' || Array.isArray(o)) throw new Error('The profile must be a JSON object.');
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
  o.shell = profile.shell;
  o.ab = profile.ab;
  const grow = parseInt(profile.growMiB);
  o.growMiB = grow > 0 ? grow : 1536;
  o.libraries = profile.libraries;
  o.packages = wordsOf(profile.packages, ' ');
  o.app = profile.app;
  return JSON.stringify(o) + '\n';
}

function engineUrl(text: string): string {
  if (text.trim() === '') return '';
  const o: any = JSON.parse(text);
  return o === null || typeof o !== 'object' ? '' : stringOf(objectOf(o, 'zinc'), 'url', '');
}

/** The Zinc release an image carries (its engine and its player): the version in the download URL of the profile's
 *  engine, or of image/profile.json's when the profile names none; '' when the URL is not a release. */
export function engineVersion(profileText: string, defaultText: string): string {
  const url = engineUrl(profileText) !== '' ? engineUrl(profileText) : engineUrl(defaultText);
  const at = url.indexOf('/download/v');
  if (at < 0) return '';
  const rest = url.slice(at + '/download/v'.length);
  return rest.indexOf('/') < 0 ? '' : rest.slice(0, rest.indexOf('/'));
}

export function readProfileText(path: string): string {
  return fs.exists(path) ? fs.readText(path) : '';
}

export function loadProfile(path: string): Profile { return decodeProfile(readProfileText(path)); }

/** Write beside the destination, inside a private directory, then replace the complete file. */
export function savePrivateText(path: string, text: string): void {
  const slash = path.lastIndexOf('/');
  const directory = slash < 0 ? '.' : slash === 0 ? '/' : path.slice(0, slash);
  fs.mkdir(directory, true);
  const temp = fs.mkdtemp(directory + '/.pi-profile-');
  try {
    fs.writeText(temp + '/profile', text);
    fs.chmod(temp + '/profile', 0o600);
    fs.rename(temp + '/profile', path);
  } finally { fs.remove(temp, true); }
}

export function saveProfile(path: string, profile: Profile, previousText: string | null = null): void {
  savePrivateText(path, encodeProfile(profile, previousText === null ? readProfileText(path) : previousText));
}
