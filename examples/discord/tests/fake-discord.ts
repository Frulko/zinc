// A fake Discord on 127.0.0.1 for tests/t1/discord.sh: the REST API and the gateway (HELLO, IDENTIFY -> READY with read states,
// heartbeat ACKs, RESUME -> RESUMED). It pushes one live message after the first history request and one after a RESUME, refuses a wrong
// token with close code 4004, and writes its two ports to FAKE_PORTS_FILE. Writing: typing answers 204 and Grace types back; a sent message
// is echoed as MESSAGE_CREATE with its nonce and empties its rate-limit bucket for 0.5 s (the next one must wait: waited=true); the first
// edit gets a 429 with retry_after; an edit and a delete are echoed as MESSAGE_UPDATE and MESSAGE_DELETE; the first ack of #general is
// answered with a MESSAGE_ACK of #welcome (read on another device). Every request it gets is printed.
import { serve, Request, Reply, Headers } from 'zinc:net';
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
  { id: '201', name: 'Makers', icon: null, channels: [{ id: '311', type: 0, name: 'welcome', position: 0, last_message_id: '930' }] },
];
const dms: any[] = [{ id: '400', type: 1, recipient_ids: ['101'], last_message_id: '950' }, { id: '401', type: 3, recipient_ids: ['101', '102'], last_message_id: '940' }];
// #general read up to 902 (903 is unread), #welcome up to 925 with 2 mentions, the DM read
const readStates: any[] = [{ id: '302', last_message_id: '902', mention_count: 0 }, { id: '311', last_message_id: '925', mention_count: 2 },
  { id: '400', last_message_id: '950', mention_count: 0 }];
const stamp = (minute: i32): string => `2026-10-30T09:${minute < 10 ? '0' : ''}${minute}:00.000000+00:00`;
const msg = (id: string, channel: string, author: any, content: string, minute: i32): any =>
  ({ id: id, channel_id: channel, author: author, content: content, timestamp: stamp(minute), edited_timestamp: null, attachments: [], mentions: [] });
const history: any = {
  '302': [msg('903', '302', users[0], 'Shipping the gateway today.', 12), msg('902', '302', me, 'Nice, the resume works too?', 11), msg('901', '302', users[0], 'Morning!', 10)],
  '400': [msg('950', '400', users[0], 'See you at the meetup', 30)],
};

let live: WebSocket | null = null;
let seq = 0;
let pushedFirst = false, ackedElsewhere = false, refusedEdit = false;
let nextId = 906;
let bucketEmptiedAt: number = 0, refusedAt: number = 0;
const dispatch = (t: string, d: any): void => { const ws = live; if (ws !== null) { seq++; ws.send(JSON.stringify({ op: 0, t: t, s: seq, d: d })); } };
const json = (status: i32, body: string, h: Headers | undefined = undefined): Reply =>
  h !== undefined ? { status: status, contentType: 'application/json', body: body, headers: h } : { status: status, contentType: 'application/json', body: body };
const sent: Map<string, any> = new Map<string, any>();

/** Discord's answer to a sent message: the user objects of its mentions, the message it answers. */
function created(channel: string, body: any): any {
  const m = msg(`${nextId++}`, channel, me, body.content, 20);
  m.nonce = body.nonce;
  const mentions: any[] = [];
  const content: string = body.content;
  for (const u of users) if (content.indexOf(`<@${u.id}>`) >= 0) mentions.push(u);
  m.mentions = mentions;
  if (body.message_reference !== undefined) {
    for (const h of history['302']) if (h.id === body.message_reference.message_id) m.referenced_message = h;
    m.message_reference = body.message_reference;
  }
  sent.set(m.id, m);
  return m;
}

