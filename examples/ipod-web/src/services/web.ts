// The web server: `/` the page, `/pod.json` the same data for a program, `/api/...` the iPod API, `/rest/...` Subsonic, else a 404.
import * as net from 'zinc:net';
import { last } from '../state';
import { page, json } from '../web/page';
import { api } from './api';
import { rest } from './subsonic';

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
  net.serveAsync(port, handle);
}
