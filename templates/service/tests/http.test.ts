// The same API over HTTP: the server on a local port, requests with fetch, then the server stops.
import * as assert from 'zinc:assert';
import { serve, stop, fetch, Request, Reply } from 'zinc:net';
import { Store } from '../src/store';
import { handle } from '../src/api';

const PORT = 38000 + Math.floor(Math.random() * 1000);
const store = new Store();
serve(PORT, (req: Request): Reply => handle(store, req));

async function main(): Promise<void> {
  const base = `http://127.0.0.1:${PORT}`;
  const created = await fetch(`${base}/items`, { method: 'POST', body: '{"title":"over http"}', contentType: 'application/json' });
  assert.equal(created.status, 201);
  const list = await fetch(`${base}/items`);
  assert.equal(await list.text(), '[{"id":1,"title":"over http","done":false}]');
  const missing = await fetch(`${base}/items/7`);
  assert.equal(missing.status, 404);
  console.log('http: ok');
  stop();
}
main();
