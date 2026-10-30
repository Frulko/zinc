// A fake Discord on 127.0.0.1 for tests/t1/discord.sh: the REST API, the CDN and the gateway (HELLO, IDENTIFY -> READY with read states,
// heartbeat ACKs, RESUME -> RESUMED). It pushes one live message after the first history request and one after a RESUME, refuses a wrong
// token with close code 4004, and writes its two ports to FAKE_PORTS_FILE. Writing: typing answers 204 and Grace types back; a sent message
// is echoed as MESSAGE_CREATE with its nonce and empties its rate-limit bucket for 0.5 s (the next one must wait: waited=true); the first
// edit gets a 429 with retry_after; an edit and a delete are echoed as MESSAGE_UPDATE and MESSAGE_DELETE; the first ack of #general is
// answered with a MESSAGE_ACK of #welcome (read on another device). Pictures: the CDN (/cdn/) serves the PNGs of FAKE_ASSETS for avatars,
// server icons and emoji; #general's photo has an expired signed URL, which only /attachments/refresh-urls makes valid. Upload: POST
// /channels/302/attachments gives an upload_url on this server, the PUT there stores the bytes, and the message that names them carries an
// image attachment. Op 37 for #general answers a member list SYNC, then an INSERT and an UPDATE. #general has FAKE_HISTORY messages before
// its last three (67 by default: a first page of 50, then one of 20), paged by ?before=. Voice (tests/t1/discord_voice.sh): op 4 answers
// VOICE_STATE_UPDATE (ours and Grace's, who is in every call) and VOICE_SERVER_UPDATE naming a voice gateway v8 on this machine (Hello,
// Ready with a UDP port, IP discovery, Session Description in the mode chosen, Speaking for Grace); Grace's audio is ours sent back: each
// packet received is opened with the session's key and sent again as her SSRC. A DM call rings (POST /call/ring) and asks for DAVE
// (dave_protocol_version 1): the key package is printed, no MLS group is made. Every request it gets is printed.
// #showcase holds one message of each kind of content
// (showcase.ts): once its history is asked for, the preview of a link arrives as a partial MESSAGE_UPDATE and Grace and Ada react; a
// reaction PUT or DELETE and a poll vote are answered 204 and echoed, Linus votes too; the thread #release-talk has its history, the forum
// #ideas its posts (threads/search), after which a new thread is created (THREAD_CREATE). Every request it gets is printed.
import { serve, Request, Reply, Headers } from 'zinc:net';
import { serveWebSocket, WebSocket, MessageEvent, CloseEvent, UpgradeRequest, udp, UdpSocket, Datagram } from 'zinc:socket';
import { rtpHeader, seal, unseal } from 'zinc:discord-voice';
import { env } from 'zinc:sys';
import { writeText } from 'zinc:fs';
import * as show from './showcase';

const TOKEN = 'test-token';
const ASSETS = env('FAKE_ASSETS');
const me: any = { id: '100', username: 'ada', global_name: 'Ada', avatar: null };
const users: any[] = [{ id: '101', username: 'grace', global_name: 'Grace', avatar: 'av101' }, { id: '102', username: 'linus', global_name: null, avatar: null }];
const katherine: any = { id: '103', username: 'katherine', global_name: 'Katherine', avatar: 'av103' };
const guilds: any[] = [
  { id: '200', properties: { name: 'Zinc Lab', icon: 'ic200' }, roles: [{ id: '500', name: 'maintainers' }], channels: [
    { id: '301', type: 4, name: 'Text', position: 0 },
    { id: '302', type: 0, name: 'general', position: 0, parent_id: '301', last_message_id: '903' },
    { id: '303', type: 0, name: 'random', position: 1, parent_id: '301' },
    { id: '304', type: 2, name: 'Lounge', position: 0 },
    show.channels[0], show.channels[1],
  ], threads: show.threads },
  { id: '201', name: 'Makers', icon: null, channels: [{ id: '311', type: 0, name: 'welcome', position: 0, last_message_id: '930' }] },
];
const dms: any[] = [{ id: '400', type: 1, recipient_ids: ['101'], last_message_id: '950' }, { id: '401', type: 3, recipient_ids: ['101', '102'], last_message_id: '940' }];
// #general read up to 902 (903 is unread), #welcome up to 925 with 2 mentions, the DM read
const readStates: any[] = [{ id: '302', last_message_id: '902', mention_count: 0 }, { id: '311', last_message_id: '925', mention_count: 2 },
  { id: '400', last_message_id: '950', mention_count: 0 }];
