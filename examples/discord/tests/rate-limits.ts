// The safety model's logic without a network (src/safety/core.ts, access.ts): Discord's limits (50 a second, the gateway's 110 a minute,
// routes by major id, the plain errors and safe mode), the gate (a scripted burst refused, a send with no person's input refused, a
// duplicate refused, a human-paced send passing, cooldowns doubling, a loop of history pages slowed) and the permissions. Prints "ok" or
// the first check that failed; tests/t0/discord_ratelimit.sh.
import { Window, Budgets, Spam, ColdDms, Toggles, plainError, startsSafeMode, routeOf, placeCheck, safeModeMs, snowflakeTime } from '../src/safety/core';
import { GLOBAL_PER_SECOND, GATEWAY_SENDS_MAX, RULES, SAFE_MODE_MS, SAFE_MODE_LONG_MS } from '../src/safety/policy';
import { Server, Overwrite, Access, parsePerms, channelPerms, has, SEND_MESSAGES, ADD_REACTIONS, VIEW_CHANNEL, SEND_MESSAGES_IN_THREADS } from '../src/safety/access';

let failed = '';
function check(name: string, ok: boolean): void { if (!ok && failed === '') failed = name; }

const s = new Window(GLOBAL_PER_SECOND, 1000);
let n = 0;
for (let i = 0; i < 60; i++) if (s.take(1000) === 0) n++;
check('50 requests in one second, not 51', n === 50);
check('the 51st waits until the first leaves the window', s.take(1500) === 500);
check('a second later there is room again', s.take(2000) === 0);

const g = new Window(GATEWAY_SENDS_MAX, 60000);
for (let i = 0; i < 100; i++) g.add(i * 100);   // heartbeats and earlier sends
let sends = 0;
for (let i = 0; i < 50; i++) if (g.take(10000) === 0) sends++;
check('the gateway keeps under 120 a minute', g.count(10000) <= 120 && sends === GATEWAY_SENDS_MAX - 100);
check('the gateway waits for its oldest send', g.take(10000) === 50000);

check('captcha', plainError(400, { captcha_key: ['captcha-required'], captcha_sitekey: 'x' }, 0).indexOf('QR code') > 0);
check('401', plainError(401, null, 0).indexOf('log in again') > 0);
check('429 says when', plainError(429, { retry_after: 12.2 }, 12.2).indexOf('13 s') > 0);
check('other errors keep the API message', plainError(404, { message: 'Unknown Channel' }, 0) === '');
check('verification', plainError(403, { code: 40002 }, 0).indexOf('verified') > 0 && startsSafeMode(403, { code: 40002 }, false));
check('a plain 403 is no safe mode', !startsSafeMode(403, { code: 50001 }, false));
check('safe mode on 401, captcha, a 429 not retried', startsSafeMode(401, null, false) && startsSafeMode(400, { captcha_key: ['x'] }, false)
  && startsSafeMode(429, null, false) && !startsSafeMode(429, null, true));
check('route keeps the major id', routeOf('POST', '/channels/302/messages/903/ack') === 'POST /channels/302/messages/:id/ack');
check('route without the query', routeOf('GET', '/channels/302/messages?limit=50') === 'GET /channels/302/messages');

