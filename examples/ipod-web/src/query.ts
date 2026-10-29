// A request's path without its query, and its parameters (the query, and a POSTed form's body).
import * as net from 'zinc:net';

export class Query {
  path: string = '';
  params: URLSearchParams = new URLSearchParams('');
  get(name: string): string { const v = this.params.get(name); return v === null ? '' : v as string; }
  num(name: string, fallback: i32): i32 { const v = parseInt(this.get(name)); return Number.isNaN(v) ? fallback : v; }
}

export function queryOf(req: net.Request): Query {
  const q = new Query();
  const at = req.path.indexOf('?');
  q.path = at < 0 ? req.path : req.path.slice(0, at);
  let search = at < 0 ? '' : req.path.slice(at + 1);
  if (req.method === 'POST' && req.headers.get('content-type').startsWith('application/x-www-form-urlencoded')) search += (search === '' ? '' : '&') + req.body;
  q.params = new URLSearchParams(search);
  return q;
}

export function jsonReply(status: i32, body: string): net.Reply {
  return { status: status, body: body + '\n', contentType: 'application/json; charset=utf-8' };
}