const stamp = (minute: i32): string => `2026-10-30T09:${minute < 10 ? '0' : ''}${minute}:00.000000+00:00`;
const msg = (id: string, channel: string, author: any, content: string, minute: i32): any =>
  ({ id: id, channel_id: channel, author: author, content: content, timestamp: stamp(minute), edited_timestamp: null, attachments: [], mentions: [] });
const hex = (seconds: number): string => Math.floor(seconds).toString(16);
const now = (): number => Date.now() / 1000;

let api: i32 = 0;
const cdn = (): string => `http://127.0.0.1:${api}/cdn`;
/** A signed attachment URL: expired (ex in the past, signature old) or valid. */
const signedUrl = (path: string, valid: boolean): string => `${cdn()}/attachments/${path}?ex=${hex(valid ? now() + 86400 : now() - 3600)}&is=${hex(now() - 7200)}&hm=${valid ? 'sig2' : 'sig1'}&`;
const photo = (id: string, path: string, valid: boolean): any =>
  ({ id: id, filename: path.split('/').pop(), size: 120, content_type: 'image/png', width: 160, height: 120, url: signedUrl(path, valid) });

// #general: FAKE_HISTORY older messages, then the three of the scripted session
const older = env('FAKE_HISTORY') !== '' ? parseInt(env('FAKE_HISTORY')) : 67;
const general: any[] = [];
for (let n = 0; n < older; n++) general.push(msg(`${100000 + n}`, '302', n % 3 === 0 ? me : users[n % 2], `Message ${n + 1} of the history`, n % 60));
const morning = msg('901', '302', users[0], 'Morning! <:zinc:77> <:wave:78> <@&500>', 10);
const shipping = msg('903', '302', users[0], 'Shipping the gateway today.', 12);
shipping.attachments = [];   // its photo is added once the CDN's port is known (main)
general.push(morning); general.push(msg('902', '302', me, 'Nice, the resume works too?', 11)); general.push(shipping);
const dmHistory: any[] = [msg('950', '400', users[0], 'See you at the meetup 🎉', 30)];

/** A page of history, newest first: the `limit` messages before `before` (or the last ones). */
function page(list: any[], before: string, limit: i32): any[] {
  let end = list.length;
  if (before !== '') for (let i = 0; i < list.length; i++) if (list[i].id === before) end = i;
  const out: any[] = [];
  for (let i = end - 1; i >= 0 && i >= end - limit; i--) out.push(list[i]);
  return out;
}
const query = (path: string, name: string): string => { const m = new RegExp(`[?&]${name}=([^&]*)`).exec(path); return m !== null ? m[1] : ''; };

let live: WebSocket | null = null;
let seq = 0;
let pushedFirst = false, ackedElsewhere = false, refusedEdit = false, listed = false, showcaseShown = false, postsShown = false;
let showcaseList: any[] = [];
let subscriptions = 0;
let nextId = 906;
let bucketEmptiedAt: number = 0, refusedAt: number = 0;
let uploaded = 0;
const dispatch = (t: string, d: any): void => { const ws = live; if (ws !== null) { seq++; ws.send(JSON.stringify({ op: 0, t: t, s: seq, d: d })); } };
const json = (status: i32, body: string, h: Headers | undefined = undefined): Reply =>
  h !== undefined ? { status: status, contentType: 'application/json', body: body, headers: h } : { status: status, contentType: 'application/json', body: body };
