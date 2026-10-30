// The rate-limit logic of the client (src/services/limits.ts, rest.ts's routes) without a network: the sliding windows of the global
// 50 a second and the gateway's 110 a minute, and the plain errors. Prints "ok" or the first check that failed; tests/t0/discord_ratelimit.sh.
import { Window, plainError, startsSafeMode } from '../src/services/limits';
import { routeOf, GLOBAL_PER_SECOND } from '../src/services/rest';
import { SENDS_MAX } from '../src/services/gateway';

let failed = '';
function check(name: string, ok: boolean): void { if (!ok && failed === '') failed = name; }

const s = new Window(GLOBAL_PER_SECOND, 1000);
let n = 0;
for (let i = 0; i < 60; i++) if (s.take(1000) === 0) n++;
check('50 requests in one second, not 51', n === 50);
check('the 51st waits until the first leaves the window', s.take(1500) === 500);
check('a second later there is room again', s.take(2000) === 0);

const g = new Window(SENDS_MAX, 60000);
for (let i = 0; i < 100; i++) g.add(i * 100);   // heartbeats and earlier sends
let sends = 0;
for (let i = 0; i < 50; i++) if (g.take(10000) === 0) sends++;
check('the gateway keeps under 120 a minute', g.count(10000) <= 120 && sends === SENDS_MAX - 100);
check('the gateway waits for its oldest send', g.take(10000) === 50000);

check('captcha', plainError(400, { captcha_key: ['captcha-required'], captcha_sitekey: 'x' }, 0).indexOf('official Discord app') > 0);
check('401', plainError(401, null, 0).indexOf('log in again') > 0);
check('429 says when', plainError(429, { retry_after: 12.2 }, 12.2).indexOf('13 s') > 0);
check('other errors keep the API message', plainError(404, { message: 'Unknown Channel' }, 0) === '');

check('verification', plainError(403, { code: 40002 }, 0).indexOf('verified') > 0 && startsSafeMode(403, { code: 40002 }, false));
check('a plain 403 is no safe mode', !startsSafeMode(403, { code: 50001 }, false));
check('safe mode on 401, captcha, a 429 not retried', startsSafeMode(401, null, false) && startsSafeMode(400, { captcha_key: ['x'] }, false)
  && startsSafeMode(429, null, false) && !startsSafeMode(429, null, true));

check('route keeps the major id', routeOf('POST', '/channels/302/messages/903/ack') === 'POST /channels/302/messages/:id/ack');
check('route without the query', routeOf('GET', '/channels/302/messages?limit=50') === 'GET /channels/302/messages');

console.log(failed === '' ? 'ok' : `failed: ${failed}`);
