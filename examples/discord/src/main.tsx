// discord: a native Discord client in the spirit of discord-lite (no web view, little memory). See README.md.
//   build/zinc run examples/discord
// Keys: Escape quits; push-to-talk's key (F8 until another is chosen in Voice & audio) is held to speak when that input mode is on.
// Test hooks: DISCORD_API, DISCORD_GATEWAY move the endpoints (a fake Discord, tests/t1/discord.sh), DISCORD_TOKEN logs in without the
// keychain, DISCORD_LOG=1 prints what happens, DISCORD_DEMO=1 runs the scripted session (servers, a channel's history, a live message,
// a dropped connection that resumes, a second live message, a DM, then the writing of write() and the pictures, files and members of
// media() below, then the servers switched in settings()) and quits; DISCORD_DEMO=voice runs the call of voice() (tests/t1/discord_voice.sh),
// DISCORD_DEMO=showcase every kind of message content (showcase.ts), DISCORD_DEMO=safety the safety model (safety-session.ts), DISCORD_DEMO=restart a launch that quits once ready (tests/t1/discord_safety.sh); DISCORD_BENCH=1 loads the whole history of the open channel and scrolls it to the top and back (frame times:
// ZINC_PROFILE=1). DISCORD_CACHE moves the pictures' folder, DISCORD_UPLOAD_FILE is the file media() sends.
// Files dropped on the window are sent to the open channel.
import { render } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { quit, capture, imageWidth, imageHeight } from 'zinc:gfx';
import { env } from 'zinc:sys';
import * as storage from 'zinc:storage';
import App from './App';
import { on } from 'zinc:system';
import { store, Message, Attachment, Guild } from './state';
import { parse, describe } from './markdown';
import { picturesLoading } from './services/cdn';
import { historyList } from './components/MessageView';
import { codecLine } from './components/CallView';
import { memberList } from './components/MemberList';
import { showcase } from './showcase';
import { startNotifications } from './services/notifications';
import * as notifs from './services/notifications';
import * as notification from 'zinc:system/notification';
import { VoiceSettings, decibels } from './call';
import { AudioDevice } from 'zinc:discord-voice';
import { TILE_W } from './constants';
import { pickerOpen, confirmPicker } from 'zinc:screen-capture/picker';
import { RTCStats } from 'zinc:webrtc/quality';
import * as guard from './safety/index';
import * as win from 'zinc:system/window';
import * as sys from 'zinc:sys';
import { safety } from './safety-session';
import { startThemes, allThemes, themeErrors, Theme } from './theme';
import { openPicker, closePicker, pickEmoji, pickerTab } from './components/Picker';
import { searchEmoji, recentEmoji } from './emoji';
import { gifs, Gif } from './services/gifs';
import { animationsPlaying, animationFrames } from './components/Animated';
import { CDN_BASE, API_BASE } from './constants';
import { TransferSettings, saveTransferSettings, saveTransferKey } from './services/transfer';
import { transferLinks, transferSteps } from './components/Transfer';

ui.onKey((e: ui.KeyEvent): void => {
  const call = store.call;
  if (call.recordingKey) {   // the settings wait for push-to-talk's key: this one (Escape keeps the old one)
    call.recordingKey = false;
    if (e.key !== 'Escape') call.set((s: VoiceSettings): void => { s.pttKey = e.key; });
    else store.changed();
    e.preventDefault();
    return;
  }
  if (e.primary || e.alt) return;
  if (e.key === 'Escape') { leave(); e.preventDefault(); }
  if (e.key === call.settings.pttKey) { call.hold(true); e.preventDefault(); }
});
ui.onKeyUp((e: ui.KeyEvent): void => { if (e.key === store.call.settings.pttKey) store.call.hold(false); });
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
  console.log(`new messages line after ${store.newFrom}`);   // #general was read up to 902
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
  await present(id);
  await pickers(id);
  await transfer(id);
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