const sent: Map<string, any> = new Map<string, any>();

/** Discord's answer to a sent message: the user objects of its mentions, the message it answers, the files it was sent with. */
function created(channel: string, body: any): any {
  const m = msg(`${nextId++}`, channel, me, body.content, 20);
  m.nonce = body.nonce;
  const mentions: any[] = [];
  const content: string = body.content;
  for (const u of users) if (content.indexOf(`<@${u.id}>`) >= 0) mentions.push(u);
  m.mentions = mentions;
  if (body.message_reference !== undefined) {
    for (const h of general) if (h.id === body.message_reference.message_id) m.referenced_message = h;
    m.message_reference = body.message_reference;
  }
  const files: any[] = [];
  if (Array.isArray(body.attachments)) for (const a of body.attachments) files.push(photo('802', `${channel}/${m.id}/802/${a.filename}`, true));
  m.attachments = files;
  sent.set(m.id, m);
  return m;
}

/** The CDN and the storage bucket of uploads: no token. */
function files(req: Request): Reply | null {
  const path = req.path.split('?')[0];
  if (path.startsWith('/cdn/')) {
    const key = path.slice(5);
    let file = '';
    if (key.startsWith('avatars/')) file = 'avatar.png';
    else if (key.startsWith('icons/')) file = 'icon.png';
    else if (key.startsWith('emojis/') || key.startsWith('stickers/')) file = 'emoji.png';
    else if (key.startsWith('external/')) file = 'photo.png';
    else if (key.startsWith('attachments/')) file = query(req.path, 'hm') === 'sig2' && parseInt(query(req.path, 'ex'), 16) > now() ? 'photo.png' : '';
    console.log(`cdn GET ${key} ${file !== '' ? 200 : 404}`);
    if (file === '') return { status: 404, contentType: 'text/plain', body: 'expired' };
    return { status: 200, contentType: 'image/png', body: '', file: `${ASSETS}/${file}` };
  }
  if (path.startsWith('/upload/')) {
    uploaded = (req.rawBody ?? req.body).length;
    console.log(`upload ${req.method} ${path} bytes=${uploaded} token=${req.headers.get('authorization') !== ''}`);
    return { status: 200, contentType: 'text/plain', body: '' };
  }
  return null;
}

