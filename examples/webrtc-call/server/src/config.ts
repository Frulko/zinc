import * as fs from 'zinc:fs';
import * as assets from 'zinc:assets';
import * as sys from 'zinc:sys';
import * as proc from 'zinc:process';
import { toHex } from 'zinc:web';

export interface Config {
  domain: string;
  port: i32;
  udpPort: i32;
  turn: string;
  local: boolean;
}

export function option(args: string[], key: string, fallback: string): string {
  const at = args.indexOf('--' + key);
  if (at < 0) return fallback;
  if (at + 1 >= args.length || args[at + 1].startsWith('--')) throw new Error('--' + key + ' needs a value');
  return args[at + 1];
}

export function number(value: string, low: number, high: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < low || n > high) throw new Error('Number outside ' + low + '..' + high);
  return n;
}

function port(value: string): i32 {
  if (!/^[0-9]+$/.test(value)) throw new Error('Ports must be integers');
  return number(value, 1, 65535) as i32;
}

export function roomName(room: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(room)) throw new Error('Room: use 1–63 lowercase letters, digits or hyphens');
  return room;
}

export async function command(cmd: string, args: string[]): Promise<string> {
  const result = await proc.run(cmd, args, {});
  if (result.code !== 0) throw new Error(cmd + ' failed (' + result.code + '): ' + result.stderr);
  return result.stdout.trim();
}

export function zinc(): string { return sys.env('ZINC') || 'zinc'; }

function copyTree(from: string, to: string): void {
  if (!fs.mkdir(to)) throw new Error('Cannot create ' + to);
  for (const entry of fs.readDir(from)) {
    if (entry.isSymlink) throw new Error('Unexpected symbolic link in pinned web assets');
    if (entry.isDirectory) copyTree(from + '/' + entry.name, to + '/' + entry.name);
    else if (entry.isFile) fs.copyFile(from + '/' + entry.name, to + '/' + entry.name);
  }
}

export function origin(config: Config): string {
  return (config.local ? 'http://' : 'https://') + config.domain + (config.port === 443 && !config.local ? '' : ':' + config.port);
}

export function load(data: string): Config {
  const mode = fs.lstat(data);
  if (!mode.isDirectory || mode.isSymlink || (mode.mode & 0o077) !== 0) throw new Error('Data directory must be a private directory (0700)');
  const config = JSON.parse(fs.readText(data + '/server.json')) as Config;
  validate(config);
  for (const path of ['/server.json', '/data/config.json']) {
    const st = fs.lstat(data + path);
    if (!st.isFile || st.isSymlink || (st.mode & 0o077) !== 0) throw new Error('Private configuration required (0600): ' + path);
  }
  return config;
}

function validate(config: Config): void {
  if (typeof config.local !== 'boolean' || typeof config.domain !== 'string' || typeof config.turn !== 'string') throw new Error('Invalid server.json');
  if (typeof config.port !== 'number' || typeof config.udpPort !== 'number') throw new Error('Invalid port in server.json');
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(config.domain) || config.domain.length > 253 || config.domain.indexOf('..') >= 0) throw new Error('Invalid domain');
  if (config.local && config.domain !== '127.0.0.1') throw new Error('--local requires --domain 127.0.0.1');
  for (const port of [config.port, config.udpPort]) {
    number(port.toString(), 1, 65535);
    if (Math.floor(port) !== port) throw new Error('Ports must be integers');
  }
  if (config.turn !== '' && !/^:[0-9]+$/.test(config.turn)) throw new Error('--turn must be :PORT or an empty string');
  if (config.turn !== '') number(config.turn.slice(1), 1, 65535);
  if (config.turn !== '' && Number(config.turn.slice(1)) === config.udpPort) throw new Error('TURN and SFU UDP ports must differ');
  if (config.local && config.turn !== '') throw new Error('Local mode disables built-in TURN');
}

