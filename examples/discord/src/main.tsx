// discord: a native Discord client in the spirit of discord-lite (no web view, little memory). See README.md.
//   build/zinc run examples/discord
// Keys: Escape quits.
// Test hooks: DISCORD_API, DISCORD_GATEWAY move the endpoints (a fake Discord, tests/t1/discord.sh), DISCORD_TOKEN logs in without the
// keychain, DISCORD_LOG=1 prints what happens, DISCORD_DEMO=1 runs the scripted session (servers, a channel's history, a live message,
// a dropped connection that resumes, a second live message, a DM) and quits.
import { render } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';
import { env } from 'zinc:sys';
import App from './App';
import { store } from './state';

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
  setTimeout(() => { quit(); }, 300);
}

render(App, 0x313338, null);
store.resume();
if (env('DISCORD_DEMO') === '1') demo();
