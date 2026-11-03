// ============================================================================
// pages/home/home-page.ts — The welcome: a coloured page that invites to try
// ============================================================================
// What a person sees when the Pi starts with no app, or after it quit: hello, what Zinc is, and the one next step to
// send an app from a computer (join a network, turn on the agent, pair with the code shown here, then zinc dev), with
// "Start the app" when one is installed. Once apps were sent, the last six take the place of the welcome (a + opens
// all of them), and Edit shows the buttons that delete them.

import { gradient, lineHeight, rrect, textWidth } from 'zinc:gfx';
import {
  ANIMATION_PAUSE_AFTER_IDLE_SECONDS,
  BACKGROUND_THEMES,
  BUTTON_HEIGHT,
  CORNER_RADIUS,
  COLOR_WHITE,
  HOME_APPS_SHOWN,
  HOME_CONTENT_MAX_WIDTH,
  PAGE_PADDING,
  SECTION_WIFI,
  TOP_BAR_HEIGHT,
} from '../../constants';
import { Fonts } from '../../fonts';
import { DisplayObject } from '../../core/display';
import { uiState } from '../../core/input';
import { AmbientAnimation } from '../../components/ambient-animation';
import {
  appState,
  deviceName,
  openAllApps,
  openPairing,
  openSettings,
  refreshSystem,
  setAgentEnabled,
  startApp,
  toggleEditingApps,
  zincVersion,
} from '../../state';
import { BUTTON_GLASS, BUTTON_LIGHT, drawButton, measureButton } from '../../components/buttons';
import { APP_TILE_HEIGHT, drawAppTile, drawMoreTile } from '../../components/app-tiles';
import { drawMessage } from '../../components/rows';
import { countWrappedLines, drawGlyph, drawLabel, drawWrappedText } from '../../components/primitives';

const CARD_PADDING = 20;
const CARD_ICON_SIZE = 28;
const CODE_BOX_HEIGHT = 40;
const TEXT_LINE_HEIGHT = 22;
const APP_SLOTS = HOME_APPS_SHOWN + 1;
const APP_SLOT_GAP = 8;
const APP_ROW_GAP = 14;
/** The narrowest tile slot: a name still fits under its icon. */
const APP_SLOT_MIN = 80;
const NARROW_WIDTH = 640;
const NARROW_CARD_WIDTH = 500;
/** Below this height there is room for the tiles only. */
const TINY_HEIGHT = 300;
/** Room the stacked pairing card adds under the code. */
const PAIRING_STACK = 52;
const APPS_ROW_TOP = 14;

/** The next step the card offers, from the machine's state. */
class NextStep {
  iconName: string = 'laptop';
  title: string = '';
  text: string = '';
  buttonLabel: string = '';
  buttonAction: (() => void) | null = null;
  isBusy: boolean = false;
}

function nextStep(): NextStep {
  const step = new NextStep();
  const status = appState.status;
  if (appState.network.managed && !appState.network.isConnected()) {
    step.iconName = 'wifi-off';
    step.title = 'Connect to a network';
    step.text = 'Join a Wi-Fi network so your computer can reach this Pi.';
    step.buttonLabel = 'Wi-Fi';
    step.buttonAction = () => openSettings(SECTION_WIFI);
  } else if (!status.agentOn) {
    step.title = 'Send apps from your computer';
    step.text = 'Turn on remote access, then pair your computer with the code shown here.';
    step.buttonLabel = appState.busyAction === 'agent' ? 'Turning on…' : 'Turn on';
    step.buttonAction = () => setAgentEnabled(true);
    step.isBusy = appState.busyAction === 'agent';
  } else if (appState.pairing.pairedComputers > 0) {
    step.title = 'Ready for your apps';
    step.text = 'In your project, run: zinc dev --device ' + deviceName();
    step.buttonLabel = appState.busyAction === 'pair' ? 'Opening…' : 'Pair another';
    step.buttonAction = openPairing;
    step.isBusy = appState.busyAction === 'pair';
  } else {
    step.title = 'Pair your computer';
    step.text = 'Show a code, then type it on your computer to send it your apps.';
    step.buttonLabel = appState.busyAction === 'pair' ? 'Opening…' : 'Show a code';
    step.buttonAction = openPairing;
    step.isBusy = appState.busyAction === 'pair';
  }
  return step;
}