function rest(req: Request): Reply {
  const f = files(req);
  if (f !== null) return f;
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
    if (msgs[1] === '305' && !showcaseShown) {
      showcaseShown = true;
      setTimeout(() => {
        dispatch('MESSAGE_UPDATE', show.linkPreview(cdn()));
        dispatch('MESSAGE_REACTION_ADD', { user_id: '101', channel_id: '305', message_id: '1007', guild_id: '200', emoji: { id: null, name: '🎉' }, burst: false, type: 0 });
        dispatch('MESSAGE_REACTION_REMOVE', { user_id: '100', channel_id: '305', message_id: '1007', guild_id: '200', emoji: { id: null, name: '👍' }, burst: false, type: 0 });
      }, 200);
    }
    if (msgs[1] === '306') return json(200, JSON.stringify(show.threadHistory()));
    const list: any[] = msgs[1] === '302' ? general : msgs[1] === '400' ? dmHistory : msgs[1] === '305' ? showcaseList : [];
    return json(200, JSON.stringify(page(list, query(req.path, 'before'), parseInt(query(req.path, 'limit')))));
  }
  if (req.method === 'POST' && /^\/api\/v9\/channels\/\d+\/call\/ring$/.test(req.path)) {
    console.log(`${line} recipients=${body.recipients}`);
    return { status: 204, contentType: 'text/plain', body: '' };
  }
  if (req.method === 'POST' && req.path === '/api/v9/attachments/refresh-urls') {
    const urls: any[] = [];
    for (const u of body.attachment_urls) {
      const url: string = u;
      const path = url.split('/attachments/')[1].split('?')[0];
      urls.push({ original: url, refreshed: signedUrl(path, true) });
      console.log(`${line} ${path} expired=${parseInt(query(url, 'ex'), 16) < now()}`);
    }
    return json(200, JSON.stringify({ refreshed_urls: urls }));
  }
  if (req.method === 'POST' && /^\/api\/v9\/channels\/\d+\/attachments$/.test(req.path)) {
    const out: any[] = [];
    for (const f of body.files) {
      console.log(`${line} file=${f.filename} size=${f.file_size > 0} id=${f.id}`);
      out.push({ id: f.id, upload_url: `http://127.0.0.1:${api}/upload/u${f.id}/${f.filename}?upload_id=x`, upload_filename: `u${f.id}/${f.filename}` });
    }
    return json(200, JSON.stringify({ attachments: out }));
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
    const named: string[] = [];
    if (Array.isArray(body.attachments)) for (const a of body.attachments) named.push(`${a.id}:${a.filename}:${a.uploaded_filename}`);
    const files = named.length > 0 ? ` attachments=${named.join(',')} stored=${uploaded > 0}` : '';
    console.log(`${line} content=${JSON.stringify(body.content)} nonce=${nonceOk} reply=${reply} waited=${waited}${files}`);
    const m = created(msgs[1], body);
    dispatch('MESSAGE_CREATE', m);                                 // the echo, before the answer as on Discord
    if (reply !== '') setTimeout(() => { dispatch('MESSAGE_CREATE', msg(`${nextId++}`, msgs[1], users[0], 'Got it, *thanks*', 21)); }, 300);
    const h = new Headers();
    h.set('X-RateLimit-Bucket', 'b-messages'); h.set('X-RateLimit-Limit', '5');
    h.set('X-RateLimit-Remaining', bucketEmptiedAt === 0 ? '0' : '4'); h.set('X-RateLimit-Reset-After', '0.5');
    if (bucketEmptiedAt === 0) bucketEmptiedAt = Date.now();
    return json(200, JSON.stringify(m), h);
  }
  const reaction = /^\/api\/v9\/channels\/(\d+)\/messages\/(\d+)\/reactions\/([^/]+)\/@me\?location=Message&type=0$/.exec(req.path);
  if ((req.method === 'PUT' || req.method === 'DELETE') && reaction !== null) {
    console.log(line);
    const e = decodeURIComponent(reaction[3]), colon = e.indexOf(':');
    const emoji: any = colon > 0 ? { id: e.slice(colon + 1), name: e.slice(0, colon) } : { id: null, name: e };
    dispatch(req.method === 'PUT' ? 'MESSAGE_REACTION_ADD' : 'MESSAGE_REACTION_REMOVE', { user_id: '100', channel_id: reaction[1], message_id: reaction[2], guild_id: '200', emoji: emoji, burst: false, type: 0 });
    return { status: 204, contentType: 'text/plain', body: '' };
  }
  const vote = /^\/api\/v9\/channels\/(\d+)\/polls\/(\d+)\/answers\/@me$/.exec(req.path);
  if (req.method === 'PUT' && vote !== null) {
    console.log(`${line} answers=${JSON.stringify(body.answer_ids)}`);
    for (const id of body.answer_ids) dispatch('MESSAGE_POLL_VOTE_ADD', { user_id: '100', channel_id: vote[1], message_id: vote[2], guild_id: '200', answer_id: parseInt(id) });
    setTimeout(() => { dispatch('MESSAGE_POLL_VOTE_ADD', { user_id: '102', channel_id: vote[1], message_id: vote[2], guild_id: '200', answer_id: 2 }); }, 50);
    return { status: 204, contentType: 'text/plain', body: '' };
  }
  if (req.method === 'GET' && /^\/api\/v9\/channels\/307\/threads\/search\?/.test(req.path)) {
    console.log(line);
    if (!postsShown) { postsShown = true; setTimeout(() => { dispatch('THREAD_CREATE', show.newThread); }, 100); }
    return json(200, JSON.stringify(show.posts()));
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
}

