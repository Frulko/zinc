// The API without the network: requests built here, replies checked.
import * as assert from 'zinc:assert';
import { Headers, Request } from 'zinc:net';
import { Store } from '../src/store';
import { handle } from '../src/api';

function req(method: string, path: string, body: string = ''): Request { return { method: method, path: path, body: body, headers: new Headers() }; }

const s = new Store();
assert.equal(handle(s, req('GET', '/health')).body, '{"ok":true,"items":0}');
const created = handle(s, req('POST', '/items', '{"title": " Buy milk "}'));
assert.equal(created.status, 201);
assert.equal(created.body, '{"id":1,"title":"Buy milk","done":false}');
assert.equal(handle(s, req('POST', '/items', '{}')).status, 400);
assert.equal(handle(s, req('POST', '/items', 'not json')).status, 400);
assert.equal(handle(s, req('GET', '/items')).body, '[{"id":1,"title":"Buy milk","done":false}]');
assert.equal(handle(s, req('GET', '/items/1')).status, 200);
assert.equal(handle(s, req('GET', '/items/9')).status, 404);
assert.equal(handle(s, req('DELETE', '/items/1')).status, 204);
assert.equal(handle(s, req('GET', '/items')).body, '[]');
assert.equal(handle(s, req('PUT', '/items')).status, 405);
assert.equal(handle(s, req('GET', '/nope')).status, 404);
console.log('api: ok');
