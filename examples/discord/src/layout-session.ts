// DISCORD_DEMO=layout (tests/t1/discord_layout.sh): the theme's layout (DISCORD_THEME) against the fake Discord: #general of a server, then
// a DM, printing what the structure holds (a member list, the tabs row, the formatting row of the composer, the workspace header) and
// saving the frames (DISCORD_SHOTS) to look at; the Appearance page then switches the theme live and the structure follows.
import { quit, capture } from 'zinc:gfx';
import * as ui from 'zinc:ui';
import { env } from 'zinc:sys';
import { store } from './state';
import { tr } from './i18n';
import { layout, useTheme } from './theme';
import { picturesLoading } from './services/cdn';

const wait = (ms: number): Promise<void> => new Promise<void>((done: () => void) => { setTimeout(done, ms); });
function until(cond: () => boolean): Promise<void> {
  return new Promise<void>((done: () => void) => { const t = setInterval(() => { if (cond()) { clearInterval(t); done(); } }, 10); });
}
const has = (key: string): boolean => ui.find(tr(key)) >= 0;
/** The member list: the header of its first group ("Online — 1") is a text of the screen only while the list is. */
function memberList(): boolean {
  const r = store.members[0];
  return r !== undefined && r.group !== '' && ui.find(`${store.groupName(r.group)} — ${r.count}`) >= 0;
}
async function shot(name: string): Promise<void> {
  await wait(200);
  await until(() => picturesLoading() === 0);
  await wait(200);
  if (env('DISCORD_SHOTS') !== '') capture(`${env('DISCORD_SHOTS')}/${name}.png`);
}
function report(where: string): void {
  console.log(`layout ${layout()} ${where}: members ${memberList()}, tabs ${has('discord.layout.tab_posts')}, format ${has('discord.layout.bold')}, channels ${has('discord.layout.channels')}, huddles ${has('discord.layout.huddles')}, activity rail ${has('discord.layout.chat')}, back ${has('discord.common.back')}`);
}

export async function layoutSession(): Promise<void> {
  await until(() => store.stage === 'ready');
  store.selectGuild('200');
  store.selectChannel('302');
  await until(() => store.messages.get('302') !== undefined);
  await wait(400);
  report('channel');
  await shot(`${layout()}-channel`);
  store.selectGuild('');
  const dm = store.channels()[0];
  if (dm !== undefined) store.selectChannel(dm.id);
  await wait(500);
  report('dm');
  await shot(`${layout()}-dm`);
  if (env('DISCORD_SWITCH') !== '') {                     // the theme switched live, as Settings > Appearance does
    store.selectGuild('200'); store.selectChannel('302');
    await wait(300);
    useTheme(env('DISCORD_SWITCH')); store.changed();
    await wait(400);
    report('switched');
    await shot(`${layout()}-switched`);
  }
  quit();
}