/** Op 37: the member list of #general (a SYNC of the range), then Katherine comes online (INSERT) and Grace goes idle (UPDATE). */
function memberList(d: any): void {
  const g: any = d.subscriptions['200'];
  if (g === undefined) return;
  const ranges: any = g.channels['302'];
  console.log(`subscribe guild=200 channel=302 ranges=${JSON.stringify(ranges)} typing=${g.typing}`);
  const member = (u: any, status: string): any => ({ member: { user: u, roles: [], nick: null, presence: { status: status } } });
  dispatch('GUILD_MEMBER_LIST_UPDATE', { guild_id: '200', id: 'everyone', member_count: 3, online_count: 2,
    groups: [{ id: 'online', count: 2 }, { id: 'offline', count: 1 }],
    ops: [{ op: 'SYNC', range: [0, 99], items: [{ group: { id: 'online', count: 2 } }, member(users[0], 'online'), member(me, 'online'),
      { group: { id: 'offline', count: 1 } }, member(users[1], 'offline')] }] });
  // the changes follow the second subscription (the session back on #general after the resume): the first one falls before the dropped
  // connection, which would lose them (the fake replays nothing on a resume)
  if (++subscriptions < 2 || listed) return;
  listed = true;
  setTimeout(() => {
    dispatch('GUILD_MEMBER_LIST_UPDATE', { guild_id: '200', id: 'everyone', member_count: 4, online_count: 3,
      groups: [{ id: 'online', count: 3 }, { id: 'offline', count: 1 }],
      ops: [{ op: 'INSERT', index: 3, item: member(katherine, 'online') }, { op: 'UPDATE', index: 1, item: member(users[0], 'idle') }] });
  }, 300);
}

// ------------------------------------------------------------------ voice
const VOICE_KEY: i32[] = [];
for (let i = 0; i < 32; i++) VOICE_KEY.push((i * 13 + 5) & 255);
const MY_SSRC = 11, GRACE_SSRC = 22;
let voiceChannel = '';
let voicePort: i32 = 0;
let rtp: UdpSocket | null = null;
let voiceMode = '';
let received = 0, refused = 0, echoSeq = 0, echoTs: u32 = 0, echoCounter: u32 = 0;
const keyBytes = (): u8[] => { const k: u8[] = []; for (const b of VOICE_KEY) k.push(b); return k; };

/** Op 4: join (our voice state, Grace's, the voice server), a change of mute or deafen in the same channel, or leaving. */
function voiceState(d: any): void {
  const ch: string = d.channel_id !== null ? `${d.channel_id}` : '', guild: any = d.guild_id;
  console.log(`voice state guild=${guild} channel=${d.channel_id} mute=${d.self_mute} deaf=${d.self_deaf}`);
  const state = (user: string, c: string): any => ({ user_id: user, guild_id: guild, channel_id: c !== '' ? c : null, session_id: 'voice-sess', self_mute: d.self_mute, self_deaf: d.self_deaf });
  if (ch === voiceChannel) { if (ch !== '') dispatch('VOICE_STATE_UPDATE', state('100', ch)); return; }
  voiceChannel = ch;
  dispatch('VOICE_STATE_UPDATE', state('100', ch));
  if (ch === '') return;
  dispatch('VOICE_STATE_UPDATE', state('101', ch));
  dispatch('VOICE_SERVER_UPDATE', { token: 'voice-token', guild_id: guild, endpoint: `ws://127.0.0.1:${voicePort}` });
}

