// ============================================================================
// pages/apps/apps-page.ts — The launcher: every app sent to the device
// ============================================================================
// The + of the home page opens it when more apps were sent than the home shows. The same tiles, newest first, in a
// grid that scrolls; Edit shows the buttons that delete them. Back (or Escape) returns home.

import { gradient, lineHeight } from 'zinc:gfx';
import { BACKGROUND_THEMES, BUTTON_HEIGHT, COLOR_WHITE, HOME_CONTENT_MAX_WIDTH, PAGE_PADDING, TOP_BAR_HEIGHT } from '../../constants';
import { Fonts } from '../../fonts';
import { DisplayObject } from '../../core/display';
import { ScrollBox, beginScrollBox, endScrollBox } from '../../core/input';
import { appState, refreshSystem, toggleEditingApps } from '../../state';
import { BUTTON_GLASS, drawButton, measureButton } from '../../components/buttons';
import { APP_TILE_HEIGHT, drawAppTile } from '../../components/app-tiles';
import { drawLabel } from '../../components/primitives';
import { drawMessage } from '../../components/rows';

const SLOT_WIDTH = 84;
const SLOT_GAP = 10;
const ROW_GAP = 18;
/** Room above the first row for the delete buttons that stick out of the tiles. */
const GRID_TOP = 14;

export class AppsPageNode extends DisplayObject {
  private scroll: ScrollBox = new ScrollBox();

  constructor() {
    super('AppsPage');
  }

  override onAddedToStage(): void {
    this.scroll.scrollY = 0;
    refreshSystem();
  }

  override onDraw(pageWidth: number, pageHeight: number): void {
    const theme = BACKGROUND_THEMES[appState.config.backgroundTheme];
    gradient(0, 0, pageWidth, pageHeight, 0, theme.topColor, theme.bottomColor, true, 255);

    const apps = appState.apps;
    const contentWidth = Math.min(HOME_CONTENT_MAX_WIDTH + 80, pageWidth - PAGE_PADDING * 2);
    const contentX = Math.round((pageWidth - contentWidth) / 2);
    let cursorY = TOP_BAR_HEIGHT + 8;
    const countText = apps.length === 1 ? '1 app on this device' : apps.length + ' apps on this device';
    drawLabel(Fonts.bodyBold, contentX, cursorY + (BUTTON_HEIGHT - lineHeight(Fonts.bodyBold)) / 2, countText, COLOR_WHITE, contentWidth / 2);
    const editLabel = appState.isEditingApps ? 'Done' : 'Edit';
    const editIcon = appState.isEditingApps ? 'check' : 'pencil';
    const editWidth = measureButton(editLabel, editIcon);
    if (apps.length > 0) drawButton('apps/edit', contentX + contentWidth - editWidth, cursorY, editWidth, editLabel, editIcon, BUTTON_GLASS, toggleEditingApps);
    cursorY += BUTTON_HEIGHT + 4;
    cursorY += drawMessage(contentX, cursorY, contentWidth, appState.message, appState.isMessageError);

    // the grid, centred: as many columns as fit
    const columns = Math.max(1, Math.floor((contentWidth + SLOT_GAP) / (SLOT_WIDTH + SLOT_GAP)));
    const gridWidth = columns * SLOT_WIDTH + (columns - 1) * SLOT_GAP;
    const gridX = contentX + (contentWidth - gridWidth) / 2;
    const rows = Math.ceil(apps.length / columns);
    const viewportHeight = pageHeight - cursorY;
    beginScrollBox(this.scroll, 0, cursorY, pageWidth, viewportHeight);
    this.scroll.contentHeight = GRID_TOP + rows * (APP_TILE_HEIGHT + ROW_GAP);
    this.scroll.clamp();
    const top = cursorY + GRID_TOP - this.scroll.scrollY;
    for (let index = 0; index < apps.length; index++) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const tileY = top + row * (APP_TILE_HEIGHT + ROW_GAP);
      if (tileY + APP_TILE_HEIGHT < cursorY - GRID_TOP || tileY > pageHeight) continue;
      drawAppTile(apps[index], gridX + column * (SLOT_WIDTH + SLOT_GAP), tileY, SLOT_WIDTH);
    }
    endScrollBox();
  }
}
