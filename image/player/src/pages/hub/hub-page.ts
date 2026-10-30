// ============================================================================
// pages/hub/hub-page.ts — Get apps: pair with a Zinc hub, browse its apps for this Pi, install them
// ============================================================================
// The + of the top bar opens it. Unpaired: the hub's address, then the code it prints. Paired: the apps of its signed
// catalog made for this Pi, each with Install (or Update) and a line for what it is; Forget unpairs. An installed app
// appears with the others on the home page and in All apps (services/hub.ts writes the agent's layout).

import { gradient, lineHeight } from 'zinc:gfx';
import { BACKGROUND_THEMES, BUTTON_HEIGHT, COLOR_WHITE, HOME_CONTENT_MAX_WIDTH, PAGE_PADDING, ROW_HEIGHT, TOP_BAR_HEIGHT } from '../../constants';
import { Fonts } from '../../fonts';
import { DisplayObject } from '../../core/display';
import { ScrollBox, beginScrollBox, endScrollBox, uiState } from '../../core/input';
import { agentDirectory, appState, closeForm, deviceName, openForm, refreshSystem } from '../../state';
import { BUTTON_GLASS, BUTTON_LIGHT, drawButton, measureButton } from '../../components/buttons';
import { drawLabel, drawWrappedText } from '../../components/primitives';
import { drawMessage, drawSettingRow } from '../../components/rows';
import { HubEntry, forgetHub, hubState, installEntry, pairHub, readCatalog } from '../../services/hub';

const ROW_GAP = 8;

function say(text: string, isError: boolean): void {
  hubState.message = text;
  hubState.isError = isError;
  uiState.dirty = true;
}

/** Runs a hub action for the button `action`: one at a time, its error said on the page. */
function run(action: string, work: () => Promise<string>): void {
  if (hubState.busy !== '') return;
  hubState.busy = action;
  say('', false);
  work().then((done: string) => {
    hubState.busy = '';
    say(done, false);
    refreshSystem();
  }, (error: Error) => {
    hubState.busy = '';
    say(error.message, true);
  });
}

export function refreshHub(): void {
  if (!hubState.config.paired) return;
  run('refresh', async (): Promise<string> => {
    await readCatalog(agentDirectory);
    return hubState.entries.length === 0 ? 'The hub has no app for this Pi yet.' : '';
  });
}

/** The hub's address, then its code. */
function askPairing(): void {
  openForm('Zinc hub', 'Its address, as it prints it: name.local:8787', hubState.config.server, false, 'Next', 120, '', (server: string) => {
    openForm('Pair with ' + server, 'The six digits the hub prints', '', false, 'Pair', 6, '', (code: string) => {
      appStateBusy(true);
      pairHub(server, code, deviceName()).then(() => {
        appStateBusy(false);
        closeForm();
        say('Paired with ' + hubState.config.server + ' (key ' + hubState.config.serverKey.slice(0, 16) + '…).', false);
        refreshHub();
      }, (error: Error) => {
        appStateBusy(false);
        openFormError(error.message);
      });
    });
  });
}
// the form's waiting state and its error
function appStateBusy(on: boolean): void { appState.form.isBusy = on; uiState.dirty = true; }
function openFormError(text: string): void { appState.form.error = text; uiState.dirty = true; }

function install(entry: HubEntry): void {
  run('install/' + entry.id, (): Promise<string> => installEntry(agentDirectory, entry));
}

export class HubPageNode extends DisplayObject {
  private scroll: ScrollBox = new ScrollBox();

  constructor() {
    super('HubPage');
  }

  override onAddedToStage(): void {
    this.scroll.scrollY = 0;
    say('', false);
    refreshHub();
  }

