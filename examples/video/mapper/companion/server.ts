// Mapper web companion on Zinc: serves the editor (index.html) with zinc:net and relays it to the app as OSC (zinc:osc). The Node version is server.mjs.
//   zinc run examples/video/mapper/companion/server.ts -- [--app 127.0.0.1:9000] [--http 8080] [--reply 9001] [--reply-host 127.0.0.1] [--token <secret>] [--dir <folder of index.html>]
// HTTP API: POST /osc  [[address, ...args], ...]  -> one OSC message each (numbers as float32, strings as s)
//           GET /state -> sends /sync <reply-host> <reply> and answers with {layers, selected, aspect, layers: [...]}
// The API needs the token printed at start (header x-zinc-token; the editor gets it from its URL); the page itself does not.
import { serveAsync, Request, Reply } from 'zinc:net';
import { send, listen, OscMessage } from 'zinc:osc';
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';

function opt(name: string, def: string): string {
  const a = sys.args();
  for (let i: i32 = 0; i + 1 < a.length; i++) if (a[i] === '--' + name) return a[i + 1];
  return def;
}
function hex(bytes: u8[]): string {
  const d = '0123456789abcdef';
  let s = '';
  for (const b of bytes) s += d.charAt((b >> 4) & 15) + d.charAt(b & 15);
  return s;
}

const app = opt('app', '127.0.0.1:9000');
const colon = app.lastIndexOf(':');
const appHost = app.slice(0, colon);
const appPort: i32 = parseInt(app.slice(colon + 1));
const httpPort: i32 = parseInt(opt('http', '8080'));
const replyPort: i32 = parseInt(opt('reply', '9001'));
const replyHost = opt('reply-host', '127.0.0.1');
const envToken = sys.env('ZINC_COMPANION_TOKEN');
const token = opt('token', envToken.length > 0 ? envToken : hex(sys.randomBytes(16)));
function findDir(): string {   // the program runs in its project folder (zinc.json), so look around
  for (const d of ['.', 'companion', 'examples/video/mapper/companion', '../examples/video/mapper/companion']) if (fs.exists(d + '/index.html')) return d;
  return '.';
}
const dir = opt('dir', findDir());
const page = fs.readText(dir + '/index.html');   // read once at start

// /state: the app answers /sync with /state/info {json}, then /state/layer i {json} per layer.
let info: any = null;
let layers: string[] = [];
let want: i32 = -1;
let settle: ((v: boolean) => void) | null = null;
listen(replyPort, (m: OscMessage) => {
  if (settle === null) return;
  if (m.address === '/state/info' && m.strings.length > 0) { info = JSON.parse(m.strings[0]); want = info.layers as i32; }
  else if (m.address === '/state/layer' && m.numbers.length > 0 && m.strings.length > 0) layers[m.numbers[0] as i32] = m.strings[0];
  let have: i32 = 0;
  for (let i: i32 = 0; i < layers.length; i++) if (layers[i] !== undefined) have++;
  if (want >= 0 && have >= want) { const f = settle; settle = null; if (f !== null) f(true); }
});
function state(): Promise<string> {
  info = null; layers = []; want = -1;
  return new Promise<string>((resolve: (v: string) => void) => {
    settle = (ok: boolean) => {
      let parts = '';
      for (let i: i32 = 0; i < want; i++) parts += (i > 0 ? ',' : '') + layers[i];
      resolve('{"layers":[' + parts + '],"selected":' + JSON.stringify(info.selected) + ',"aspect":' + JSON.stringify(info.aspect) + '}');
    };
    setTimeout(() => { if (settle !== null) { settle = null; resolve(''); } }, 1000);
    send(appHost, appPort, '/sync', [replyPort], [replyHost]);
  });
}

function reply(status: i32, body: string, type: string): Reply { return { status, body, contentType: type }; }
const json = 'application/json';

serveAsync(httpPort, (req: Request): Promise<Reply> => {
  try { return handle(req); } catch (e) { console.error('handler: ' + e); return Promise.resolve(reply(500, '{"error":"internal error"}', json)); }
});
function handle(req: Request): Promise<Reply> {
  const path = req.path;
  if (req.method === 'GET' && (path === '/' || path.startsWith('/?') || path === '/index.html' || path.startsWith('/index.html?')))
    return Promise.resolve(reply(200, page, 'text/html; charset=utf-8'));
  const authed = req.headers.get('x-zinc-token') === token;
  if ((path === '/state' || path === '/osc') && !authed) return Promise.resolve(reply(401, '{"error":"missing or wrong x-zinc-token"}', json));
  if (req.method === 'GET' && path === '/state')
    return state().then((s: string) => s.length > 0 ? reply(200, s, json) : reply(504, '{"error":"no answer from ' + app + '"}', json));
  if (req.method === 'POST' && path === '/osc') {
    if (req.body.length > 1048576) return Promise.resolve(reply(413, '{}', json));
    let msgs: any = null;
    try { msgs = JSON.parse(req.body); } catch (e) { return Promise.resolve(reply(400, '{"error":"invalid JSON"}', json)); }
    if (!Array.isArray(msgs)) return Promise.resolve(reply(400, '{"error":"expected [[address, ...args], ...]"}', json));
    for (const m of msgs as any[]) {
      if (!Array.isArray(m) || typeof m[0] !== 'string' || !(m[0] as string).startsWith('/')) return Promise.resolve(reply(400, '{"error":"expected [[address, ...args], ...]"}', json));
    }
    for (const m of msgs as any[]) {
      const nums: f64[] = [];
      const strs: string[] = [];
      for (let i: i32 = 1; i < (m as any[]).length; i++) { const a = (m as any[])[i]; if (typeof a === 'string') strs.push(a as string); else nums.push(a as number); }
      send(appHost, appPort, m[0] as string, nums, strs);
    }
    return Promise.resolve(reply(204, '', json));
  }
  return Promise.resolve(reply(404, '{}', json));
}

console.error('companion: http://localhost:' + httpPort + '/?token=' + token + '  ->  osc ' + app + '  (state replies to ' + replyHost + ':' + replyPort + ')');