// the gate (layers 1 and 3): check(kind, now, human, front, safe, scripted)
const b = new Budgets();
check('a human-paced send passes', b.check('send', 1000, true, true, false, false) === '' && b.check('send', 3000, true, true, false, false) === '');
check('a send from a timer (no input) is refused', b.check('send', 6000, false, true, false, false).indexOf('only something you do') >= 0);
check('a send while the window is behind is refused', b.check('send', 6000, true, false, false, false).indexOf('not in front') >= 0);
check('a burst is refused, with a 5 s cooldown', b.check('send', 6000, true, true, false, false) === '' && b.check('send', 6100, true, true, false, false) === 'Slow down: wait 5 s.');
check('the cooldown holds', b.check('send', 9000, true, true, false, false) === 'Slow down: wait 3 s.' && b.waitMs('send', 9000) === 2100);
check('the next burst doubles it', b.check('send', 12000, true, true, false, false) === '' && b.check('send', 12100, true, true, false, false) === 'Slow down: wait 10 s.');
let burst = 0;
const sc = new Budgets();
for (let i = 0; i < 30; i++) if (sc.check('react', 1000 + i, true, true, false, true) === '') burst++;
check('a scripted burst stops at the cap a minute', burst === 15);
let pages = 0;
for (let i = 0; i < 20; i++) if (sc.check('older', 1000 + i * 100, true, true, false, false) === '') pages++;
check('a loop of history pages is slowed to one a second', pages === 2);
check('safe mode stops what is not essential', sc.check('typing', 5000, true, true, true, false) === 'Not sent: safe mode.' && sc.check('history', 5000, true, true, true, false) === '');
check('an unknown kind is refused', sc.check('mass-dm', 5000, true, true, false, false).indexOf('not something') >= 0);
// the text (layer 2)
const sp = new Spam();
check('a first message passes', sp.check('Hello there, everyone', '302', 0, false) === '');
sp.remember('Hello there, everyone', '302', 0);
check('a duplicate is refused', sp.check('hello there everyone!', '302', 1000, false).indexOf('already') >= 0);
check('the same text in another channel is refused', sp.check('Hello there, everyone', '303', 1000, false).indexOf('several') >= 0);
check('ten minutes later it may go again', sp.check('Hello there, everyone', '302', 700000, false) === '');
sp.remember('ok', '302', 0); sp.remember('ok', '302', 1000);
check('a short word twice passes, a third time not', sp.check('ok', '303', 2000, false) === '' && sp.check('ok', '302', 2000, false).indexOf('already') >= 0);
check('six mentions are refused', sp.check('<@1> <@2> <@3> <@4> <@&5> @everyone', '302', 0, false).indexOf('mentions') >= 0);
check('four links are refused', sp.check('http://a https://b http://c https://d', '302', 0, false).indexOf('links') >= 0);
// permissions (layer 2)
const big = parsePerms('2251799813685247');   // 2^51 - 1: every bit up to 50, past what a double holds exactly as an int32 pair
check('64-bit permissions', has(big, 50) && has(big, 0) && !has(big, 51) && has(parsePerms('274877906944'), SEND_MESSAGES_IN_THREADS));
const srv = new Server();
srv.roles.set('200', parsePerms(`${1024 + 2048}`)); srv.roles.set('500', parsePerms('64')); srv.mine = ['500'];
const deny = new Overwrite(); deny.id = '200'; deny.deny = parsePerms('2048');
const p = channelPerms(srv, '200', '100', [deny], 0);
check('an overwrite of @everyone takes SEND_MESSAGES', p !== null && has(p, VIEW_CHANNEL) && !has(p, SEND_MESSAGES) && has(p, ADD_REACTIONS));
srv.timeoutUntil = 10;
const t = channelPerms(srv, '200', '100', [], 0);
check('a timeout leaves only reading', t !== null && has(t, VIEW_CHANNEL) && !has(t, ADD_REACTIONS));
const unknown = new Server();
check('my roles unknown: nothing is refused', channelPerms(unknown, '200', '100', [], 0) === null);


// the account safety rules (ZN-910, docs/reports/discord-account-safety-rules.md)
const DAY = 86400000, T0 = 20000 * DAY;   // a day boundary: the day's counts start at zero
// rule 13: 40003 starts safe mode with its own sentence
check('40003 starts safe mode', startsSafeMode(400, { code: 40003 }, false) && plainError(400, { code: 40003 }, 0).indexOf('DMs too fast') > 0);
// rule 26: day caps per kind and global, kept across launches
const day = new Budgets();
let opened = 0;
for (let i = 0; i < 30; i++) if (day.check('dm', T0 + i * 2000000, true, true, false, false) === '') opened++;
check('20 new DMs a day', opened === 20 && day.check('dm', T0 + 30 * 2000000, true, true, false, false).indexOf('20 a day') >= 0);
const relaunch = new Budgets();
relaunch.loadDay(day.dayText(), T0 + 31 * 2000000);
check('the day\'s counts survive a launch', relaunch.todayCount('dm', T0 + 31 * 2000000) === 20 && relaunch.todayCount('', T0 + 31 * 2000000) === 20);
const tomorrow = new Budgets();
tomorrow.loadDay(day.dayText(), T0 + DAY + 1);
check('a new day starts at zero', tomorrow.todayCount('dm', T0 + DAY + 1) === 0);
check('every kind with a day cap', (RULES.get('send') as any).perDay === 1500 && (RULES.get('react') as any).perDay === 1000 && (RULES.get('join') as any).perDay === 5
  && (RULES.get('profile-edit') as any).perDay === 5);