/** The voice gateway v8: every message carries `seq`. */
function voiceGateway(ws: WebSocket, req: UpgradeRequest): void {
  console.log(`voice gateway ${req.path}`);
  let vseq = 0;
  const send = (op: i32, d: any): void => { vseq++; ws.send(JSON.stringify({ op: op, d: d, seq: vseq })); };
  ws.onmessage = (e: MessageEvent): void => {
    if (e.binary) { console.log(`voice binary op ${e.bytes[0]}: ${e.bytes.length > 100 ? 'over' : 'under'} 100 bytes`); return; }   // op 26: the key package
    const p: any = JSON.parse(e.data), d: any = p.d;
    if (p.op === 0) {
      console.log(`voice identify server=${d.server_id} user=${d.user_id} session=${d.session_id} token=${d.token === 'voice-token'} dave=${d.max_dave_protocol_version}`);
      received = 0; refused = 0;
      send(8, { heartbeat_interval: 13750 });
      send(2, { ssrc: MY_SSRC, ip: '127.0.0.1', port: (rtp as UdpSocket).port, modes: ['aead_aes256_gcm_rtpsize', 'aead_xchacha20_poly1305_rtpsize', 'xsalsa20_poly1305'] });
    } else if (p.op === 1) {
      voiceMode = d.data.mode;
      console.log(`voice select protocol=${d.protocol} address=${d.data.address} port=${d.data.port > 0} mode=${voiceMode}`);
      send(4, { mode: voiceMode, secret_key: VOICE_KEY, dave_protocol_version: voiceChannel === '400' ? 1 : 0 });   // DAVE in the DM call
      send(11, { user_ids: ['101'] });
      send(5, { user_id: '101', ssrc: GRACE_SSRC, speaking: 1 });
    } else if (p.op === 3) send(6, { t: d.t });
    else if (p.op === 5) console.log(`voice speaking ${d.speaking} ssrc=${d.ssrc}`);
    else console.log(`voice op ${p.op}`);
  };
  ws.onclose = (e: CloseEvent): void => { console.log(`voice closed ${e.code}: 25 packets or more ${received >= 25}, refused ${refused}`); };
}

/** UDP: IP discovery, then each packet of ours opened and sent back as Grace's. */
function voiceUdp(m: Datagram): void {
  const b = m.bytes;
  if (b.length === 74 && b[1] === 1) {
    const r: u8[] = [];
    for (let i = 0; i < 74; i++) r.push(0);
    r[1] = 2; r[3] = 70;
    for (let i = 0; i < 4; i++) r[4 + i] = b[4 + i];
    const ip = '127.0.0.1';
    for (let i = 0; i < ip.length; i++) r[8 + i] = ip.charCodeAt(i);
    r[72] = (m.port >> 8) & 255; r[73] = m.port & 255;
    (rtp as UdpSocket).sendBytes(m.address, m.port, r);
    return;
  }
  const opus = unseal(voiceMode, keyBytes(), b);
  if (opus.length === 0) { refused++; return; }
  received++;
  const out = seal(voiceMode, keyBytes(), rtpHeader(echoSeq, echoTs, GRACE_SSRC), echoCounter, opus);
  echoSeq = (echoSeq + 1) & 0xffff; echoTs += 960; echoCounter++;
  (rtp as UdpSocket).sendBytes(m.address, m.port, out);
}

async function main(): Promise<void> {
  rtp = (await udp(0, '127.0.0.1')).onMessage(voiceUdp);
  voicePort = (await serveWebSocket(0, voiceGateway, '127.0.0.1')).port;
  api = serve(0, rest);
  shipping.attachments = [photo('801', '302/903/801/photo.png', false)];
  showcaseList = show.showcase(cdn(), now());
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
      } else if (p.op === 37) memberList(p.d);
      else if (p.op === 4) voiceState(p.d);
    };
  }, '127.0.0.1');
  gwPort = gw.port;
  writeText(env('FAKE_PORTS_FILE'), `${api} ${gw.port}\n`);
}
let gwPort: i32 = 0;
main();