const api = serve(0, (req: Request): Reply => {
  const auth = req.headers.get('authorization');
  const sp = req.headers.get('x-super-properties');
  const line = `rest ${req.method} ${req.path} auth=${auth === TOKEN} super=${sp.length > 0}`;
  if (auth !== TOKEN) { console.log(line); return json(401, '{"message":"401: Unauthorized","code":0}'); }
  const body: any = req.body !== '' ? JSON.parse(req.body) : null;
  const msgs = /^\/api\/v9\/channels\/(\d+)\/messages(\/(\d+))?(\/ack)?/.exec(req.path);
  const one = msgs !== null && msgs.length > 3 && typeof msgs[3] === 'string' ? msgs[3] : '';
  const ack = msgs !== null && msgs.length > 4 && msgs[4] === '/ack';
  const typing = /^\/api\/v9\/channels\/(\d+)\/typing$/.exec(req.path);
  if (req.method === 'GET' && msgs !== null && one === '') {
    console.log(line);
    if (msgs[1] === '302' && !pushedFirst) {
      pushedFirst = true;
      setTimeout(() => { dispatch('MESSAGE_CREATE', msg('904', '302', users[1], 'Live from the gateway', 13)); }, 200);
    }
    return json(200, JSON.stringify(history[msgs[1]] ?? []));
  }
  if (req.method === 'POST' && msgs !== null && ack) {
    console.log(`${line} last_viewed=${body.last_viewed > 3000} token=${body.token === null}`);
    if (msgs[1] === '302' && !ackedElsewhere) {
      ackedElsewhere = true;
      setTimeout(() => { dispatch('MESSAGE_ACK', { channel_id: '311', message_id: '930', mention_count: 0, version: 2 }); }, 50);
    }
    return json(200, '{"token":null}');
  }
  if (req.method === 'POST' && typing !== null) {
    console.log(line);
    const ch = typing[1];
    setTimeout(() => { dispatch('TYPING_START', { channel_id: ch, user_id: '101', timestamp: 1793350000 }); }, 100);
    return { status: 204, contentType: 'text/plain', body: '' };
  }
  if (req.method === 'POST' && msgs !== null && one === '') {
    // the message bucket: the first message empties it for 0.5 s, the next one must come after
    const waited = bucketEmptiedAt === 0 ? 'first' : `${Date.now() - bucketEmptiedAt >= 450}`;
    const nonceOk = typeof body.nonce === 'string' && /^\d{17,20}$/.test(body.nonce);
    const reply = body.message_reference !== undefined ? body.message_reference.message_id : '';
    console.log(`${line} content=${JSON.stringify(body.content)} nonce=${nonceOk} reply=${reply} waited=${waited}`);
    const m = created(msgs[1], body);
    dispatch('MESSAGE_CREATE', m);                                 // the echo, before the answer as on Discord
    if (reply !== '') setTimeout(() => { dispatch('MESSAGE_CREATE', msg(`${nextId++}`, msgs[1], users[0], 'Got it, *thanks*', 21)); }, 300);
    const h = new Headers();
    h.set('X-RateLimit-Bucket', 'b-messages'); h.set('X-RateLimit-Limit', '5');
    h.set('X-RateLimit-Remaining', bucketEmptiedAt === 0 ? '0' : '4'); h.set('X-RateLimit-Reset-After', '0.5');
    if (bucketEmptiedAt === 0) bucketEmptiedAt = Date.now();
    return json(200, JSON.stringify(m), h);
  }
  if (req.method === 'PATCH' && msgs !== null && one !== '') {
    if (!refusedEdit) {
      refusedEdit = true; refusedAt = Date.now();
      console.log(`${line} -> 429`);
      const h = new Headers();
      h.set('Retry-After', '1'); h.set('X-RateLimit-Scope', 'user'); h.set('X-RateLimit-Bucket', 'b-edit');
      h.set('X-RateLimit-Remaining', '0'); h.set('X-RateLimit-Reset-After', '0.3');
      return json(429, '{"message":"You are being rate limited.","retry_after":0.3,"global":false}', h);
    }
    console.log(`${line} content=${JSON.stringify(body.content)} waited=${Date.now() - refusedAt >= 280}`);
    const m: any = sent.get(one);
    m.content = body.content; m.edited_timestamp = stamp(22);
    dispatch('MESSAGE_UPDATE', m);
    return json(200, JSON.stringify(m));
  }
  if (req.method === 'DELETE' && msgs !== null && one !== '') {
    console.log(line);
    dispatch('MESSAGE_DELETE', { id: one, channel_id: msgs[1] });
    return { status: 204, contentType: 'text/plain', body: '' };
  }
  console.log(line);
  return json(404, '{"message":"404: Not Found","code":0}');
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
        resume_gateway_url: `ws://127.0.0.1:${gwPort}`, read_state: { entries: readStates, partial: false, version: 1 } });
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