// rule 19: a young or unverified account gets half the caps of the writes, not of the reads
const young = new Budgets();
young.limited = true;
let ys = 0, yr = 0;
for (let i = 0; i < 20; i++) { if (young.check('react', T0 + i, true, true, false, true) === '') ys++; if (young.check('history', T0 + i, true, true, false, true) === '') yr++; }
check('a young account: half the reactions a minute, every read', ys === 7 && yr === 20);
const acc = new Access();
const me = `${(T0 - 1420070400000) * 4194304}`;   // an id made at T0
acc.observe('READY', { user: { id: me, verified: true }, relationships: [{ id: '7', type: 1 }],
  guilds: [{ id: '50', joined_at: new Date(T0).toISOString(), verification_level: 3, roles: [{ id: '50', permissions: '3072' }], channels: [{ id: '51', type: 0 }] }],
  merged_members: [[{ user_id: me, roles: [] }, { user_id: '8', roles: [] }]],
  private_channels: [{ id: '60', type: 1, recipient_ids: ['9'] }, { id: '61', type: 1, recipient_ids: ['7'] }] });
check('the account\'s age from its id', Math.abs(snowflakeTime(me) - T0) < 2 && acc.limited(T0 + DAY) && !acc.limited(T0 + 8 * DAY));
acc.observe('USER_UPDATE', { id: me, verified: false });
check('an unverified email is limited', acc.limited(T0 + 30 * DAY));
// rule 12: new DMs only to friends and people sharing a server
check('a new DM to a friend or a server member, not a stranger', acc.cannotOpenDm('7') === '' && acc.cannotOpenDm('8') === '' && acc.cannotOpenDm('9') !== '');
// rule 14: more than 5 cold DMs in 10 minutes pause new conversations
const cd = new ColdDms();
let colds = 0;
for (let i = 0; i < 7; i++) if (cd.check(`c${i}`, true, T0 + i * 1000) === '') { cd.remember(`c${i}`, T0 + i * 1000); colds++; }
check('the sixth cold DM is paused, a known one is not', colds === 5 && cd.check('c0', true, T0 + 8000) === '' && cd.check('', true, T0 + 8000) !== ''
  && cd.check('warm', false, T0 + 8000) === '' && cd.check('c9', true, T0 + 1300000) === '');
// rule 7: invites
const inv = new Spam();
check('two invites in a message are refused', inv.check('discord.gg/abc and https://discord.com/invite/def', '1', 0, false).indexOf('invite') >= 0);
inv.remember('join us discord.gg/abc', '1', 0); inv.remember('come over: discord.gg/abc', '2', 1000);
check('the same invite in a third channel is refused', inv.check('see discord.gg/abc', '3', 2000, false).indexOf('advertising') >= 0
  && inv.check('see discord.gg/abc', '3', 700000, false) === '');
check('no link in a first DM to a stranger', placeCheck('hi https://x.y', true, false, true) !== '' && placeCheck('hi discord.gg/abc', true, false, true) !== ''
  && placeCheck('hi there', true, false, true) === '');
check('a cold DM with a stranger, not with a friend', acc.strangerDm('60', T0) && !acc.strangerDm('61', T0));
// rule 6: @everyone needs MENTION_EVERYONE; roles and @here count among the 5
check('@everyone without the permission', placeCheck('@everyone look', false, false, false).indexOf('@everyone') >= 0 && placeCheck('@here look', false, false, true) === '');
check('roles and @here count as mentions', inv.check('<@&1> <@&2> <@3> @here @everyone <@4>', '1', 0, false).indexOf('mentions') >= 0);
// rule 18: a new member: no links or mentions; a High server: nothing for 10 minutes
check('a new member: no links or mentions', acc.newMember('51', T0 + 60000) && placeCheck('<@8> hi', false, true, true) !== ''
  && placeCheck('hello', false, true, true) === '' && !acc.newMember('51', T0 + 700000));
check('a High server holds a new member 10 minutes', acc.verificationWait('51', T0 + 60000) !== '' && acc.verificationWait('51', T0 + 700000) === '');
// rule 11: a reaction toggled more than 4 times a minute
const tg = new Toggles();
let flips = 0;
for (let i = 0; i < 6; i++) if (tg.check('903 👍', T0 + i * 100) === '') { tg.remember('903 👍', T0 + i * 100); flips++; }
check('a reaction toggled 4 times, not 5', flips === 4 && tg.check('903 🎉', T0) === '' && tg.check('903 👍', T0 + 61000) === '');
// rule 30: the third safe mode in a day lasts the day
check('the third safe mode lasts a day', safeModeMs(0) === SAFE_MODE_MS && safeModeMs(1) === SAFE_MODE_MS && safeModeMs(2) === SAFE_MODE_LONG_MS);

console.log(failed === '' ? 'ok' : `failed: ${failed}`);
