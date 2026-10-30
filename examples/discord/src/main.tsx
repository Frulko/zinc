// discord: a native Discord client in the spirit of discord-lite (no web view, little memory). See README.md.
//   build/zinc run examples/discord
// Keys: Escape quits.
// Test hooks: DISCORD_API, DISCORD_GATEWAY move the endpoints (a fake Discord, tests/t1/discord.sh), DISCORD_TOKEN logs in without the
// keychain, DISCORD_LOG=1 prints what happens, DISCORD_DEMO=1 runs the scripted session (servers, a channel's history, a live message,
// a dropped connection that resumes, a second live message, a DM, then the writing of write() and the pictures, files and members of
// media() below, then the servers switched in settings()) and quits; DISCORD_BENCH=1 loads the whole history of the open channel and scrolls it to the top and back (frame times:
// ZINC_PROFILE=1). DISCORD_CACHE moves the pictures' folder, DISCORD_UPLOAD_FILE is the file media() sends.
// Files dropped on the window are sent to the open channel.
import { render } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';
import { env } from 'zinc:sys';
import * as storage from 'zinc:storage';
import App from './App';
import { on } from 'zinc:system';
import { store, Message, Attachment, Guild } from './state';
import { parse, describe } from './markdown';
import { picturesLoading } from './services/cdn';
import { historyList } from './components/MessageView';

ui.onKey((e: ui.KeyEvent): void => {
  if (e.primary || e.alt) return;
  if (e.key === 'Escape') { quit(); e.preventDefault(); }
});
// a file dropped on the window: sent to the open channel (a dropped text is not a file)
on('drop', (args: string[]): void => { if (args.length > 0 && !(args.length > 1 && args[1] === 'text')) store.sendFiles([args[0]]); });

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
  await media(id);
  settings();
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

const last = (ch: string): Message | null => { const l = store.messages.get(ch); return l !== undefined && l.length > 0 ? l[l.length - 1] : null; };

/** Pictures, files and members: the member list (SYNC, then an INSERT and an UPDATE), the page of history before the first, a file sent
 *  with the cloud upload, and every picture of the channel loaded (from the CDN, the disk, an expired attachment URL renewed). */
async function media(id: string): Promise<void> {
  await until(() => store.members.length >= 6);
  const n = await store.loadOlder();
  console.log(`older page: ${n} messages, all loaded ${store.allLoaded(id)}, ${count(id)} in the channel`);
  store.typed('Here is the photo');
  await store.sendFiles([env('DISCORD_UPLOAD_FILE')]);
  await until(() => { const m = last(id); return m !== null && !m.pending && m.attachments.length === 1 && m.attachments[0].url !== ''; });
  const m = last(id) as Message;
  console.log(`sent a file: ${m.content}, ${m.attachments.map((a: Attachment) => `${a.filename} ${a.width}x${a.height}`).join(', ')}`);
  await until(() => store.typingText(id) !== '');                              // Grace types back: in the last frame
  await new Promise<void>((done: () => void) => { setTimeout(done, 100); });   // a frame shows the rows, which ask for their pictures
  await until(() => picturesLoading() === 0);
}

/** The settings: a server switched off leaves the rail and its counts, one joined after the choice comes off and new, the DMs stay; the
 *  choice is kept (zinc:storage). The screen stays open for the last frame. */
function settings(): void {
  const rail = (): string => store.shownGuilds().map((g: Guild) => `${g.name}(${store.guildUnread(g) ? 'unread' : 'read'} ${store.guildMentions(g)})`).join(' ');
  store.showSettings(true);
  console.log(`settings: rail ${rail()}`);
  store.setAllShown(false);
  console.log(`settings: all hidden, rail ${rail()}`);
  store.setShown('201', true);
  store.setShown('200', false);                                                  // Zinc Lab off: it was open
  store.dispatch('GUILD_CREATE', { id: '202', name: 'Joined later', icon: null, channels: [{ id: '321', type: 0, name: 'hello', position: 0, last_message_id: '960' }] });
  const later = store.findGuild('202') as Guild;
  console.log(`settings: rail ${rail()}, joined later shown ${store.shown(later)} new ${store.isNew(later)}, dms ${store.dms.length}, open ${store.guildId}`);
  console.log(`settings: kept ${storage.get('servers')}`);
}

/** DISCORD_BENCH: the open channel's whole history, then a scroll to its top and back, 60 px a frame. */
async function bench(): Promise<void> {
  await until(() => store.stage === 'ready' && count(store.channelId) > 0);
  const id = store.channelId;
  while (!store.allLoaded(id)) if (await store.loadOlder() === 0) await new Promise<void>((done: () => void) => { setTimeout(done, 50); });
  console.log(`bench: ${count(id)} messages`);
  await new Promise<void>((done: () => void) => { setTimeout(done, 300); });
  let down = false, frames = 0;
  const t = setInterval(() => {
    const h = historyList();
    if (h < 0) return;
    frames++;
    if (!down) { ui.scrollBy(h, 0, -60); if (ui.scrollTop(h) <= 0) down = true; }
    else { const before = ui.scrollTop(h); ui.scrollBy(h, 0, 60); if (ui.scrollTop(h) === before) { clearInterval(t); console.log(`bench: ${frames} scroll steps`); quit(); } }
  }, 16);
}
if (env('DISCORD_BENCH') === '1') bench();
