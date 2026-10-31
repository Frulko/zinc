// A fake Discord on 127.0.0.1 for tests/t1/discord.sh: the REST API, the CDN and the gateway (HELLO, IDENTIFY -> READY with read states,
// heartbeat ACKs, RESUME -> RESUMED). It pushes one live message after the first history request and one after a RESUME, refuses a wrong
// token with close code 4004, and writes its two ports to FAKE_PORTS_FILE. Writing: typing answers 204 and Grace types back; a sent message
// is echoed as MESSAGE_CREATE with its nonce and empties its rate-limit bucket for 0.5 s (the next one must wait: waited=true); the first
// edit gets a 429 with retry_after; an edit and a delete are echoed as MESSAGE_UPDATE and MESSAGE_DELETE; the first ack of #general is
// answered with a MESSAGE_ACK of #welcome (read on another device). Pictures: the CDN (/cdn/) serves the PNGs of FAKE_ASSETS for avatars,
// server icons and emoji; #general's photo has an expired signed URL, which only /attachments/refresh-urls makes valid. Upload: POST
// /channels/302/attachments gives an upload_url on this server, the PUT there stores the bytes, and the message that names them carries an
// image attachment. Op 37 answers a SYNC of each range of the member list it asks for (a hoisted role, Online, Offline: 156 rows), then an
// INSERT and an UPDATE, and a PRESENCE_UPDATE; READY gives the friends' presences (Grace on her phone). #general has FAKE_HISTORY messages before
// its last three (67 by default: a first page of 50, then one of 20), paged by ?before=. Voice (tests/t1/discord_voice.sh): op 4 answers
// VOICE_STATE_UPDATE (ours and Grace's, who is in every call) and VOICE_SERVER_UPDATE naming a voice gateway v8 on this machine (Hello,
// Ready with a UDP port, IP discovery, Session Description in the mode chosen, Speaking for Grace); Grace's audio is ours sent back: each
// packet received is opened with the session's key and sent again as her SSRC. A DM call rings (POST /call/ring) and asks for DAVE
// (dave_protocol_version 1): the key package is printed, no MLS group is made. Every request it gets is printed.
// Login (tests/t1/discord_login.sh): the remote-auth gateway at /ra (the key exchange, a fingerprint, the user, a ticket that
// /users/@me/remote-auth/login turns into the encrypted token), and /auth/login with a TOTP or SMS code, a wrong password and a captcha.
// Pickers: Zinc Lab has two custom emoji and a sticker; /gifs/trending-gifs and /gifs/search answer two GIFs; a message may name stickers;
// an attachment named .gif is an animated GIF of three frames (assets/anim.gif).
// Transfer: /gokapi/api/files/add is a Gokapi server (API key gk-key) that answers a fixed share link.
// #showcase holds one message of each kind of content
// (showcase.ts): once its history is asked for, the preview of a link arrives as a partial MESSAGE_UPDATE and Grace and Ada react; a
// reaction PUT or DELETE and a poll vote are answered 204 and echoed, Linus votes too; the thread #release-talk has its history, the forum
// #ideas its posts (threads/search), after which a new thread is created (THREAD_CREATE). #showcase's pins (GET .../messages/pins) hold its
// build card; a pin or unpin is echoed as MESSAGE_UPDATE and CHANNEL_PINS_UPDATE. READY's merged_members make Ada a maintainer of Zinc Lab
// (Manage Messages), not of Makers. A history page can be asked `around` a message (half before it). Every request it gets is printed.
import { serve, Request, Reply, Headers } from 'zinc:net';
import { serveWebSocket, WebSocket, MessageEvent, CloseEvent, UpgradeRequest, udp, UdpSocket, Datagram } from 'zinc:socket';
import { rtpHeader, seal, unseal } from 'zinc:discord-voice';
import { env } from 'zinc:sys';
import { writeText } from 'zinc:fs';
import * as show from './showcase';
import { subtle, CryptoKey } from 'zinc:subtle';
import { base64Encode, base64Decode, TextEncoder } from 'zinc:web';