function isAnimationRunning(): boolean {
  return appState.config.animation && !appState.form.isOpen && appState.inputIdleSeconds < ANIMATION_PAUSE_AFTER_IDLE_SECONDS;
}

export class HomePageNode extends DisplayObject {
  private animation: AmbientAnimation = new AmbientAnimation();

  constructor() {
    super('HomePage');
  }

  override onAddedToStage(): void {
    refreshSystem();
  }

  override onUpdate(deltaSeconds: number): void {
    if (isAnimationRunning() && this.animation.step(deltaSeconds)) uiState.dirty = true;
  }

  override onDraw(pageWidth: number, pageHeight: number): void {
    const theme = BACKGROUND_THEMES[appState.config.backgroundTheme];
    gradient(0, 0, pageWidth, pageHeight, 0, theme.topColor, theme.bottomColor, true, 255);
    if (appState.config.animation) this.animation.draw(pageWidth, pageHeight, theme.topColor);

    const contentWidth = Math.min(HOME_CONTENT_MAX_WIDTH, pageWidth - PAGE_PADDING * 2);
    const contentX = Math.round((pageWidth - contentWidth) / 2);
    const hasCode = appState.status.agentOn && appState.pairing.code !== '';
    const step = nextStep();
    const isTiny = pageHeight < TINY_HEIGHT;
    const cardHeight = isTiny ? 0 : hasCode ? this.pairingCardHeight(contentWidth) : this.stepCardHeight(step, contentWidth);
    const hasApps = appState.apps.length > 0;
    const messageHeight = hasApps && appState.message !== '' ? 26 : 0;
    const tileRows = this.tileRows(contentWidth, pageHeight);
    const topHeight = hasApps ? BUTTON_HEIGHT + APPS_ROW_TOP + tileRows * APP_TILE_HEIGHT + (tileRows - 1) * APP_ROW_GAP + messageHeight
      : lineHeight(Fonts.hero) + 4 + lineHeight(Fonts.title) + 6 + TEXT_LINE_HEIGHT;
    const blockHeight = topHeight + 22 + cardHeight + (appState.isAppInstalled ? 18 + BUTTON_HEIGHT : 0);
    const isNarrow = pageWidth < NARROW_WIDTH;
    const footerHeight = isTiny ? 0 : isNarrow ? 52 : 36;
    let cursorY = Math.round(Math.max(TOP_BAR_HEIGHT + 8, TOP_BAR_HEIGHT + (pageHeight - TOP_BAR_HEIGHT - footerHeight - blockHeight) / 2));

    if (hasApps) {
      this.drawApps(contentX, cursorY, contentWidth, pageHeight);
      cursorY += topHeight - messageHeight;
      if (messageHeight > 0) drawMessage(contentX, cursorY + 4, contentWidth, appState.message, appState.isMessageError);
      cursorY += messageHeight + 22;
    } else {
      drawLabel(Fonts.hero, contentX, cursorY, 'Hello!', COLOR_WHITE, contentWidth);
      cursorY += lineHeight(Fonts.hero) + 4;
      drawLabel(Fonts.title, contentX, cursorY, 'This Raspberry Pi runs Zinc.', COLOR_WHITE, contentWidth);
      cursorY += lineHeight(Fonts.title) + 6;
      drawLabel(Fonts.body, contentX, cursorY, 'Make an app on your computer and try it here.', COLOR_WHITE, contentWidth, 220);
      cursorY += TEXT_LINE_HEIGHT + 22;
    }

    if (isTiny) return;   // a screen this small has room for the tiles only
    rrect(contentX, cursorY, contentWidth, cardHeight, CORNER_RADIUS + 4, COLOR_WHITE, 40);
    if (hasCode) this.drawPairingCard(contentX, cursorY, contentWidth);
    else this.drawStepCard(step, contentX, cursorY, contentWidth);
    cursorY += cardHeight;

    if (appState.isAppInstalled) {
      cursorY += 18;
      drawButton('home/start', contentX, cursorY, 0, 'Start the app', 'play', BUTTON_LIGHT, startApp);
    }

    const interfaces = appState.network.interfaces;
    const hostname = appState.status.hostname;
    let footer = hostname.endsWith('.local') ? hostname : hostname + '.local';
    for (let index = 0; index < interfaces.length; index++) {
      if (interfaces[index].address !== '') footer += '   ·   ' + interfaces[index].address;
    }
    // on the right: what the boot is doing while it starts, and the engine's version
    const status = appState.status;
    const version = 'Zinc ' + zincVersion;
    const right = status.isStarting() && status.activity !== '' ? 'Starting: ' + status.activity + '   ·   ' + version : version;
    const footerY = pageHeight - footerHeight + 8;
    if (isNarrow) {   // two lines: the address, then the engine
      drawLabel(Fonts.small, PAGE_PADDING, footerY, footer, COLOR_WHITE, pageWidth - PAGE_PADDING * 2, 200);
      drawLabel(Fonts.small, PAGE_PADDING, footerY + 20, right, COLOR_WHITE, pageWidth - PAGE_PADDING * 2, 200);
    } else {
      const rightWidth = Math.min(textWidth(Fonts.small, right, 0), (pageWidth - PAGE_PADDING * 2) / 2);
      drawLabel(Fonts.small, pageWidth - PAGE_PADDING - rightWidth, footerY, right, COLOR_WHITE, rightWidth, 200);
      drawLabel(Fonts.small, PAGE_PADDING, footerY, footer, COLOR_WHITE, pageWidth - PAGE_PADDING * 2 - rightWidth - 24, 200);
    }
  }

