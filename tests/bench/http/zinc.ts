import { serve, Reply, Request } from 'zinc:net';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
// The server of tools/bench-http: the same three routes as node.mjs and bun.ts. Arguments: port, file, [tls port, cert, key].
const a = sys.args();
const file = a[1];
const handler = (req: Request): Reply => {
  if (req.path === '/json') return { status: 200, body: JSON.stringify({ message: 'Hello, World!' }), contentType: 'application/json' };
  if (req.path === '/file') return { status: 200, body: '', contentType: 'application/octet-stream', file: file };
  return { status: 200, body: 'Hello, World!', contentType: 'text/plain' };
};
serve(parseInt(a[0]) as i32, handler);
if (a.length > 2) serve(parseInt(a[2]) as i32, handler, { cert: fs.readText(a[3]), key: fs.readText(a[4]) });
console.log('ready');