  override onDraw(pageWidth: number, pageHeight: number): void {
    const theme = BACKGROUND_THEMES[appState.config.backgroundTheme];
    gradient(0, 0, pageWidth, pageHeight, 0, theme.topColor, theme.bottomColor, true, 255);
    const contentWidth = Math.min(HOME_CONTENT_MAX_WIDTH + 80, pageWidth - PAGE_PADDING * 2);
    const contentX = Math.round((pageWidth - contentWidth) / 2);
    let cursorY = TOP_BAR_HEIGHT + 8;
    const cfg = hubState.config;

    if (!cfg.paired) {
      drawLabel(Fonts.title, contentX, cursorY, 'Get apps from a Zinc hub', COLOR_WHITE, contentWidth);
      cursorY += lineHeight(Fonts.title) + 8;
      cursorY += drawWrappedText(Fonts.body, contentX, cursorY, 'Start a hub on a computer (zinc run app/hub-server), then pair this Pi with the code it prints. ' +
        'Apps published to it with zinc publish --target rpi appear here.', COLOR_WHITE, contentWidth, 4, 24) + 12;
      drawButton('hub/pair', contentX, cursorY, 0, 'Pair with a hub', 'laptop', BUTTON_LIGHT, askPairing);
      cursorY += BUTTON_HEIGHT + 10;
      drawMessage(contentX, cursorY, contentWidth, hubState.message, hubState.isError);
      return;
    }

    const forgetWidth = measureButton('Forget', 'x');
    const refreshWidth = measureButton('Refresh', 'refresh-cw');
    drawLabel(Fonts.bodyBold, contentX, cursorY + (BUTTON_HEIGHT - lineHeight(Fonts.bodyBold)) / 2, cfg.server, COLOR_WHITE, contentWidth - forgetWidth - refreshWidth - 20);
    drawButton('hub/refresh', contentX + contentWidth - forgetWidth - refreshWidth - 10, cursorY, refreshWidth, 'Refresh', 'refresh-cw', BUTTON_GLASS, refreshHub, hubState.busy === '');
    drawButton('hub/forget', contentX + contentWidth - forgetWidth, cursorY, forgetWidth, 'Forget', 'x', BUTTON_GLASS, () => { forgetHub(); say('This Pi forgot the hub.', false); }, hubState.busy === '');
    cursorY += BUTTON_HEIGHT + 6;
    const status = hubState.busy === 'refresh' ? 'Reading the catalog…' : hubState.busy.startsWith('install/') ? 'Downloading and checking ' + hubState.busy.slice(8) + '…' : '';
    if (status !== '') { drawLabel(Fonts.small, contentX, cursorY, status, COLOR_WHITE, contentWidth); cursorY += 24; }
    cursorY += drawMessage(contentX, cursorY, contentWidth, hubState.message, hubState.isError);

    const entries = hubState.entries;
    const viewportHeight = pageHeight - cursorY;
    beginScrollBox(this.scroll, 0, cursorY, pageWidth, viewportHeight);
    this.scroll.contentHeight = entries.length * (ROW_HEIGHT + ROW_GAP);
    this.scroll.clamp();
    const top = cursorY - this.scroll.scrollY;
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      const rowY = top + index * (ROW_HEIGHT + ROW_GAP);
      if (rowY + ROW_HEIGHT < cursorY || rowY > pageHeight) continue;
      const ch = entry.channel;
      const label = entry.installed === '' ? 'Install' : entry.installed === ch.version ? 'Installed' : 'Update';
      const buttonWidth = measureButton(label, 'download');
      const about = (ch.description !== '' ? ch.description + ' · ' : '') + ch.version + ' · ' + (ch.kind === 'export' ? 'with its engine' : ch.target === 'any' ? 'any machine' : ch.target) +
        (ch.size > 0 ? ' · ' + Math.max(1, Math.round(ch.size / 1024)).toString() + ' KB' : '');
      drawSettingRow('hub/row/' + entry.id, contentX, rowY, contentWidth, entry.name, about, buttonWidth + 16);
      drawButton('hub/install/' + entry.id, contentX + contentWidth - buttonWidth - 8, rowY + (ROW_HEIGHT - BUTTON_HEIGHT) / 2, buttonWidth, label, 'download', BUTTON_LIGHT,
        () => install(entry), hubState.busy === '' && label !== 'Installed');
    }
    endScrollBox();
  }
}