/** Every way out (Escape, the window closed, Ctrl+C, kill) leaves the call and its streams, then keeps the session for a quick restart (the
 *  guard's layer 6). In a call the window hides and the gateway gets half a second to send the goodbyes before the app ends. */
function leave(): void {
  const inCall = store.call.channelId !== '';
  store.suspend();
  if (!inCall) { quit(); return; }
  win.hide();
  setTimeout(() => { quit(); }, 500);
}
win.onCloseRequested((): void => { win.keepOpen(); leave(); });
sys.onSignal('SIGINT', leave);
sys.onSignal('SIGTERM', leave);

startThemes();   // the theme chosen last, before the first frame
render(App, 0x313338, null);
startNotifications();
// one instance (so one session of the account): a second launch brings the first to the front and ends
guard.single().then((first: boolean): void => {
  if (first) store.resume();
  else { console.log('discord: already running, the open window comes to the front'); quit(); }
});
// The scripted sessions send messages, react, vote, call and page through whole histories: they run only against a fake Discord on this
// machine (DISCORD_API on 127.0.0.1 or localhost), never on a real account; the guard still applies its caps and checks to them.
const scripting = env('DISCORD_DEMO') !== '' || env('DISCORD_BENCH') !== '';
const fakeDiscord = scripting && guard.allowScripts();
if (scripting && !fakeDiscord) console.log('discord: DISCORD_DEMO and DISCORD_BENCH run only against a fake Discord on 127.0.0.1');
if (fakeDiscord && env('DISCORD_DEMO') === 'safety') safety();
if (fakeDiscord && env('DISCORD_DEMO') === 'restart') until(() => store.stage === 'ready').then((): void => {
  console.log(`restart: ready, identifies today ${guard.identifiesToday()}`);
  leave();
});
if (fakeDiscord && env('DISCORD_DEMO') === '1') demo();
if (fakeDiscord && env('DISCORD_DEMO') === 'voice') voice();
if (fakeDiscord && env('DISCORD_DEMO') === 'showcase') showcase();

const speaking = (): string => Array.from(store.call.speaking).map((id: string) => store.userName(id)).sort().join(', ');
const pause = (ms: i32): Promise<void> => new Promise<void>((done: () => void) => { setTimeout(done, ms); });

/** Saves the frame shown now as DISCORD_SHOTS/<name>.png (tests/t1/discord_voice.sh compares them), once its pictures are in. */
async function shot(name: string): Promise<void> {
  await pause(150);
  await until(() => picturesLoading() === 0);
  await pause(150);
  if (env('DISCORD_SHOTS') !== '') capture(`${env('DISCORD_SHOTS')}/${name}.png`);
}
const dB = (): number => Math.round(decibels(store.call.level()));
/** One outbound stream of a report ('audio' or 'video'; the whole call's by default), null when none is sent. */
function sent(kind: string, report: Map<string, RTCStats> = store.call.getStats()): RTCStats | null {
  for (const s of report.values()) if (s.type === 'outbound-rtp' && s.kind === kind) return s;
  return null;
}
/** The audio sent over the next two readings, in kbit/s (payload bytes), after the one under way. */
async function audioKbps(): Promise<number> {
  const a0 = sent('audio'), t0 = Date.now();
  await pause(2000);
  const a1 = sent('audio');
  return a0 !== null && a1 !== null ? (a1.bytesSent - a0.bytesSent) * 8 / (Date.now() - t0) : 0;
}

/** Quality: the RTCP reports both ways (the fake answers each sender report at once: a round trip, no loss), the call's reading good; the
 *  ultra low data mode by hand: voice from Opus at 64 kbit/s to about 10, and back. The kbit/s are printed apart (not compared). */
