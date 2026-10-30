// discord: a native Discord client in the spirit of discord-lite (no web view, little memory). See README.md.
//   build/zinc run examples/discord
// Keys: Escape quits; F8 (PTT_KEY) is push-to-talk, held, when it is switched on in the call bar.
// Test hooks: DISCORD_API, DISCORD_GATEWAY move the endpoints (a fake Discord, tests/t1/discord.sh), DISCORD_TOKEN logs in without the
// keychain, DISCORD_LOG=1 prints what happens, DISCORD_DEMO=1 runs the scripted session (servers, a channel's history, a live message,
// a dropped connection that resumes, a second live message, a DM, then the writing of write() and the pictures, files and members of
// media() below, then the servers switched in settings()) and quits; DISCORD_DEMO=voice runs the call of voice() (tests/t1/discord_voice.sh),
// DISCORD_DEMO=showcase every kind of message content (showcase.ts); DISCORD_BENCH=1 loads the whole history of the open channel and scrolls it to the top and back (frame times:
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
import { showcase } from './showcase';
import { startNotifications } from './services/notifications';
import * as notifs from './services/notifications';
import * as notification from 'zinc:system/notification';
import { PTT_KEY } from './constants';

ui.onKey((e: ui.KeyEvent): void => {
  if (e.primary || e.alt) return;
  if (e.key === 'Escape') { quit(); e.preventDefault(); }
  if (e.key === PTT_KEY) { store.call.hold(true); e.preventDefault(); }
});
ui.onKeyUp((e: ui.KeyEvent): void => { if (e.key === PTT_KEY) store.call.hold(false); });
// a file dropped on the window: sent to the open channel (a dropped text is not a file)
on('drop', (args: string[]): void => { if (args.length > 0 && !(args.length > 1 && args[1] === 'text')) store.sendFiles([args[0]]); });

function until(cond: () => boolean): Promise<void> {
  return new Promise<void>((done: () => void) => { const t = setInterval(() => { if (cond()) { clearInterval(t); done(); } }, 10); });
}
const count = (id: string): i32 => { const l = store.messages.get(id); return l !== undefined ? l.length : -1; };

/** Opens the first channel that reads (a server or the DMs open none until one is chosen). */
function openFirst(): string {
  for (const c of store.channels()) if (c.readable()) { store.selectChannel(c.id); return c.id; }
  return '';
}

async function demo(): Promise<void> {
  await until(() => store.stage === 'ready');
  console.log(`servers ${store.guilds.map((g) => g.name).join(', ')}`);
  console.log(`channels ${store.channels().map((c) => c.name).join(', ')}, open '${store.channelId}'`);
  const id = openFirst();
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
  console.log(`dms open: '${store.channelId}'`);
  openFirst();
  console.log(`dms ${store.channels().map((c) => c.name).join(', ')}`);
  await until(() => count(store.channelId) > 0);
  store.selectGuild(store.guilds[0].id);
  store.selectChannel(id);
  await write(id);
  await media(id);
  await notifications(id);
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
startNotifications();
store.resume();
if (env('DISCORD_DEMO') === '1') demo();
if (env('DISCORD_DEMO') === 'voice') voice();
if (env('DISCORD_DEMO') === 'showcase') showcase();

const speaking = (): string => Array.from(store.call.speaking).map((id: string) => store.userName(id)).sort().join(', ');
const pause = (ms: i32): Promise<void> => new Promise<void>((done: () => void) => { setTimeout(done, ms); });

/** A call: the voice channel Lounge joined (op 4, the voice gateway, IP discovery, the mode, Grace heard back), mute, push-to-talk held
 *  and let go, deafen, hanging up; then a call in the DM with Grace, which rings her and asks for DAVE: our key package goes out, and no
 *  frame while the group has no key. Prints only what is the same on every run. */
async function voice(): Promise<void> {
  await until(() => store.stage === 'ready');
  await store.call.join('304', '200');
  await until(() => store.call.state === 'connected');
  console.log(`voice: connected to Lounge, ${store.call.mode()}`);
  await until(() => store.call.speaking.has(store.me.id) && store.call.speaking.has('101'));
  console.log(`voice: speaking ${speaking()}, in Lounge ${store.call.members('304').map((id: string) => store.userName(id)).sort().join(', ')}`);
  await until(() => store.call.stats()[3] >= 25);
  const s = store.call.stats();
  console.log(`voice: heard 25 frames, ${s[2]} failures, mixed ${s[4] > 0}`);
  store.call.toggleMute();
  await until(() => !store.call.speaking.has(store.me.id) && !store.call.speaking.has('101'));   // Grace only echoes what we send
  console.log(`voice: muted, speaking '${speaking()}'`);
  store.call.setPushToTalk(true);   // before unmuting: no frame slips out between the two
  store.call.toggleMute();
  await pause(400);
  console.log(`voice: push-to-talk, not held, speaking '${speaking()}'`);
  store.call.hold(true);
  await until(() => store.call.speaking.has(store.me.id));
  console.log(`voice: push-to-talk held, speaking ${speaking()}`);
  store.call.hold(false);
  await until(() => !store.call.speaking.has(store.me.id));
  store.call.toggleDeaf();          // before push-to-talk goes off: no frame slips out between the two
  store.call.setPushToTalk(false);
  console.log(`voice: deafened, mute ${store.call.mute || store.call.deaf}`);
  store.call.toggleDeaf();
  store.call.leave();
  console.log(`voice: left, ${store.call.state}`);
  await until(() => store.call.members('304').indexOf(store.me.id) < 0);
  await store.call.join('400', '');
  await until(() => store.call.state === 'connected');
  await pause(500);   // DAVE: the fake makes no MLS group, so no key ever comes and nothing may leave unencrypted
  console.log(`voice: DM call connected, end-to-end encrypted ${store.call.e2ee()}, packets sent without a key ${store.call.stats()[0]}`);
  store.call.leave();
  await pause(300);
  quit();
}

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

/** Notifications: none for the channel shown in the focused window, one for a DM while the window is behind another, a click on it opens
 *  the DM (and its read clears the Dock's badge). The messages are dispatched as the gateway delivers them. */
async function notifications(id: string): Promise<void> {
  const grace: any = { id: '101', username: 'grace', global_name: 'Grace', avatar: 'av101' };
  const msg = (mid: string, ch: string, text: string): any => ({ id: mid, channel_id: ch, author: grace, content: text, timestamp: '2026-10-30T09:40:00.000000+00:00', attachments: [], mentions: [] });
  ui.systemSignal('focus 1');
  store.dispatch('MESSAGE_CREATE', msg('970', id, 'Seen here, no notification'));
  ui.systemSignal('focus 0');
  const dm: any = msg('971', '400', 'Are you there? <@100>');
  dm.mentions = [{ id: '100', username: 'ada', global_name: 'Ada', avatar: null }];
  store.dispatch('MESSAGE_CREATE', dm);
  await until(() => notifs.last !== null);
  console.log(`notified: badge ${store.totalMentions()}`);
  for (const f of (notifs.last as notification.Notification).clickCbs) f();   // as the system's notification-click event does
  ui.systemSignal('focus 1');
  console.log(`clicked: open ${store.channelId}, badge ${store.totalMentions()}`);
  await until(() => count('400') > 1 && !store.unread(id));   // the DM's history, and #general read (its ack waits for the burst)
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
  await until(() => store.stage === 'ready');
  const id = openFirst();
  await until(() => count(id) > 0);
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
