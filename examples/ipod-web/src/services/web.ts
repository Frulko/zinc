// The web server: `/` the page, `/pod.json` the same data for a program, `/api/...` the iPod API, `/rest/...` Subsonic, else a 404.
import * as net from 'zinc:net';
import { last } from '../state';
import { page, json } from '../web/page';
import { api } from './api';
import { rest } from './subsonic';
import { options } from './options';

/** The path with the secrets of its query masked, as --log-requests prints it. */
export function masked(path: string): string { return path.replace(/([?&](?:p|t|s|apiKey|token|password)=)[^&]*/gi, '$1***'); }

/** handle(), and one line on the console: who, the method, the path masked, the status and a Subsonic error's code. */
async function logged(req: net.Request): Promise<net.Reply> {
  const r = await handle(req);
  const code = r.status === 200 && r.body.indexOf('"failed"') >= 0 ? /code[=":]+(\d+)/.exec(r.body) : null;
  console.log(`ipod-web: ${req.remoteAddress} ${req.method} ${masked(req.path)} ${r.status}${code !== null ? ' subsonic error ' + code[1] : ''}`);
  return r;
}

async function handle(req: net.Request): Promise<net.Reply> {
  const path = req.path.split('?')[0];
  if (path.startsWith('/api/')) return api(req);
  if (path.startsWith('/rest/')) return rest(req);
  if (req.method !== 'GET') return { status: 405, body: 'GET only\n', contentType: 'text/plain' };
  if (path === '/' || path === '/index.html') return { status: 200, body: page(last), contentType: 'text/html; charset=utf-8' };
  if (path === '/pod.json') return { status: 200, body: json(last), contentType: 'application/json' };
  return { status: 404, body: 'not found\n', contentType: 'text/plain' };
}

export function start(port: i32): void {
  net.serveAsync(port, options.logRequests ? logged : handle);
}
