// A fake Discord on 127.0.0.1 for tests/t1/discord.sh: the REST API (a channel's history) and the gateway (HELLO, IDENTIFY -> READY,
// heartbeat ACKs, RESUME -> RESUMED). It pushes one live message after the first history request and one after a RESUME, refuses a
// wrong token with close code 4004, and writes its two ports to FAKE_PORTS_FILE. Every request it gets is printed.
import { serve, Request, Reply } from 'zinc:net';
import { serveWebSocket, WebSocket, MessageEvent, UpgradeRequest } from 'zinc:socket';
import { env } from 'zinc:sys';
import { writeText } from 'zinc:fs';

const TOKEN = 'test-token';
const me: any = { id: '100', username: 'ada', global_name: 'Ada', avatar: null };
const users: any[] = [{ id: '101', username: 'grace', global_name: 'Grace', avatar: null }, { id: '102', username: 'linus', global_name: null, avatar: null }];
const guilds: any[] = [
  { id: '200', properties: { name: 'Zinc Lab', icon: null }, channels: [
    { id: '301', type: 4, name: 'Text', position: 0 },
    { id: '302', type: 0, name: 'general', position: 0, parent_id: '301', last_message_id: '903' },
    { id: '303', type: 0, name: 'random', position: 1, parent_id: '301' },
    { id: '304', type: 2, name: 'Lounge', position: 0 },
  ] },
  { id: '201', name: 'Makers', icon: null, channels: [{ id: '311', type: 0, name: 'welcome', position: 0 }] },
];
const dms: any[] = [{ id: '400', type: 1, recipient_ids: ['101'], last_message_id: '950' }, { id: '401', type: 3, recipient_ids: ['101', '102'], last_message_id: '940' }];
const msg = (id: string, channel: string, author: any, content: string, minute: i32): any =>
  ({ id: id, channel_id: channel, author: author, content: content, timestamp: `2026-10-30T09:${minute < 10 ? '0' : ''}${minute}:00.000000+00:00`, edited_timestamp: null, attachments: [] });
const history: any = {
  '302': [msg('903', '302', users[0], 'Shipping the gateway today.', 12), msg('902', '302', me, 'Nice, the resume works too?', 11), msg('901', '302', users[0], 'Morning!', 10)],
  '400': [msg('950', '400', users[0], 'See you at the meetup', 30)],
};

let live: WebSocket | null = null;
let seq = 0;
let pushedFirst = false;
const dispatch = (t: string, d: any): void => { const ws = live; if (ws !== null) { seq++; ws.send(JSON.stringify({ op: 0, t: t, s: seq, d: d })); } };

const api = serve(0, (req: Request): Reply => {
  const auth = req.headers.get('authorization');
  const sp = req.headers.get('x-super-properties');
  console.log(`rest ${req.method} ${req.path} auth=${auth === TOKEN} super=${sp.length > 0}`);
  if (auth !== TOKEN) return { status: 401, contentType: 'application/json', body: '{"message":"401: Unauthorized","code":0}' };
  const m = /^\/api\/v9\/channels\/(\d+)\/messages/.exec(req.path);
  if (req.method === 'GET' && m !== null) {
    if (m[1] === '302' && !pushedFirst) {
      pushedFirst = true;
      setTimeout(() => { dispatch('MESSAGE_CREATE', msg('904', '302', users[1], 'Live from the gateway', 13)); }, 200);
    }
    return { status: 200, contentType: 'application/json', body: JSON.stringify(history[m[1]] ?? []) };
  }
  return { status: 404, contentType: 'application/json', body: '{"message":"404: Not Found","code":0}' };
});

async function main(): Promise<void> {
const gw = await serveWebSocket(0, (ws: WebSocket, req: UpgradeRequest) => {
  console.log(`gateway ${req.path} agent=${(req.header('user-agent')).indexOf('Chrome') > 0}`);
  live = ws;
  ws.send(JSON.stringify({ op: 10, d: { heartbeat_interval: 41250 } }));
  ws.onmessage = (e: MessageEvent): void => {
    const p: any = JSON.parse(e.data);
    if (p.op === 1) ws.send('{"op":11}');
    else if (p.op === 2) {
      console.log(`identify token=${p.d.token === TOKEN} capabilities=${p.d.capabilities} browser=${p.d.properties.browser}`);
      if (p.d.token !== TOKEN) { ws.close(4004, 'Authentication failed.'); return; }
      dispatch('READY', { v: 9, user: me, users: users, guilds: guilds, private_channels: dms, session_id: 'sess-1',
        resume_gateway_url: `ws://127.0.0.1:${gwPort}`, read_state: { entries: [], partial: false, version: 1 } });
    } else if (p.op === 6) {
      console.log(`resume session=${p.d.session_id} seq=${p.d.seq}`);
      dispatch('RESUMED', null);
      setTimeout(() => { dispatch('MESSAGE_CREATE', msg('905', '302', users[0], 'Back after the drop', 14)); }, 200);
    }
  };
}, '127.0.0.1');
gwPort = gw.port;
writeText(env('FAKE_PORTS_FILE'), `${api} ${gw.port}\n`);
}
let gwPort: i32 = 0;
main();