const TOKEN = 'test-token';
const ASSETS = env('FAKE_ASSETS');
const me: any = { id: '100', username: 'ada', global_name: 'Ada', avatar: null };
const users: any[] = [{ id: '101', username: 'grace', global_name: 'Grace', avatar: 'av101' }, { id: '102', username: 'linus', global_name: null, avatar: null }];
const katherine: any = { id: '103', username: 'katherine', global_name: 'Katherine', avatar: 'av103' };
// @everyone's permissions, as a server gives by default: VIEW_CHANNEL, SEND_MESSAGES, ADD_REACTIONS, ATTACH_FILES, READ_MESSAGE_HISTORY,
// CONNECT, SPEAK (the guard refuses what they lack); the maintainers add MANAGE_MESSAGES (pins)
const EVERYONE = `${1024 + 2048 + 64 + 32768 + 65536 + 1048576 + 2097152}`;
const guilds: any[] = [
  { id: '200', properties: { name: 'Zinc Lab', icon: 'ic200', owner_id: '101' }, roles: [{ id: '200', name: '@everyone', permissions: EVERYONE },
    { id: '500', name: 'maintainers', permissions: '8192', color: 3447003, hoist: true, position: 1 }], channels: [
    { id: '301', type: 4, name: 'Text', position: 0 },
    { id: '302', type: 0, name: 'general', position: 0, parent_id: '301', last_message_id: '903' },
    { id: '303', type: 0, name: 'random', position: 1, parent_id: '301' },
    { id: '304', type: 2, name: 'Lounge', position: 0 },
    show.channels[0], show.channels[1],
  ], threads: show.threads,
  // the pickers (ZN-904): two custom emoji (one animated) and a sticker of the server
  emojis: [{ id: '77', name: 'zinc', animated: false, available: true }, { id: '79', name: 'dance', animated: true, available: true }],
  stickers: [{ id: '880', name: 'wave', format_type: 1, available: true }] },
  { id: '201', name: 'Makers', icon: null, roles: [{ id: '201', name: '@everyone', permissions: EVERYONE }], channels: [{ id: '311', type: 0, name: 'welcome', position: 0, last_message_id: '930' }] },
];
const dms: any[] = [{ id: '400', type: 1, recipient_ids: ['101'], last_message_id: '950' }, { id: '401', type: 3, recipient_ids: ['101', '102'], last_message_id: '940' }];
// FAKE_GUILDS=n (by hand, ZN-885): n more servers of 50 channels, 30 roles and 40 emoji each, and 20 users a server, a READY of ~40 KB a
// server as a real account's (100 servers: the 4 MB the owner measured)
for (let g = 0; g < (env('FAKE_GUILDS') !== '' ? parseInt(env('FAKE_GUILDS')) : 0); g++) {
  const id = 10000 + g * 1000, channels: any[] = [], roles: any[] = [], emojis: any[] = [];
  for (let c = 0; c < 50; c++) channels.push({ id: `${id + c}`, type: c % 10 === 0 ? 4 : 0, name: `channel-${c}`, position: c, parent_id: `${id + c - c % 10}`,
    last_message_id: `${900000 + c}`, topic: `The topic of channel ${c}, a sentence or two that says what it is for and what not to post there.`, rate_limit_per_user: 0, nsfw: false,
    permission_overwrites: [0, 1, 2, 3].map((k: number): any => ({ id: `${id + 100 + k}`, type: 0, allow: '1024', deny: '2048' })) });
  for (let r = 0; r < 30; r++) roles.push({ id: `${id + 100 + r}`, name: `role ${r}`, color: r * 4000, hoist: false, position: r, permissions: '1071698660929', managed: false, mentionable: true, flags: 0 });
  for (let e = 0; e < 40; e++) emojis.push({ id: `${id + 200 + e}`, name: `emoji_${e}`, roles: [], require_colons: true, managed: false, animated: false, available: true });
  for (let u = 0; u < 20; u++) users.push({ id: `${id + 300 + u}`, username: `user${g}_${u}`, global_name: `User ${g}.${u}`, avatar: `av${id + u}`, discriminator: '0', public_flags: 0 });
  guilds.push({ id: `${id}`, properties: { name: `Server ${g}`, icon: `ic${id}`, description: 'A server of the large READY', features: ['COMMUNITY', 'NEWS'] },
    roles: roles, emojis: emojis, channels: channels, threads: [], member_count: 1000 + g, joined_at: '2024-01-01T00:00:00.000000+00:00' });
}
// FAKE_GUARDS=1 (tests/t1/discord_safety.sh): what the safety model must see and meet. READY carries @everyone's permissions, my member
// object (no roles), a slowmode channel #slow (30 s), a read-only #announcements (@everyone may not send), Mallory blocked and her DM; a
// message "fault:captcha" is answered with a captcha, "fault:40003" with 40003 (DMs opened too fast), an edit to "fault:429" with a 429 of 60 s followed by op 9 d:false, a message's delete with 401.
const GUARDS = env('FAKE_GUARDS') === '1';
const mallory: any = { id: '104', username: 'mallory', global_name: 'Mallory', avatar: null };
if (GUARDS) {
  const channels: any[] = guilds[0].channels;
  channels.push({ id: '320', type: 0, name: 'slow', position: 2, parent_id: '301', rate_limit_per_user: 30 });
  channels.push({ id: '321', type: 0, name: 'announcements', position: 3, parent_id: '301', permission_overwrites: [{ id: '200', type: 0, allow: '0', deny: '2048' }] });
  users.push(mallory);
  dms.push({ id: '402', type: 1, recipient_ids: ['104'], last_message_id: '0' });
}
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
  ({ id: id, filename: path.split('/').pop(), size: 120, content_type: 'image/png', width: 160, height: 120, url: signedUrl(path, valid), proxy_url: signedUrl(path, valid) });   // proxy_url: the media proxy, which sends WebP

// #general: FAKE_HISTORY older messages, then the three of the scripted session
const older = env('FAKE_HISTORY') !== '' ? parseInt(env('FAKE_HISTORY')) : 67;
const general: any[] = [];
for (let n = 0; n < older; n++) general.push(msg(`${100000 + n}`, '302', n % 3 === 0 ? me : users[n % 2], `Message ${n + 1} of the history`, n % 60));
const morning = msg('901', '302', users[0], 'Morning! <:zinc:77> <:wave:78> <@&500>', 10);
const shipping = msg('903', '302', users[0], 'Shipping the gateway today.', 12);
shipping.attachments = [];   // its photo is added once the CDN's port is known (main)
general.push(morning); general.push(msg('902', '302', me, 'Nice, the resume works too?', 11)); general.push(shipping);
const dmHistory: any[] = [msg('950', '400', users[0], 'See you at the meetup 🎉', 30)];

