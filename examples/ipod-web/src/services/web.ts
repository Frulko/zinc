// The web server: `/` the page, `/pod.json` the same data for a program, anything else a 404.
import * as net from 'zinc:net';
import { last } from '../state';
import { page, json } from '../page';

export function start(port: i32): void {
  net.serve(port, (req: net.Request): net.Reply => {
    if (req.method !== 'GET') return { status: 405, body: 'GET only\n', contentType: 'text/plain' };
    if (req.path === '/' || req.path === '/index.html') return { status: 200, body: page(last), contentType: 'text/html; charset=utf-8' };
    if (req.path === '/pod.json') return { status: 200, body: json(last), contentType: 'application/json' };
    return { status: 404, body: 'not found\n', contentType: 'text/plain' };
  });
}
