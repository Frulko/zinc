// DISCORD_DEMO=safety (tests/t1/discord_safety.sh, against tests/fake-discord.ts with FAKE_GUARDS=1): the safety model in one short session.
// Layer 2: a read-only channel, a DM with a blocked person, a slowmode, a repeated text, too many mentions; layer 3: a burst of reactions
// and a loop of history pages; layer 5: a captcha, then a long 429 (safe mode, no retry, the breaker's cooldown); layer 6: op 9 d:false
// (a new IDENTIFY 1 to 5 s later), then a 401 (back to the login, nothing more sent). Prints "safety: ..." lines the same on every run.
import { quit } from 'zinc:gfx';
import { store, Message } from './state';
import * as guard from './safety/index';

function until(cond: () => boolean): Promise<void> {
  return new Promise<void>((done: () => void) => { const t = setInterval(() => { if (cond()) { clearInterval(t); done(); } }, 10); });
}
const pause = (ms: i32): Promise<void> => new Promise<void>((done: () => void) => { setTimeout(done, ms); });
const count = (id: string): i32 => { const l = store.messages.get(id); return l !== undefined ? l.length : -1; };
const say = (line: string): void => { console.log(`safety: ${line}`); };
async function write(text: string): Promise<string> { store.error = ''; store.typed(text); await store.send(); return store.error; }

export async function safety(): Promise<void> {
  await until(() => store.stage === 'ready');
  say(`ready, identifies today ${guard.identifiesToday()}`);
  // layer 2: what Discord would refuse is not sent
  store.selectGuild('200');
  store.selectChannel('321');
  say(`read-only: ${guard.cannotSend('321')} / ${await write('hello')}`);
  store.selectGuild('');
  store.selectChannel('402');
  say(`blocked: ${guard.cannotSend('402')}`);
  store.draft = '';
  store.selectGuild('200');
  store.selectChannel('320');
  say(`slowmode: first '${await write('First in the slow channel')}', second '${await write('Second too soon')}', countdown ${guard.countdown('320').startsWith('Slowmode: you can send again in')}`);
  store.draft = '';
  store.selectChannel('302');
  await until(() => count('302') > 0);
  say(`repeat: first '${await write('The same text everywhere')}', again '${await write('the same text, everywhere!')}'`);
  store.draft = '';
  store.selectChannel('303');
  say(`pasted elsewhere: '${await write('The same text everywhere')}'`);
  say(`mentions: '${await write('<@101> <@102> <@103> <@104> <@105> <@106> look')}'`);
  store.draft = '';
  store.selectChannel('302');
  // layer 3: a burst of reactions meets the cap a minute and its cooldown; a loop of history pages is slowed to one
  const m = store.findMessage('302', '903') as Message;
  let reacted = 0, refusal = '';
  for (let i = 0; i < 20; i++) { store.error = ''; await store.react(m, null); if (store.error === '') reacted++; else if (refusal === '') refusal = store.error; }
  say(`reaction burst: ${reacted} of 20 sent, then '${refusal}'`);
  let pages = 0, slowed = 0;
  for (let i = 0; i < 15; i++) {
    try { await guard.api('older', 'GET', `/channels/302/messages?before=${100000 + i}&limit=100`, undefined); pages++; } catch (e) { slowed++; }
  }
  say(`history loop: ${pages} page asked, ${slowed} refused`);
  // layer 5: a captcha, then a long 429: safe mode, no retry, the breaker
  say(`captcha: '${await write('fault:captcha')}'`);
  store.draft = '';
  store.typed('typing in safe mode');
  store.draft = '';
  const mine = (store.messages.get('302') as Message[]).filter((x: Message) => x.content === 'The same text everywhere' && !x.failed)[0];
  store.edit(mine);
  store.draft = 'fault:429';
  store.error = '';
  await store.send();
  say(`long 429: '${store.error}'`);
  store.error = '';
  await store.react(m, null);
  say(`after the breaker: refused ${store.error.startsWith('Slow down: wait')}`);
  // layer 6: op 9 d:false follows the 429 (the fake sends it): a new IDENTIFY after 1 to 5 s
  const before = guard.identifiesToday(), at = Date.now();
  await until(() => store.stage !== 'ready');
  await until(() => store.stage === 'ready' && guard.identifiesToday() > before);
  const waited = (Date.now() - at) / 1000;
  say(`op 9: identified again after 1 to 5 s ${waited >= 1 && waited < 7}, identifies today ${guard.identifiesToday()}`);
  await pause(5200);   // the breaker's 5 s
  await store.remove(mine);   // the fake answers 401
  await until(() => store.stage === 'login');
  say(`401: back to the login, '${store.error}'; then a message: '${guard.begin('send').message}'`);
  quit();
}