/** A page of history, newest first: the `limit` messages before `before` (or the last ones), or those `around` one (half before it). */
function page(list: any[], before: string, limit: i32, around: string = ''): any[] {
  let end = list.length;
  if (before !== '') for (let i = 0; i < list.length; i++) if (list[i].id === before) end = i;
  if (around !== '') for (let i = 0; i < list.length; i++) if (list[i].id === around) end = Math.min(list.length, i + limit / 2);
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
  if (Array.isArray(body.sticker_ids)) {
    const items: any[] = [];
    for (const id of body.sticker_ids) items.push({ id: `${id}`, name: 'wave', format_type: 1 });
    m.sticker_items = items;
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
    else if (key.startsWith('attachments/')) file = query(req.path, 'hm') !== 'sig2' || parseInt(query(req.path, 'ex'), 16) <= now() ? '' : query(req.path, 'format') === 'webp' ? 'photo.webp' : key.endsWith('.gif') ? 'anim.gif' : 'photo.png';   // the media proxy's WebP is a still, a real WebP file
    console.log(`cdn GET ${key} ${file !== '' ? 200 : 404}`);
    if (file === '') return { status: 404, contentType: 'text/plain', body: 'expired' };
    return { status: 200, contentType: file.endsWith('.gif') ? 'image/gif' : file.endsWith('.webp') ? 'image/webp' : 'image/png', body: '', file: `${ASSETS}/${file}` };
  }
  if (path === '/gokapi/api/files/add' && req.method === 'POST') {   // a Gokapi server (the transfer of a file too large for Discord)
    const body = req.rawBody ?? req.body, key = req.headers.get('apikey') === 'gk-key';
    const named = body.indexOf('name="file"; filename="big.bin"') >= 0 && body.indexOf('name="expiryDays"') >= 0;
    console.log(`transfer POST ${path} apikey=${key} multipart=${named} bytes=${body.length > 11 * 1024 * 1024}`);
    if (!key) return { status: 401, contentType: 'application/json', body: '{"Result":"error","ErrorMessage":"Unauthorized"}' };
    return { status: 200, contentType: 'application/json', body: '{"Result":"OK","FileInfo":{"Id":"big1","Name":"big.bin","UrlDownload":"https://share.example.org/d?id=big1"}}' };
  }
  if (path.startsWith('/upload/')) {
    uploaded = (req.rawBody ?? req.body).length;
    console.log(`upload ${req.method} ${path} bytes=${uploaded} token=${req.headers.get('authorization') !== ''}`);
    return { status: 200, contentType: 'text/plain', body: '' };
  }
  return null;
}