async function quality(): Promise<void> {
  const call = store.call;
  await until(() => call.quality.history.length >= 3 && call.quality.last.rttMs >= 0);
  const q = call.quality.last;
  console.log(`voice: quality ${q.quality}, round trip measured ${q.rttMs >= 0}, loss ${q.lossPct}%, codec ${q.audioCodec}`);
  call.toggleStats();
  await shot('stats');
  call.toggleStats();
  store.selectChannel('303');   // a text channel while in the call: the bars of the call bar open the same details (above the bar)
  call.toggleStats();
  await shot('stats-bar');
  console.log(`voice: details from the call bar ${ui.find('Call quality') >= 0}, MOS ${call.quality.last.mos > 0}, codec line '${codecLine().split(' · ')[0]}'`);
  call.toggleStats();
  store.selectChannel('304');
  call.toggleStats();
  const normal = await audioKbps();
  call.setLowData(true);
  await pause(500);
  const low = await audioKbps();
  call.setLowData(false);
  await pause(500);
  const back = await audioKbps();
  call.toggleStats();
  console.log(`measured: audio ${normal.toFixed(1)} kbit/s, ultra low data ${low.toFixed(1)}, back ${back.toFixed(1)}`);
  console.log(`voice: ultra low data audio under 12 kbit/s ${low > 0 && low < 12}, back over 40 ${back > 40}, kept ${call.settings.lowData}`);
}

/** Go Live: the share dialog (the fake sources, ZINC_FAKE_SCREEN=1), the fake screen shared at the default 720p 30 fps on the stream's own
 *  connection; the fake makes Grace live with ours: watched in her tile, then in full view (decoded bigger), then not; our stream stopped. */
async function goLive(): Promise<void> {
  const call = store.call;
  const sharing = call.shareScreen();
  await until(() => pickerOpen());
  await shot('picker');
  confirmPicker('zinc:fake-screen');
  await sharing;
  await until(() => call.live.has('101'));
  console.log(`voice: live, our stream ${call.streamOf(store.me.id) >= 0}, Grace live ${call.live.has('101')}`);
  call.watchStream('101');
  await until(() => call.streamOf('101') >= 0);
  let img = call.streamOf('101');
  console.log(`voice: watching Grace's stream ${imageWidth(img)}x${imageHeight(img)}`);
  await shot('golive');
  call.focus(true);
  await until(() => imageWidth(call.streamOf('101')) > TILE_W);
  img = call.streamOf('101');
  console.log(`voice: full view ${imageWidth(img)}x${imageHeight(img)}`);
  call.focus(false);
  const ours = (): RTCStats | null => { const o = call.sharing, c = o !== null ? o.conn : null; return c !== null ? sent('video', c.getStats()) : null; };
  await until(() => { const v = ours(); return v !== null && v.targetBitrate > 0 && v.targetBitrate < 1990656; });   // the fake reports 25% lost
  console.log(`measured: Go Live 1152x720 at 1990.7 kbit/s, lowered to ${((ours() as RTCStats).targetBitrate / 1000).toFixed(1)} by the loss reports`);
  console.log(`voice: stream bitrate lowered by 25% loss reports true`);
  call.stopWatching();
  call.stopLive();
  await until(() => !call.live.has('101'));
  console.log(`voice: stream stopped, ours ${call.sharing === null && call.streamOf(store.me.id) < 0}, watching ${call.watching !== null}`);
}

/** A call: the voice channel Lounge opened and joined (op 4, the voice gateway, IP discovery, the mode, Grace heard back), its call view;
 *  the sensitivity raised above our voice (nothing sent) and lowered again with a lower input volume, mute (the call view's frame),
 *  push-to-talk held and let go, deafen, the Voice & audio settings (devices, Grace's volume: their frame, then kept), hanging up; then a
 *  call in the DM with Grace, which rings her and asks for DAVE: our key package goes out, and no frame while the group has no key. Prints
 *  only what is the same on every run. */
