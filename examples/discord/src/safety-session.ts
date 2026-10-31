// DISCORD_DEMO=safety (tests/t1/discord_safety.sh, against tests/fake-discord.ts with FAKE_GUARDS=1): the safety model in one short session.
// Layer 2: a read-only channel, a DM with a blocked person, a slowmode, a repeated text, too many mentions, @everyone without the
// permission, two invites; layer 3: a reaction toggled, a burst of reactions and a loop of history pages; layer 5: a captcha, then a long
// 429 (safe mode, no retry, the breaker's cooldown); layer 6: op 9 d:false (a new IDENTIFY 1 to 5 s later); then 40003 in a DM (the third
// safe mode of the day lasts the day, new DMs wait), the Settings page's "Your account now", and a 401 (back to the login, nothing more sent). Prints "safety: ..." lines the same on every run.
import { quit } from 'zinc:gfx';
import { store, Message } from './state';
import * as guard from './safety/index';
import { Reaction } from './content';
import { accountNow } from './components/AccountSafety';

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
  say(`@everyone: '${await write('@everyone look at this')}'`);
  store.draft = '';
  say(`invites: '${await write('discord.gg/zinc or discord.gg/lab')}'`);
  store.draft = '';
  store.selectChannel('302');
  // layer 3: the same reaction toggled meets its cap; a burst of reactions meets the cap a minute and its cooldown; a loop of history
  // pages is slowed to one
  const m = store.findMessage('302', '903') as Message;
  let toggled = 0, toggleRefusal = '';
  for (let i = 0; i < 6; i++) { store.error = ''; await store.react(m, null); if (store.error === '') toggled++; else if (toggleRefusal === '') toggleRefusal = store.error; }
  say(`reaction toggles: ${toggled} of 6 sent, then '${toggleRefusal}'`);
  let reacted = 0, refusal = '';
  for (let i = 0; i < 20; i++) {
    const r = new Reaction(); r.name = `e${i}`;
    store.error = ''; await store.react(m, r); if (store.error === '') reacted++; else if (refusal === '') refusal = store.error;
  }
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
  const late = new Reaction(); late.name = 'late';
  await store.react(m, late);
  say(`after the breaker: refused ${store.error.startsWith('Slow down: wait')}`);
  // layer 6: op 9 d:false follows the 429 (the fake sends it): a new IDENTIFY after 1 to 5 s
  const before = guard.identifiesToday(), at = Date.now();
  await until(() => store.stage !== 'ready');
  await until(() => store.stage === 'ready' && guard.identifiesToday() > before);
  const waited = (Date.now() - at) / 1000;
  say(`op 9: identified again after 1 to 5 s ${waited >= 1 && waited < 7}, identifies today ${guard.identifiesToday()}`);
  await pause(5200);   // the breaker's 5 s
  // 40003 in a DM: the third safe mode today, which lasts the day; new DMs wait an hour
  store.selectGuild('');
  store.selectChannel('400');
  say(`40003: '${await write('fault:40003')}', then a new DM: '${guard.begin('dm').message}'`);
  store.draft = '';
  const now = guard.safetyState();
  say(`account now: safe mode for the day ${now.safeUntil - Date.now() > 23 * 3600000}, DM pause ${now.pauses.filter((p: string) => p.startsWith('New DMs')).length}`);
  for (const row of accountNow()) if ((row[0].endsWith('today') && !row[0].startsWith('All')) ||row[0] === 'Email' || row[0] === 'Safe mode') say(`  ${row[0]}: ${row[0] === 'Safe mode' ? row[1].replace(/\d\d:\d\d/, 'HH:MM') : row[1]}`);
  store.selectGuild('200');
  store.selectChannel('302');
  await store.remove(mine);   // the fake answers 401
  await until(() => store.stage === 'login');
  say(`401: back to the login, '${store.error}'; then a message: '${guard.begin('send').message}'`);
  quit();
}