// ------------------------------------------------------------------ login
const OAEP = { name: 'RSA-OAEP', hash: 'SHA-256' };
const RA_NONCE = 'fake-nonce-42', MFA_TICKET = 'mfa-ticket', RA_TICKET = 'ra-ticket';
let raToken = '';   // the token encrypted with the client's key, for /users/@me/remote-auth/login
async function raMessage(ws: WebSocket, p: any, key: CryptoKey[]): Promise<void> {
  const seal = async (text: string): Promise<string> => base64Encode(await subtle.encrypt(OAEP, key[0], new TextEncoder().encode(text)));
  if (p.op === 'heartbeat') ws.send('{"op":"heartbeat_ack"}');
  else if (p.op === 'init') {
    key.push(await subtle.importKey('spki', base64Decode(p.encoded_public_key as string), OAEP, false, ['encrypt']));
    console.log(`remote auth init`);
    ws.send(JSON.stringify({ op: 'nonce_proof', encrypted_nonce: await seal(RA_NONCE) }));
  } else if (p.op === 'nonce_proof') {
    const want = base64Encode(await subtle.digest('SHA-256', new TextEncoder().encode(RA_NONCE))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    console.log(`remote auth proof ok=${p.proof === want}`);
    if (p.proof !== want) { ws.close(4003, 'bad proof'); return; }
    ws.send(JSON.stringify({ op: 'pending_remote_init', fingerprint: 'fp-123' }));
    if (env('FAKE_RA_HOLD') === '1') return;   // the phone never scans: the QR code stays on screen (a picture of the login screen)
    const user = await seal('100:0:null:ada');
    raToken = await seal(TOKEN);
    setTimeout(() => { ws.send(JSON.stringify({ op: 'pending_ticket', encrypted_user_payload: user })); }, 100);   // scanned
    setTimeout(() => { ws.send(JSON.stringify({ op: 'pending_login', ticket: RA_TICKET })); }, 200);               // confirmed on the phone
  }
}
function remoteAuth(ws: WebSocket, req: UpgradeRequest): void {
  console.log(`remote auth ${req.path} origin=${req.header('origin')}`);
  const key: CryptoKey[] = [];
  ws.send(JSON.stringify({ op: 'hello', heartbeat_interval: 41250, timeout_ms: 120000 }));
  ws.onmessage = (e: MessageEvent): void => { raMessage(ws, JSON.parse(e.data), key).catch((err: Error): void => { console.log(`remote auth error ${err.message}`); }); };
}
/** The routes a login takes, without a token; null for the others. */
function login(req: Request, auth: string): Reply | null {
  if (req.method !== 'POST' || !(req.path.startsWith('/api/v9/auth/') || req.path === '/api/v9/users/@me/remote-auth/login')) return null;
  const body: any = JSON.parse(req.body);
  console.log(`rest POST ${req.path} auth=${auth !== ''}${body.login !== undefined ? ' login=' + body.login : ''}${body.code !== undefined ? ' code=' + body.code : ''}`);
  if (req.path === '/api/v9/users/@me/remote-auth/login')
    return body.ticket === RA_TICKET && raToken !== '' ? json(200, JSON.stringify({ encrypted_token: raToken })) : json(400, '{"message":"Invalid ticket","code":50035}');
  if (req.path === '/api/v9/auth/login') {
    if (body.login === 'captcha@example.com')
      return json(400, '{"captcha_key":["captcha-required"],"captcha_sitekey":"fake-site","captcha_service":"hcaptcha"}');
    if (body.password !== 'right')
      return json(400, '{"message":"Invalid Form Body","code":50035,"errors":{"login":{"_errors":[{"code":"INVALID_LOGIN","message":"Login or password is invalid."}]}}}');
    return json(200, JSON.stringify({ user_id: '100', mfa: true, sms: true, totp: true, backup: false, ticket: MFA_TICKET }));
  }
  if (req.path === '/api/v9/auth/mfa/sms/send') return json(200, '{"phone":"+*******1234"}');
  if ((req.path === '/api/v9/auth/mfa/totp' || req.path === '/api/v9/auth/mfa/sms') && body.ticket === MFA_TICKET && body.code === '123456')
    return json(200, JSON.stringify({ token: TOKEN, user_settings: { locale: 'en-US', theme: 'dark' } }));
  return json(400, '{"message":"Invalid two-factor code","code":60008}');
}

function rest(req: Request): Reply {
  const f = files(req);
  if (f !== null) return f;
  const auth = req.headers.get('authorization');
  const l = login(req, auth);
  if (l !== null) return l;
  const sp = req.headers.get('x-super-properties');
  const line = `rest ${req.method} ${req.path} auth=${auth === TOKEN} super=${sp.length > 0}`;
  if (auth !== TOKEN) { console.log(line); return json(401, '{"message":"401: Unauthorized","code":0}'); }
  const body: any = req.body !== '' ? JSON.parse(req.body) : null;
  // the pins of #showcase: its build card; a pin or an unpin is echoed as MESSAGE_UPDATE and CHANNEL_PINS_UPDATE, as Discord does
  if (req.method === 'GET' && req.path === '/api/v9/channels/305/messages/pins?limit=50') {
    console.log(line);
    const card = showcaseList.filter((m: any): boolean => m.id === '1000');
    return json(200, JSON.stringify({ items: card.map((m: any): any => ({ pinned_at: stamp(1), message: m })), has_more: false }));
  }
  const pinned = /^\/api\/v9\/channels\/(\d+)\/messages\/pins\/(\d+)$/.exec(req.path);
  if ((req.method === 'PUT' || req.method === 'DELETE') && pinned !== null) {
    console.log(line);
    dispatch('MESSAGE_UPDATE', { id: pinned[2], channel_id: pinned[1], guild_id: '200', pinned: req.method === 'PUT' });
    dispatch('CHANNEL_PINS_UPDATE', { channel_id: pinned[1], guild_id: '200', last_pin_timestamp: stamp(25) });
    return { status: 204, contentType: 'text/plain', body: '' };
  }
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
    return json(200, JSON.stringify(page(list, query(req.path, 'before'), parseInt(query(req.path, 'limit')), query(req.path, 'around'))));
  }
  if (req.method === 'POST' && /^\/api\/v9\/channels\/\d+\/call\/ring$/.test(req.path)) {
    console.log(`${line} recipients=${body.recipients}`);
    return { status: 204, contentType: 'text/plain', body: '' };
  }
  const gifs = /^\/api\/v9\/gifs\/(search|trending-gifs)\?/.exec(req.path);
  if (req.method === 'GET' && gifs !== null) {
    console.log(line);
    const q = gifs[1] === 'search' ? decodeURIComponent(query(req.path, 'q')) : 'trending';
    const out: any[] = [];
    for (let i = 1; i <= 2; i++) out.push({ id: `${q}-${i}`, title: `${q} ${i}`, url: `https://tenor.com/view/${q}-${i}`, src: `${cdn()}/external/${q}-${i}.mp4`,
      gif_src: `${cdn()}/external/${q}-${i}.gif`, width: 220, height: 160, preview: `${cdn()}/external/${q}-${i}.png` });
    return json(200, JSON.stringify(out));
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
  if (GUARDS && req.method === 'POST' && msgs !== null && one === '' && body.content === 'fault:captcha') {
    console.log(`${line} -> 400 captcha`);
    return json(400, '{"captcha_key":["captcha-required"],"captcha_sitekey":"site","captcha_service":"hcaptcha"}');
  }
  if (GUARDS && req.method === 'POST' && msgs !== null && one === '' && body.content === 'fault:40003') {
    console.log(`${line} -> 400 40003`);
    return json(400, '{"message":"You are opening direct messages too fast.","code":40003}');
  }
  if (GUARDS && req.method === 'PATCH' && msgs !== null && body.content === 'fault:429') {
    console.log(`${line} -> 429 for 60 s, then op 9`);
    setTimeout(() => { const ws = live; if (ws !== null) ws.send('{"op":9,"d":false}'); }, 50);
    const h = new Headers();
    h.set('Retry-After', '60'); h.set('X-RateLimit-Scope', 'user');
    return json(429, '{"message":"You are being rate limited.","retry_after":60,"global":false}', h);
  }
  if (GUARDS && req.method === 'DELETE' && msgs !== null && one !== '' && !req.path.includes('/reactions/')) {
    console.log(`${line} -> 401`);
    return json(401, '{"message":"401: Unauthorized","code":0}');
  }
  if (req.method === 'POST' && msgs !== null && one === '') {
    // the message bucket: the first message empties it for 0.5 s, the next one must come after
    const waited = bucketEmptiedAt === 0 ? 'first' : `${Date.now() - bucketEmptiedAt >= 450}`;
    const nonceOk = typeof body.nonce === 'string' && /^\d{17,20}$/.test(body.nonce);
    const reply = body.message_reference !== undefined ? body.message_reference.message_id : '';
    const named: string[] = [];
    if (Array.isArray(body.attachments)) for (const a of body.attachments) named.push(`${a.id}:${a.filename}:${a.uploaded_filename}`);
    const files = named.length > 0 ? ` attachments=${named.join(',')} stored=${uploaded > 0}` : '';
    let stickers = '';
    if (Array.isArray(body.sticker_ids)) for (const id of body.sticker_ids) stickers += stickers === '' ? ` stickers=${id}` : `,${id}`;
    console.log(`${line} content=${JSON.stringify(body.content)} nonce=${nonceOk} reply=${reply} waited=${waited}${files}${stickers}`);
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

/** The member list of Zinc Lab, as Discord groups it: the hoisted role maintainers (Ada), Online (Grace), Offline (linus and 150 more). */
const member = (u: any, status: string, roles: string[], mobile: boolean = false): any =>
  ({ member: { user: u, roles: roles, nick: null, presence: { status: status, client_status: mobile ? { mobile: status } : { desktop: status } } } });
const memberRows: any[] = [{ group: { id: '500', count: 1 } }, member(me, 'online', ['500']), { group: { id: 'online', count: 1 } }, member(users[0], 'online', []),
  { group: { id: 'offline', count: 151 } }, member(users[1], 'offline', [])];
for (let k = 0; k < 150; k++) memberRows.push(member({ id: `${7000 + k}`, username: `member${k}`, global_name: null, avatar: null }, 'offline', []));
let memberGroups: any[] = [{ id: '500', count: 1 }, { id: 'online', count: 1 }, { id: 'offline', count: 151 }];

/** Op 37: a SYNC of each range asked for (the rows on screen); after the second subscription Katherine comes online on her phone (INSERT),
 *  Grace goes idle (UPDATE) and linus is busy (PRESENCE_UPDATE, as a friend). */
function memberList(d: any): void {
  const g: any = d.subscriptions['200'];
  if (g === undefined) return;
  for (const ch in g.channels) {
    const ranges: any = g.channels[ch];
    console.log(`subscribe guild=200 channel=${ch} ranges=${JSON.stringify(ranges)} typing=${g.typing}`);
    const ops: any[] = [];
    for (const r of ranges) ops.push({ op: 'SYNC', range: r, items: memberRows.slice(r[0], r[1] + 1) });
    dispatch('GUILD_MEMBER_LIST_UPDATE', { guild_id: '200', id: 'everyone', member_count: 152, online_count: 2, groups: memberGroups, ops: ops });
  }
  // the changes follow the second subscription (the session back on #general after the resume): the first one falls before the dropped
  // connection, which would lose them (the fake replays nothing on a resume)
  if (++subscriptions < 2 || listed) return;
  listed = true;
  setTimeout(() => {
    const kath = member(katherine, 'online', [], true), idle = member(users[0], 'idle', []);
    memberRows.splice(4, 0, kath); memberRows[3] = idle; memberRows[2] = { group: { id: 'online', count: 2 } };
    memberGroups = [{ id: '500', count: 1 }, { id: 'online', count: 2 }, { id: 'offline', count: 151 }];
    dispatch('GUILD_MEMBER_LIST_UPDATE', { guild_id: '200', id: 'everyone', member_count: 153, online_count: 3, groups: memberGroups,
      ops: [{ op: 'INSERT', index: 4, item: kath }, { op: 'UPDATE', index: 3, item: idle }] });
    dispatch('PRESENCE_UPDATE', { user: { id: '102' }, status: 'dnd', client_status: { desktop: 'dnd' }, activities: [] });
  }, 300);
}

// ------------------------------------------------------------------ voice
const VOICE_KEY: i32[] = [];
for (let i = 0; i < 32; i++) VOICE_KEY.push((i * 13 + 5) & 255);
const MY_SSRC = 11, GRACE_SSRC = 22, MY_VIDEO_SSRC = 12, GRACE_VIDEO_SSRC = 33;
// Go Live: our stream's connection (token stream-token: SSRC 41, video 42) and the one that watches Grace's (watch-token: 51); Grace's
// stream is ours sent on to the watcher as SSRC 63, and the watcher's key frame requests go to our stream's connection
const STREAM_SSRC = 41, STREAM_VIDEO_SSRC = 42, WATCH_SSRC = 51, GRACE_STREAM_SSRC = 63, STREAM_RTC = '1000';
let streamAddr = '', streamPort: i32 = 0, watchAddr = '', watchPort: i32 = 0;
let voiceChannel = '';
let voicePort: i32 = 0;
let rtp: UdpSocket | null = null;
let voiceMode = '';
let received = 0, refused = 0, echoSeq = 0, echoTs: u32 = 0, echoCounter: u32 = 0, videoIn = 0, plis = 0;
// Discord drops a connection that sends or receives media before one Speaking (op 5) and one Video (op 12) payload (Invalid SSRC,
// docs.discord.food Voice Connections): the connections, by audio SSRC, that sent each; media of the others is dropped and counted
const spoke = new Set<i32>(), described = new Set<i32>();
let early = 0;
/** Whether the connection of the audio SSRC `a` may carry media now; counts the packets it may not. */
function announced(a: i32): boolean { if (spoke.has(a) && described.has(a)) return true; early++; return false; }
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

/** Go Live on the main gateway: op 18 (our stream: its server, and Grace goes live too), 20 (watch Grace's), 19 (stop either), 22. */
function streamOp(op: i32, d: any): void {
  const key = `${d.stream_key}`;
  if (op === 18) {
    console.log(`voice stream create type=${d.type} guild=${d.guild_id} channel=${d.channel_id}`);
    const ours = `guild:${d.guild_id}:${d.channel_id}:100`;
    dispatch('STREAM_CREATE', { stream_key: ours, rtc_server_id: STREAM_RTC, viewer_ids: [], paused: false, region: 'local' });
    dispatch('STREAM_SERVER_UPDATE', { stream_key: ours, endpoint: `ws://127.0.0.1:${voicePort}`, token: 'stream-token', guild_id: null });
    dispatch('VOICE_STATE_UPDATE', { user_id: '101', guild_id: d.guild_id, channel_id: d.channel_id, session_id: 'voice-sess', self_stream: true });
  } else if (op === 20) {
    console.log(`voice stream watch ${key}`);
    dispatch('STREAM_CREATE', { stream_key: key, rtc_server_id: STREAM_RTC, viewer_ids: ['100'], paused: false, region: 'local' });
    dispatch('STREAM_SERVER_UPDATE', { stream_key: key, endpoint: `ws://127.0.0.1:${voicePort}`, token: 'watch-token', guild_id: null });
  } else if (op === 19) {
    console.log(`voice stream delete ${key}`);
    const f = key.split(':');
    if (f[3] === '100') dispatch('VOICE_STATE_UPDATE', { user_id: '101', guild_id: f[1], channel_id: f[2], session_id: 'voice-sess', self_stream: false });
  } else console.log(`voice stream paused=${d.paused} ${key}`);
}

/** The voice gateway v8: every message carries `seq`. */
function voiceGateway(ws: WebSocket, req: UpgradeRequest): void {
  console.log(`voice gateway ${req.path}`);
  let vseq = 0, kind = 'voice';
  const send = (op: i32, d: any): void => { vseq++; ws.send(JSON.stringify({ op: op, d: d, seq: vseq })); };
  ws.onmessage = (e: MessageEvent): void => {
    if (e.binary) { console.log(`voice binary op ${e.bytes[0]}: ${e.bytes.length > 100 ? 'over' : 'under'} 100 bytes`); return; }   // op 26: the key package
    const p: any = JSON.parse(e.data), d: any = p.d;
    if (p.op === 5) spoke.add(d.ssrc);
    if (p.op === 12) described.add(d.audio_ssrc);
    if (p.op === 0) {
      kind = d.token === 'stream-token' ? 'stream' : d.token === 'watch-token' ? 'watch' : 'voice';
      if (kind !== 'voice') {   // Go Live: the stream's own server (rtc_server_id), our voice session
        console.log(`voice ${kind} identify server=${d.server_id} session=${d.session_id} video=${d.video} streams=${JSON.stringify(d.streams)}`);
        const a: i32 = kind === 'stream' ? STREAM_SSRC : WATCH_SSRC;
        send(8, { heartbeat_interval: 13750 });
        send(2, { ssrc: a, ip: '127.0.0.1', port: (rtp as UdpSocket).port, modes: ['aead_aes256_gcm_rtpsize'],
          streams: [{ type: 'screen', rid: '100', ssrc: a + 1, rtx_ssrc: a + 2, quality: 100, active: false }] });
        return;
      }
      console.log(`voice identify server=${d.server_id} user=${d.user_id} session=${d.session_id} token=${d.token === 'voice-token'} dave=${d.max_dave_protocol_version} video=${d.video} streams=${JSON.stringify(d.streams)}`);
      received = 0; refused = 0; videoIn = 0; plis = 0; early = 0; spoke.clear(); described.clear();
      send(8, { heartbeat_interval: 13750 });
      send(2, { ssrc: MY_SSRC, ip: '127.0.0.1', port: (rtp as UdpSocket).port, modes: ['aead_aes256_gcm_rtpsize', 'aead_xchacha20_poly1305_rtpsize', 'xsalsa20_poly1305'],
        streams: [{ type: 'video', rid: '100', ssrc: MY_VIDEO_SSRC, rtx_ssrc: MY_VIDEO_SSRC + 1, quality: 100, active: false }] });
    } else if (p.op === 1 && kind !== 'voice') {
      console.log(`voice ${kind} select protocol=${d.protocol} mode=${d.data.mode}`);
      send(4, { mode: d.data.mode, secret_key: VOICE_KEY, dave_protocol_version: 0 });
      if (kind === 'watch') send(12, { user_id: '101', audio_ssrc: 0, video_ssrc: GRACE_STREAM_SSRC, rtx_ssrc: GRACE_STREAM_SSRC + 1,
        streams: [{ type: 'screen', rid: '100', ssrc: GRACE_STREAM_SSRC, rtx_ssrc: GRACE_STREAM_SSRC + 1, active: true, quality: 100 }] });
    } else if (p.op === 12 && kind !== 'voice') {
      const st: any = d.streams.length > 0 ? d.streams[0] : null;
      console.log(`voice ${kind} video ssrc=${d.video_ssrc}${st !== null ? ` ${st.type} ${st.max_resolution.width}x${st.max_resolution.height} ${st.max_framerate} fps ${st.max_bitrate} bps` : ''}`);
    } else if (p.op === 15 && kind !== 'voice') console.log(`voice ${kind} wants ${JSON.stringify(d)}`);
    else if (kind !== 'voice' && p.op !== 3) console.log(`voice ${kind} op ${p.op}`);
    else if (p.op === 1) {
      voiceMode = d.data.mode;
      const codecs: string[] = [];
      for (const c of d.codecs) codecs.push(`${c.name}/${c.payload_type}`);
      console.log(`voice select protocol=${d.protocol} address=${d.data.address} port=${d.data.port > 0} mode=${voiceMode} codecs=${codecs.join(',')}`);
      send(4, { mode: voiceMode, secret_key: VOICE_KEY, dave_protocol_version: voiceChannel === '400' ? 1 : 0 });   // DAVE in the DM call
      send(11, { user_ids: ['101'] });
      send(5, { user_id: '101', ssrc: GRACE_SSRC, speaking: 1 });
    } else if (p.op === 3) send(6, { t: d.t });
    else if (p.op === 5) console.log(`voice speaking ${d.speaking} ssrc=${d.ssrc}`);
    else if (p.op === 12) {   // our camera: Grace's (the echo of ours) starts or stops with it
      console.log(`voice video ssrc=${d.video_ssrc} rtx=${d.rtx_ssrc} streams=${d.streams.length}${d.streams.length > 0 ? ` ${d.streams[0].max_resolution.width}x${d.streams[0].max_resolution.height}` : ''}`);
      const on = d.video_ssrc !== 0;
      send(12, { user_id: '101', audio_ssrc: GRACE_SSRC, video_ssrc: on ? GRACE_VIDEO_SSRC : 0, rtx_ssrc: on ? GRACE_VIDEO_SSRC + 1 : 0,
        streams: on ? [{ type: 'video', rid: '100', ssrc: GRACE_VIDEO_SSRC, rtx_ssrc: GRACE_VIDEO_SSRC + 1, active: true, quality: 100 }] : [] });
    } else if (p.op === 15) console.log(`voice wants ${JSON.stringify(d)}`);
    else console.log(`voice op ${p.op}`);
  };
  ws.onclose = (e: CloseEvent): void => { if (kind !== 'voice') { console.log(`voice ${kind} closed ${e.code}`); return; } console.log(`voice closed ${e.code}: 25 packets or more ${received >= 25}, refused ${refused}, video ${videoIn > 0}, key frames asked ${plis > 0}, media before op 5 and 12 ${early}`); };
}

/** A sender report of ours: the receiver report a server answers with (one block on the sender's stream: its time back with no delay, so
 *  the round trip is the loopback's; our Go Live stream reported 25% lost, so its bitrate goes down). */
function receiverReport(m: Datagram, b: u8[]): void {
  const body = unseal(voiceMode, keyBytes(), b);
  if (body.length < 20) return;
  const lost: u8 = b[7] === STREAM_VIDEO_SSRC ? 64 : 0;
  const h: u8[] = [0x81, 201, 0, 7, 0, 0, 0, 1];
  const block: u8[] = [b[4], b[5], b[6], b[7], lost, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, body[2], body[3], body[4], body[5], 0, 0, 0, 0];
  (rtp as UdpSocket).sendBytes(m.address, m.port, seal(voiceMode, keyBytes(), h, echoCounter, block));
  echoCounter++;
}

/** UDP: IP discovery, then each packet of ours opened and sent back as Grace's: our voice as hers, our camera as hers, our RTCP (a key
 *  frame asked for her camera) back to us, as the server forwards it to the sender; a sender report answered (receiverReport). */
function voiceUdp(m: Datagram): void {
  const b = m.bytes;
  if (b.length === 74 && b[1] === 1) {
    const r: u8[] = [];
    for (let i = 0; i < 74; i++) r.push(0);
    r[1] = 2; r[3] = 70;
    for (let i = 0; i < 4; i++) r[4 + i] = b[4 + i];
    const ssrc = b[7];   // ours are under 256
    if (ssrc === STREAM_SSRC) { streamAddr = m.address; streamPort = m.port; }
    if (ssrc === WATCH_SSRC) { watchAddr = m.address; watchPort = m.port; }
    const ip = '127.0.0.1';
    for (let i = 0; i < ip.length; i++) r[8 + i] = ip.charCodeAt(i);
    r[72] = (m.port >> 8) & 255; r[73] = m.port & 255;
    (rtp as UdpSocket).sendBytes(m.address, m.port, r);
    return;
  }
  if (b.length >= 8 && b[1] === 200) { receiverReport(m, b); return; }
  if (b.length >= 8 && b[1] >= 200 && b[1] <= 206 && b[7] === WATCH_SSRC) { if (streamPort > 0) (rtp as UdpSocket).sendBytes(streamAddr, streamPort, b); return; }
  if (b.length >= 8 && b[1] >= 200 && b[1] <= 206) { plis++; (rtp as UdpSocket).sendBytes(m.address, m.port, b); return; }
  if (b.length >= 12 && (b[1] & 0x7f) === 101 && b[11] === STREAM_VIDEO_SSRC) {   // our stream: on to the watcher as Grace's
    if (watchPort === 0 || !announced(STREAM_SSRC) || !announced(WATCH_SSRC)) return;
    const frame = unseal(voiceMode, keyBytes(), b);
    if (frame.length === 0) return;
    const h: u8[] = [0x80, b[1], b[2], b[3], b[4], b[5], b[6], b[7], 0, 0, 0, GRACE_STREAM_SSRC];
    (rtp as UdpSocket).sendBytes(watchAddr, watchPort, seal(voiceMode, keyBytes(), h, echoCounter, frame));
    echoCounter++;
    return;
  }
  if (b.length >= 12 && (b[1] & 0x7f) === 101) {
    if (!announced(MY_SSRC)) return;
    const frame = unseal(voiceMode, keyBytes(), b);
    if (frame.length === 0) { refused++; return; }
    videoIn++;
    const h: u8[] = [0x80, b[1], b[2], b[3], b[4], b[5], b[6], b[7], 0, 0, 0, GRACE_VIDEO_SSRC];   // the same sequence, time and marker
    (rtp as UdpSocket).sendBytes(m.address, m.port, seal(voiceMode, keyBytes(), h, echoCounter, frame));
    echoCounter++;
    return;
  }
  if (b.length >= 12 && !announced(MY_SSRC)) return;
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
    if (req.path.startsWith('/ra')) { remoteAuth(ws, req); return; }
    console.log(`gateway ${req.path} agent=${(req.header('user-agent')).indexOf('Chrome') > 0}`);
    live = ws;
    ws.send(JSON.stringify({ op: 10, d: { heartbeat_interval: 41250 } }));
    ws.onmessage = (e: MessageEvent): void => {
      const p: any = JSON.parse(e.data);
      if (p.op === 1) ws.send('{"op":11}');
      else if (p.op === 2) {
        console.log(`identify token=${p.d.token === TOKEN} capabilities=${p.d.capabilities} browser=${p.d.properties.browser}`);
        if (p.d.token !== TOKEN) { ws.close(4004, 'Authentication failed.'); return; }
        const ready: any = { v: 9, user: me, users: users, guilds: guilds, private_channels: dms, session_id: 'sess-1',
          resume_gateway_url: `ws://127.0.0.1:${gwPort}`, read_state: { entries: readStates, partial: false, version: 1 },
          merged_members: [[{ user_id: '100', roles: ['500'] }], [{ user_id: '100', roles: [] }]],   // Ada maintains Zinc Lab (Manage Messages)
          merged_presences: { friends: [{ user_id: '101', status: 'online', client_status: { mobile: 'online' } }, { user_id: '102', status: 'idle', client_status: { web: 'idle' } }] } };
        if (GUARDS) {
          ready.merged_members = guilds.map((g: any): any[] => g.id === '200' ? [{ user_id: '100', roles: [] }] : []);
          ready.relationships = [{ id: '104', type: 2, user: mallory }];
          ready.user_settings = { status: 'online' };
        }
        dispatch('READY', ready);
      } else if (p.op === 6) {
        console.log(`resume session=${p.d.session_id} seq=${p.d.seq}`);
        dispatch('RESUMED', null);
        setTimeout(() => { dispatch('MESSAGE_CREATE', msg('905', '302', users[0], 'Back after the drop', 14)); }, 200);
      } else if (p.op === 37) memberList(p.d);
      else if (p.op === 4) voiceState(p.d);
      else if (p.op === 18 || p.op === 19 || p.op === 20 || p.op === 22) streamOp(p.op, p.d);
    };
  }, '127.0.0.1');
  gwPort = gw.port;
  writeText(env('FAKE_PORTS_FILE'), `${api} ${gw.port}\n`);
}
let gwPort: i32 = 0;
main();
