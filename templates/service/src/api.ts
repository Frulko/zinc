// The API: a request in, a reply out, no network here (what tests/api.test.ts checks).
import { Request, Reply } from 'zinc:net';
import { Store, Item } from './store';

function json(status: i32, body: string): Reply { return { status: status, contentType: 'application/json', body: body }; }
function error(status: i32, message: string): Reply { return json(status, JSON.stringify({ error: message })); }
function itemJson(it: Item): string { return JSON.stringify({ id: it.id, title: it.title, done: it.done }); }

export function handle(store: Store, req: Request): Reply {
  const path = req.path.split('?')[0];
  if (path === '/health' && req.method === 'GET') return json(200, JSON.stringify({ ok: true, items: store.items.length }));
  if (path === '/items') {
    if (req.method === 'GET') return json(200, '[' + store.items.map((it: Item): string => itemJson(it)).join(',') + ']');
    if (req.method === 'POST') {
      let title = '';
      try { const o: any = JSON.parse(req.body); if (typeof o.title === 'string') title = (o.title as string).trim(); } catch (e) { return error(400, 'the body is not JSON'); }
      if (title === '') return error(400, 'a title is needed');
      return json(201, itemJson(store.add(title)));
    }
    return error(405, 'GET or POST');
  }
  if (path.startsWith('/items/')) {
    const id = parseInt(path.slice(7));
    const it = store.find(id);
    if (it === null) return error(404, 'no such item');
    if (req.method === 'GET') return json(200, itemJson(it));
    if (req.method === 'DELETE') { store.remove(id); return { status: 204, contentType: 'text/plain', body: '' }; }
    return error(405, 'GET or DELETE');
  }
  return error(404, 'not found');
}