  /** "Your apps", Edit, and the last apps sent in a row of tiles (newest first), with a + past six. */
  private drawApps(x: number, y: number, width: number, pageHeight: number): void {
    const apps = appState.apps;
    drawLabel(Fonts.title, x, y + (BUTTON_HEIGHT - lineHeight(Fonts.title)) / 2, 'Your apps', COLOR_WHITE, width / 2);
    const editLabel = appState.isEditingApps ? 'Done' : 'Edit';
    const editIcon = appState.isEditingApps ? 'check' : 'pencil';
    const editWidth = measureButton(editLabel, editIcon);
    drawButton('home/edit-apps', x + width - editWidth, y, editWidth, editLabel, editIcon, BUTTON_GLASS, toggleEditingApps);
    const rowY = y + BUTTON_HEIGHT + APPS_ROW_TOP;
    const columns = this.tileColumns(width);
    const slotWidth = (width - APP_SLOT_GAP * (columns - 1)) / columns;
    const slots = this.tileSlots(width, pageHeight);
    const hasMore = apps.length > slots - 1 || apps.length > HOME_APPS_SHOWN;
    const shown = hasMore ? slots - 1 : apps.length;
    for (let index = 0; index < shown; index++) {
      drawAppTile(apps[index], x + (index % columns) * (slotWidth + APP_SLOT_GAP), rowY + Math.floor(index / columns) * (APP_TILE_HEIGHT + APP_ROW_GAP), slotWidth);
    }
    if (hasMore) drawMoreTile(x + (shown % columns) * (slotWidth + APP_SLOT_GAP), rowY + Math.floor(shown / columns) * (APP_TILE_HEIGHT + APP_ROW_GAP), slotWidth, openAllApps);
  }

  /** The tile columns the width allows: all seven in one row on a wide screen, fewer (at least two) on a narrow one. */
  private tileColumns(width: number): number {
    return Math.max(2, Math.min(APP_SLOTS, Math.floor((width + APP_SLOT_GAP) / (APP_SLOT_MIN + APP_SLOT_GAP))));
  }

  /** The tiles shown, the + among them: every one of them while the rows fit the height, else one row only. */
  private tileSlots(width: number, pageHeight: number): number {
    const columns = this.tileColumns(width);
    return pageHeight < 400 ? Math.min(APP_SLOTS, columns) : APP_SLOTS;
  }

  private tileRows(width: number, pageHeight: number): number {
    if (appState.apps.length === 0) return 1;
    const slots = this.tileSlots(width, pageHeight);
    const count = appState.apps.length > slots - 1 || appState.apps.length > HOME_APPS_SHOWN ? slots : appState.apps.length;
    return Math.max(1, Math.ceil(count / this.tileColumns(width)));
  }