export async function setup(data: string, args: string[]): Promise<void> {
  const local = args.indexOf('--local') >= 0;
  const config: Config = {
    domain: option(args, 'domain', ''),
    port: port(option(args, 'port', local ? '8443' : '443')),
    udpPort: port(option(args, 'udp-port', '10000')),
    turn: option(args, 'turn', local || args.indexOf('--coturn-url') >= 0 ? '' : ':1194'),
    local,
  };
  validate(config);
  const room = roomName(option(args, 'room', toHex(sys.randomBytes(8))));
  const maxClients = number(option(args, 'max-clients', '25'), 1, 1000);
  if (Math.floor(maxClients) !== maxClients) throw new Error('--max-clients must be an integer');
  const turnURL = option(args, 'coturn-url', '');
  const secretInput = option(args, 'coturn-secret-file', '');
  const secretFile = secretInput === '' || secretInput.startsWith('/') ? secretInput : sys.launchDir() + '/' + secretInput;
  if ((turnURL === '') !== (secretFile === '')) throw new Error('Provide both --coturn-url and --coturn-secret-file');
  if (turnURL !== '' && !/^turns?:[a-zA-Z0-9.-]+:[0-9]+(?:\?transport=(?:tcp|udp))?$/.test(turnURL)) throw new Error('Invalid coturn URL');
  if (turnURL !== '') port(turnURL.slice(turnURL.lastIndexOf(':') + 1).split('?')[0]);
  if (secretFile !== '') {
    const st = fs.lstat(secretFile);
    if (!st.isFile || st.isSymlink || (st.mode & 0o077) !== 0) throw new Error('coturn secret must be a private regular file (0600)');
  }
  const secret = secretFile === '' ? '' : fs.readText(secretFile).trim();
  if (secretFile !== '' && secret.length < 32) throw new Error('coturn secret must contain at least 32 characters');
  if (fs.exists(data)) throw new Error('Refusing to replace existing data: ' + data);
  await command(zinc(), ['toolchain', 'install', 'galene']);
  const source = data + '.galene-source';
  await command(zinc(), ['toolchain', 'fetch', 'https://codeload.github.com/jech/galene/tar.gz/refs/tags/galene-1.2.1',
    '230db9843995f6776b885cf7cb88d7de241abefc634e7845e20ce001fcdefd1a', source, 'static/galene.html']);
  const slash = data.lastIndexOf('/');
  const staging = fs.mkdtemp(data.slice(0, slash + 1) + '.call-setup-');
  try {
    fs.chmod(staging, 0o700);
    for (const dir of ['/data', '/data/var', '/groups']) {
      if (!fs.mkdir(staging + dir)) throw new Error('Cannot create ' + dir);
      fs.chmod(staging + dir, 0o700);
    }
    fs.writeText(staging + '/server.json', JSON.stringify(config) + '\n');
    fs.writeText(staging + '/data/config.json', JSON.stringify({ users: { admin: { password: toHex(sys.randomBytes(32)), permissions: 'admin' } }, writableGroups: true }) + '\n');
    fs.writeText(staging + '/groups/' + room + '.json', JSON.stringify({ codecs: ['vp8', 'opus'], 'max-clients': maxClients, autokick: args.indexOf('--autokick') >= 0 }) + '\n');
    const ice = turnURL === '' ? [] : [{ urls: [turnURL], username: 'galene', credential: secret, credentialType: 'hmac-sha1' }];
    fs.writeText(staging + '/data/ice-servers.json', JSON.stringify(ice) + '\n');
    for (const file of ['/server.json', '/data/config.json', '/data/ice-servers.json', '/groups/' + room + '.json']) fs.chmod(staging + file, 0o600);
    copyTree(source + '/static', staging + '/static');
    for (const file of ['join.html', 'join.js', 'join.css']) fs.writeBytes(staging + '/static/' + file, assets.readBytes(file));
    fs.copyFile(source + '/LICENCE', staging + '/static/GALENE-LICENCE');
    if (fs.exists(data)) throw new Error('Data appeared during setup; refusing to replace it');
    fs.rename(staging, data);
  } finally {
    fs.remove(staging, true);
  }
  console.log('Configured room ' + room + ' at ' + origin(config) + '; private data: ' + data);
  console.log('Start run, then link ' + room + '. Install a trusted domain certificate in data/cert.pem and data/key.pem before public use.');
}