async function voice(): Promise<void> {
  await until(() => store.stage === 'ready');
  const call = store.call;
  store.selectGuild('200');
  store.selectChannel('304');
  await call.join('304', '200');
  await until(() => call.state === 'connected');
  console.log(`voice: connected to Lounge, ${call.mode()}`);
  await until(() => call.speaking.has(store.me.id) && call.speaking.has('101'));
  console.log(`voice: speaking ${speaking()}, in Lounge ${call.members('304').map((id: string) => store.userName(id)).sort().join(', ')}`);
  await until(() => call.stats()[3] >= 25);
  const s = call.stats();
  console.log(`voice: heard 25 frames, ${s[2]} failures, mixed ${s[4] > 0}`);
  await quality();
  await call.toggleVideo();   // the fake camera; the fake server sends it back as Grace's, decoded at her tile's size
  await until(() => call.videoOf('101') >= 0);
  const img = call.videoOf('101'), v = call.videoStats();
  console.log(`voice: camera on, sent ${v[0] > 0 && v[1] > 0}, Grace's camera ${imageWidth(img)}x${imageHeight(img)}, ours ${call.videoOf(store.me.id) >= 0}`);
  await shot('video');
  const full = sent('video');
  call.setLowData(true);   // the camera at a quarter of its size, 5 fps, 60 kbit/s at most
  await until(() => { const v = sent('video'); return v !== null && v.frameWidth < 640; });
  await pause(2000);
  const v0 = sent('video'), t0 = Date.now();
  await pause(2000);
  const v1 = sent('video');
  const tiny = v0 !== null && v1 !== null ? (v1.bytesSent - v0.bytesSent) * 8 / (Date.now() - t0) : 0;
  console.log(`measured: camera ${full !== null ? full.frameWidth : 0}x${full !== null ? full.frameHeight : 0} at ${full !== null ? full.targetBitrate / 1000 : 0} kbit/s, ultra low data ${v1 !== null ? v1.frameWidth : 0}x${v1 !== null ? v1.frameHeight : 0} ${tiny.toFixed(1)} kbit/s`);
  console.log(`voice: ultra low data camera ${v1 !== null ? v1.frameWidth : 0}x${v1 !== null ? v1.frameHeight : 0}, under 80 kbit/s ${tiny > 0 && tiny < 80}`);
  call.setLowData(false);
  ui.systemSignal('background');   // minimized: nothing decoded, the server asked for nothing
  await pause(300);
  const hidden = call.videoStats()[2];
  await pause(300);
  console.log(`voice: minimized, decoding stopped ${call.videoStats()[2] === hidden}`);
  ui.systemSignal('foreground');
  await until(() => call.videoStats()[2] > hidden);
  await call.toggleVideo();
  await until(() => !call.hasVideo('101'));
  console.log(`voice: camera off, Grace's camera ${call.videoOf('101')}`);
  await goLive();
  call.set((v: VoiceSettings): void => { v.sensitivity = -10; });   // our tone is at -13 dB: under it, nothing leaves
  await until(() => !call.speaking.has(store.me.id) && !call.speaking.has('101'));
  await pause(400);
  console.log(`voice: sensitivity -10 dB, level under it ${dB() < -10}, speaking '${speaking()}'`);   // -13.5 dB: not rounded, at the edge
  call.set((v: VoiceSettings): void => { v.sensitivity = -40; v.inputVolume = 80; });
  await until(() => call.speaking.has(store.me.id));
  console.log(`voice: sensitivity -40 dB, input volume 80%, level ${dB()} dB, speaking ${speaking()}`);
  call.toggleMute();
  await until(() => !call.speaking.has(store.me.id) && !call.speaking.has('101'));   // Grace only echoes what we send
  console.log(`voice: muted, speaking '${speaking()}'`);
  call.since = Date.now() - 64500;   // the frame shows 1:04 whenever it runs
  store.changed();
  await shot('call');
  store.call.setPushToTalk(true);   // before unmuting: no frame slips out between the two
  store.call.toggleMute();
  await pause(400);
  console.log(`voice: push-to-talk, not held, speaking '${speaking()}'`);
  store.call.hold(true);
  await until(() => store.call.speaking.has(store.me.id) && store.call.speaking.has('101'));   // and Grace echoes it
  console.log(`voice: push-to-talk held, speaking ${speaking()}`);
  store.call.hold(false);
  await until(() => !store.call.speaking.has(store.me.id));
  store.call.toggleDeaf();          // before push-to-talk goes off: no frame slips out between the two
  store.call.setPushToTalk(false);
  console.log(`voice: deafened, mute ${store.call.mute || store.call.deaf}`);
  store.call.toggleDeaf();
  store.call.toggleMute();          // muted for the settings' frame: nobody speaks, the meter still moves
  store.showSettings(true);
  store.showSettingsTab('voice');
  const fake = (l: AudioDevice[]): string => l.length > 0 ? l[0].id : '';
  call.set((v: VoiceSettings): void => { v.input = fake(call.inputs()); v.output = fake(call.outputs()); });
  call.setUserVolume('101', 150);
  await shot('settings');
  const kept = new VoiceSettings();
  kept.load(storage.get('voice'));
  console.log(`voice: settings kept ${kept.text() === call.settings.text()}: ${kept.text()}`);
  store.showSettings(false);
  store.call.toggleMute();
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
  await until(() => store.members.length === 157 && store.presenceOf('102').status === 'dnd');   // Katherine came, linus is busy
  ui.scrollTo(memberList(), 0, 1e9);                                            // the list's end: op 37 asks for its second hundred
  await until(() => store.members[156].known);
  console.log(`member list scrolled: ${store.members.filter((r) => r.known).length} of ${store.members.length} rows, last ${store.userName(store.members[156].userId)}`);
  const pr = (id: string): string => { const p = store.presenceOf(id); return `${p.status}${p.mobile ? ' (mobile)' : ''}`; };
  console.log(`presences: Grace ${pr('101')}, linus ${pr('102')}, Katherine ${pr('103')}, Ada's name ${store.roleColor(store.members[1]).toString(16)}`);
  ui.scrollTo(memberList(), 0, 0);
  await shot('members');                                                       // DISCORD_SHOTS: the list and the DMs' presences, to look at
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

/** Scrolled up, a new message is counted in the bar and not read; 'Jump to present' goes back to the end, which reads it. */
async function present(id: string): Promise<void> {
  ui.scrollTo(historyList(), 0, 0);
  await until(() => !store.atEnd);
  store.dispatch('MESSAGE_CREATE', { id: '965', channel_id: id, author: { id: '101', username: 'grace', global_name: 'Grace', avatar: 'av101' },
    content: 'While you read the history', timestamp: '2026-10-30T09:39:00.000000+00:00', attachments: [], mentions: [] });
  console.log(`scrolled up: ${store.newWhileUp} new, unread ${store.unread(id)}`);
  ui.scrollTo(historyList(), 0, 1e9);
  store.jumpToPresent();
  await until(() => store.atEnd && !store.unread(id));
  console.log(`at the present: ${store.newWhileUp} new, unread ${store.unread(id)}`);
}

/** The pickers: an emoji found by name and a custom one put in the message box, a reaction from the picker, the trending GIFs and a search
 *  asked once however often it is shown, a GIF and a sticker sent, and a GIF attachment that plays while it is on screen. */
async function pickers(id: string): Promise<void> {
  openPicker('emoji', null);
  pickEmoji(searchEmoji('grinning face', 1)[0]);
  pickEmoji('<:zinc:77>');
  await shot('emoji-picker');
  console.log(`emoji: draft "${store.draft}", recent ${recentEmoji().slice(0, 2).join(' ')}, picker ${pickerTab()}`);
  closePicker();
  store.typed('');
  const target = last(id) as Message;
  openPicker('emoji', target);
  pickEmoji('<:zinc:77>');
  await until(() => target.reactions.some((r) => r.id === '77' && r.me));
  console.log(`reacted from the picker: ${target.reactions.map((r) => `${r.name} ${r.count}`).join(', ')}, picker "${pickerTab()}"`);
  openPicker('gif', null);
  const trending = await gifs('');
  const cats = await gifs('cats');
  const again = await gifs('Cats ');   // the same query: no second request
  await shot('gif-picker');
  console.log(`gifs: trending ${trending.length}, cats ${cats.map((g: Gif) => g.title).join(', ')}, again ${again.length}`);
  closePicker();
  await store.sendLink(cats[0].url);
  await until(() => { const m = last(id); return m !== null && !m.pending && m.content === cats[0].url; });
  const g = store.guilds.find((x: Guild) => x.id === '200') as Guild;
  await store.sendSticker(g.stickers[0]);
  await until(() => { const m = last(id); return m !== null && !m.pending && m.stickers.length === 1; });
  console.log(`sent: a gif link and the sticker ${(last(id) as Message).stickers[0].name}`);
  const ex = (Math.floor(Date.now() / 1000) + 86400).toString(16), is = (Math.floor(Date.now() / 1000) - 7200).toString(16);
  const grace: any = { id: '101', username: 'grace', global_name: 'Grace', avatar: 'av101' };
  store.dispatch('MESSAGE_CREATE', { id: '960', channel_id: id, author: grace, content: '', timestamp: '2026-10-30T09:39:00.000000+00:00', mentions: [],
    attachments: [{ id: '803', filename: 'dance.gif', size: 5000, width: 12, height: 6, content_type: 'image/gif',
      url: `${CDN_BASE}/attachments/${id}/960/803/dance.gif?ex=${ex}&is=${is}&hm=sig2&`, proxy_url: `${CDN_BASE}/attachments/${id}/960/803/dance.gif?ex=${ex}&is=${is}&hm=sig2&` }] });
  await until(() => animationsPlaying() > 0);
  const shown = animationFrames();
  await until(() => animationFrames() >= shown + 2);   // it plays: the next frames come at the GIF's delays
  console.log(`a GIF plays: ${animationsPlaying()} on screen`);
}

/** A file over the 10 MB of a free account: the transfer window takes it, to a Gokapi server (the fake's), with its progress; the link is
 *  posted by the window's button. */
async function transfer(id: string): Promise<void> {
  const t = new TransferSettings();
  t.provider = 'gokapi'; t.url = `${API_BASE.split('/api/')[0]}/gokapi`;
  saveTransferSettings(t);
  await saveTransferKey('gokapi', 'gk-key');
  await store.sendFiles([env('DISCORD_TRANSFER_FILE')]);
  console.log(`too large for Discord: ${store.transferPaths.length} file in the transfer window`);
  await until(() => ui.find('Upload') >= 0);
  await pause(100);   // its saved key read
  await shot('transfer');
  ui.click(ui.find('Upload'));
  await until(() => ui.find('Post the links') >= 0);
  console.log(`transferred: ${transferLinks().join(', ')}, progress in steps ${transferSteps() > 2}`);
  ui.click(ui.find('Post the links'));
  await until(() => { const m = last(id); return m !== null && !m.pending && m.content === transferLinks()[0]; });
  console.log(`posted: ${(last(id) as Message).content}, window ${store.transferPaths.length > 0 ? 'open' : 'closed'}`);
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
 *  choice is kept (zinc:storage). Then the themes found; their pane stays open for the last frame. */
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
  console.log(`themes: ${allThemes().map((t: Theme) => `${t.id} (${t.scheme}, ${t.density})`).join(', ')}; errors ${themeErrors().length}`);
  store.showSettingsTab('appearance');   // the last frame: the themes
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
if (fakeDiscord && env('DISCORD_BENCH') === '1') bench();