  /** On a narrow card the button goes under the text, the text gets the whole width. */
  private stepCardHeight(step: NextStep, contentWidth: number): number {
    if (contentWidth < NARROW_CARD_WIDTH) {
      const textWidthFull = contentWidth - CARD_PADDING * 2 - CARD_ICON_SIZE - 14;
      return CARD_PADDING * 2 + 26 + countWrappedLines(Fonts.label, step.text, textWidthFull, 4) * TEXT_LINE_HEIGHT + (step.buttonAction !== null ? 12 + BUTTON_HEIGHT : 0);
    }
    const textWidthLeft = contentWidth - CARD_PADDING * 3 - CARD_ICON_SIZE - 14 - measureButton(step.buttonLabel, '');
    return CARD_PADDING * 2 + Math.max(BUTTON_HEIGHT, 26 + countWrappedLines(Fonts.label, step.text, textWidthLeft, 3) * TEXT_LINE_HEIGHT);
  }

  private drawStepCard(step: NextStep, x: number, y: number, width: number): void {
    const buttonWidth = measureButton(step.buttonLabel, '');
    const textX = x + CARD_PADDING + CARD_ICON_SIZE + 14;
    const isNarrow = width < NARROW_CARD_WIDTH;
    const textWidthLeft = isNarrow ? width - CARD_PADDING * 2 - CARD_ICON_SIZE - 14 : width - CARD_PADDING * 3 - CARD_ICON_SIZE - 14 - buttonWidth;
    const cardHeight = this.stepCardHeight(step, width);
    drawGlyph(step.iconName, x + CARD_PADDING, y + CARD_PADDING + 2, CARD_ICON_SIZE, COLOR_WHITE);
    drawLabel(Fonts.bodyBold, textX, y + CARD_PADDING, step.title, COLOR_WHITE, textWidthLeft);
    drawWrappedText(Fonts.label, textX, y + CARD_PADDING + 26, step.text, COLOR_WHITE, textWidthLeft, isNarrow ? 4 : 3, TEXT_LINE_HEIGHT, 225);
    if (step.buttonAction !== null) {
      drawButton('home/step', isNarrow ? x + CARD_PADDING : x + width - CARD_PADDING - buttonWidth,
        isNarrow ? y + cardHeight - CARD_PADDING - BUTTON_HEIGHT : y + (cardHeight - BUTTON_HEIGHT) / 2, buttonWidth,
        step.buttonLabel, '', BUTTON_LIGHT, step.buttonAction as () => void, !step.isBusy);
    }
  }

  /** Narrow: the command goes under the code instead of beside it. */
  private pairingCardHeight(width: number): number {
    return CARD_PADDING * 2 + 22 + 8 + CODE_BOX_HEIGHT + 10 + 20 + (width < NARROW_CARD_WIDTH ? PAIRING_STACK : 0);
  }

  /** The code, big, and the command to type on the computer. */
  private drawPairingCard(x: number, y: number, width: number): void {
    const code = appState.pairing.code;
    const codeColumnWidth = Math.max(170, textWidth(Fonts.pairingCode, code, 2) + 12);
    drawLabel(Fonts.small, x + CARD_PADDING, y + CARD_PADDING, 'Pairing code', COLOR_WHITE, codeColumnWidth, 220);
    drawLabel(Fonts.pairingCode, x + CARD_PADDING, y + CARD_PADDING + 24, code, COLOR_WHITE, codeColumnWidth);

    const isStacked = width < NARROW_CARD_WIDTH;
    const commandX = isStacked ? x + CARD_PADDING : x + CARD_PADDING + codeColumnWidth + 12;
    const commandWidth = width - (commandX - x) - CARD_PADDING;
    const commandY = isStacked ? y + CARD_PADDING + PAIRING_STACK : y + CARD_PADDING;
    drawLabel(Fonts.bodyBold, commandX, commandY, 'On your computer, run:', COLOR_WHITE, commandWidth);
    const boxY = commandY + 30;
    rrect(commandX, boxY, commandWidth, CODE_BOX_HEIGHT, 10, 0x000000, 70);
    drawLabel(Fonts.code, commandX + 12, boxY + (CODE_BOX_HEIGHT - lineHeight(Fonts.code)) / 2,
      'zinc device pair ' + deviceName() + ' ' + code, COLOR_WHITE, commandWidth - 24);
    drawLabel(Fonts.small, commandX, boxY + CODE_BOX_HEIGHT + 10, 'The code works once, for 5 minutes.', COLOR_WHITE, commandWidth, 200);
  }
}
