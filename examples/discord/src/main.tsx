// discord: a native Discord client in the spirit of discord-lite (no web view, little memory). See README.md.
//   build/zinc run examples/discord
// Keys: Escape quits.
// Test hooks: DISCORD_API, DISCORD_GATEWAY move the endpoints (a fake Discord, tests/t1/discord.sh), DISCORD_TOKEN logs in without the
// keychain, DISCORD_LOG=1 prints what happens, DISCORD_DEMO=1 runs the scripted session (servers, a channel's history, a live message,
// a dropped connection that resumes, a second live message, a DM, then the writing of write() below) and quits.
import { render } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';
import { env } from 'zinc:sys';
import App from './App';
import { store, Message } from './state';
import { parse, describe } from './markdown';

ui.onKey((e: ui.KeyEvent): void => {
  if (e.primary || e.alt) return;
  if (e.key === 'Escape') { quit(); e.preventDefault(); }
});

function until(cond: () => boolean): Promise<void> {
  return new Promise<void>((done: () => void) => { const t = setInterval(() => { if (cond()) { clearInterval(t); done(); } }, 10); });
}
const count = (id: string): i32 => { const l = store.messages.get(id); return l !== undefined ? l.length : -1; };

async function demo(): Promise<void> {
  await until(() => store.stage === 'ready');
  console.log(`servers ${store.guilds.map((g) => g.name).join(', ')}`);
  console.log(`channels ${store.channels().map((c) => c.name).join(', ')}`);
  const id = store.channelId;
  await until(() => count(id) > 0);
  console.log(`history ${count(id)}`);
  const before = count(id);
  await until(() => count(id) > before);                     // the fake server sends one once the history was asked for
  store.dropConnection();
  await until(() => store.stage === 'reconnecting');
  await until(() => store.stage === 'ready');
  console.log('resumed');
  await until(() => count(id) > before + 1);                  // and another after RESUME
  store.selectGuild('');
  console.log(`dms ${store.channels().map((c) => c.name).join(', ')}`);
  await until(() => count(store.channelId) > 0);
  store.selectGuild(store.guilds[0].id);
  await write(id);
  setTimeout(() => { quit(); }, 300);
}

const find = (ch: string, id: string): Message | null => { const l = store.messages.get(ch); if (l !== undefined) for (const m of l) if (m.id === id) return m; return null; };
const SAMPLE = '# Notes\n**bold** *it* __under__ ~~gone~~ `code` ||secret|| <@101> in <#302> <:zinc:77> https://zinc.dev [site](https://x.dev)\n> quoted\n```ts\nlet x = 1;\n```';

/** Writing: read states, typing both ways, send (deduped by its nonce), a reply that waits for its rate-limit bucket, an edit refused
 *  once with a 429, a delete, and the Markdown of a message. */
async function write(id: string): Promise<void> {
  await until(() => store.mentions('311') === 0);                // #welcome read on another device: MESSAGE_ACK
  console.log(`read: general unread ${store.unread(id)}, Makers mentions ${store.guildMentions(store.guilds[1])}`);
  const before = count(id);
  store.typed('Hello');
  await until(() => store.typingText(id) !== '');
  console.log(`shown: ${store.typingText(id)}`);
  store.typed('Hello **world** ||secret|| <@101>');
  await store.send();
  const mine = store.lastOwn();
  console.log(`sent once: ${count(id) - before} new, pending ${mine !== null && mine.pending}`);
  store.reply(find(id, '903') as Message);
  store.typed('Replying, after the bucket');
  await store.send();
  await until(() => find(id, '908') !== null);                  // Grace answers, which ends her typing
  console.log(`typing after her answer: '${store.typingText(id)}'`);
  store.edit(find(id, '906') as Message);
  store.typed('Hello **edited** ~~world~~ ||secret|| <@101>');
  await store.send();
  await until(() => { const m = find(id, '906'); return m !== null && m.edited; });
  await store.remove(find(id, '907') as Message);
  await until(() => find(id, '907') === null);
  console.log(`markdown ${describe(parse(SAMPLE, (k: string, x: string): string => k === '#' ? 'general' : store.userName(x), false))}`);
  console.log(`revealed ${describe(parse('a ||b|| c', (k: string, x: string): string => x, true))}`);
}

render(App, 0x313338, null);
store.resume();
if (env('DISCORD_DEMO') === '1') demo();
