// DISCORD_DEMO=tips (tests/t1/discord_i18n.sh): #general against the fake Discord, then Tab through the screen: each stop prints its label and
// whether a tooltip with that text is on screen (the icon-only buttons have one, a row of text does not), until the focus reaches the Mute
// button of the user bar, where the last frame is taken: in the language of the run (ZINC_LANG), the tooltip over the button.
import { quit } from 'zinc:gfx';
import * as ui from 'zinc:ui';
import { store } from './state';
import { env } from 'zinc:sys';
import { savedLanguage } from 'zinc:i18n';
import { tr, lang } from './i18n';

const wait = (ms: number): Promise<void> => new Promise<void>((done: () => void) => { setTimeout(done, ms); });
function until(cond: () => boolean): Promise<void> {
  return new Promise<void>((done: () => void) => { const t = setInterval(() => { if (cond()) { clearInterval(t); done(); } }, 10); });
}
/** Whether a hint with this text is on screen: its Text node and the nodes above it are not hidden. */
function shown(text: string): boolean {
  let h = ui.find(text);
  if (h < 0 || ui.inspectNode(h) === null || (ui.inspectNode(h) as ui.UiNode).text !== text) return false;
  for (; h >= 0; h = ui.parentOf(h)) { const n = ui.inspectNode(h); if (n !== null && n.hidden) return false; }
  return true;
}

export async function tipsSession(): Promise<void> {
  await until(() => store.stage === 'ready');
  store.selectGuild('200');
  store.selectChannel('302');
  await until(() => store.messages.get('302') !== undefined);
  await wait(300);
  console.log(`language ${lang()}`);
  if (env('DISCORD_TIPS') === 'language') { await language(); return; }
  const mute = tr('discord.call.mute');
  for (let i = 1; i <= 80; i++) {
    ui.keyDown(-1, 'Tab');
    await wait(20);
    const n = ui.inspectNode(ui.focused());
    const label = n === null ? '' : n.label;
    console.log(`tab ${i}: ${label} tip ${label !== '' && shown(label)}`);
    if (label === mute) break;
  }
  await wait(100);
  quit();
}

/** Settings > Appearance: the Language row switches the whole app (the next render) and keeps the choice in ZINC_HOME/config.json; the last frame
 *  is the Account safety page in the new language. */
async function language(): Promise<void> {
  store.showSettings(true);
  store.showSettingsTab('appearance');
  await wait(200);
  console.log(`language ${lang()}, saved '${savedLanguage()}', row Français ${ui.find('Français') >= 0}`);
  ui.click(ui.find('Français'));
  await wait(300);
  console.log(`language ${lang()}, saved '${savedLanguage()}', Mute is now '${tr('discord.call.mute')}', Settings tab '${tr('discord.settings.safety')}' ${ui.find(tr('discord.settings.safety')) >= 0}`);
  store.showSettingsTab('safety');
  await wait(300);
  quit();
}
