import * as fs from 'zinc:fs';
import * as proc from 'zinc:process';
import { encode } from 'zinc:qrcode';
import { Config, origin, roomName } from './config';

interface ApiReply { status: number; headers: string; body: string }

function header(reply: ApiReply, name: string): string {
  for (const line of reply.headers.split('\n')) {
    const colon = line.indexOf(':');
    if (colon >= 0 && line.slice(0, colon).toLowerCase() === name) return line.slice(colon + 1).trim();
  }
  return '';
}

// curl's stdin config keeps the admin password out of process arguments; TLS and hostname verification stay on.
async function api(data: string, config: Config, path: string, method: string, body: string = '', etag: string = ''): Promise<ApiReply> {
  const admin = JSON.parse(fs.readText(data + '/data/config.json')) as { users: { admin: { password: string } } };
  if (!/^[a-f0-9]{64}$/.test(admin.users.admin.password)) throw new Error('Invalid admin password in data/config.json');
  let settings = 'url = ' + JSON.stringify(origin(config) + '/galene-api/v0/.groups/' + path) + '\n';
  settings += 'user = ' + JSON.stringify('admin:' + admin.users.admin.password) + '\n';
  settings += 'request = ' + JSON.stringify(method) + '\n';
  if (!config.local) {
    settings += 'resolve = ' + JSON.stringify(config.domain + ':' + config.port + ':127.0.0.1') + '\n';
    settings += 'cacert = ' + JSON.stringify(data + '/data/cert.pem') + '\n';
  }
  if (body !== '') settings += 'header = "Content-Type: application/json"\ndata = ' + JSON.stringify(body) + '\n';
  if (etag !== '') settings += 'header = ' + JSON.stringify('If-Match: ' + etag) + '\n';
  const child = proc.spawn('curl', ['--config', '-', '--silent', '--show-error', '--noproxy', '*', '--max-time', '10', '--max-filesize', '1048576', '--dump-header', '-', '--write-out', '\n%{http_code}'], {});
  let out = '', error = '';
  child.onData((chunk: string, stderr: boolean) => { if (stderr) error += chunk; else out += chunk; });
  child.write(settings);
  child.closeStdin();
  const code = await child.exited;
  if (code !== 0) throw new Error('Galène API transport failed: ' + error.trim());
  const end = out.lastIndexOf('\n');
  const split = out.indexOf('\r\n\r\n');
  if (split < 0 || end < split) throw new Error('Invalid Galène API response');
  const reply: ApiReply = { status: Number(out.slice(end + 1)), headers: out.slice(0, split), body: out.slice(split + 4, end) };
  if (reply.status < 200 || reply.status >= 300) throw new Error('Galène API returned HTTP ' + reply.status);
  return reply;
}

export async function link(data: string, config: Config, room: string, hours: number, moderator: boolean): Promise<void> {
  const expires = new Date(Date.now() + hours * 3600000).toISOString();
  const permissions = moderator ? ['op', 'present', 'message', 'token'] : ['present', 'message'];
  const reply = await api(data, config, roomName(room) + '/.tokens/', 'POST', JSON.stringify({ expires, permissions }));
  const token = header(reply, 'location');
  if (reply.status !== 201 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error('Galène did not return a token');
  const url = origin(config) + '/join.html#' + room + '/' + token;
  console.log(url);
  console.log('Expires: ' + expires + (moderator ? ' (moderator)' : ''));
  const qr = encode(url);
  for (let y = -4; y < qr.size + 4; y++) {
    let line = '';
    for (let x = -4; x < qr.size + 4; x++) line += qr.module(x, y) ? '██' : '  ';
    console.log('\u001b[30;47m' + line + '\u001b[0m');
  }
}

export async function revoke(data: string, config: Config, room: string, token: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) throw new Error('Invalid token');
  const path = roomName(room) + '/.tokens/' + token;
  const reply = await api(data, config, path, 'GET');
  const etag = header(reply, 'etag');
  if (etag === '') throw new Error('Galène did not return an ETag');
  await api(data, config, path, 'DELETE', '', etag);
  console.log('Revoked; existing participants are not disconnected.');
}
