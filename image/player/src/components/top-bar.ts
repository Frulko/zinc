// ============================================================================
// components/top-bar.ts — The bar at the top of every page
// ============================================================================
// Home and crash pages: the Pi's name and the time, how it is connected, the settings button. Settings and the
// launcher: back, the title and the time.

import { rect, textWidth } from 'zinc:gfx';
import {
  COLOR_SEPARATOR,
  COLOR_SIDEBAR,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_WHITE,
  PAGE_APPS,
  PAGE_PADDING,
  PAGE_SETTINGS,
  SECTION_WIFI,
  SECTION_UPDATES,
} from '../constants';
import { Fonts } from '../fonts';
import { DisplayObject } from '../core/display';
import { appState, goBack, openSettings } from '../state';
import { drawIconButton } from './buttons';
import { drawGlyph, drawLabel } from './primitives';

/** The icon of the connection: Wi-Fi, a cable, or none. */
function connectionIconName(): string {
  if (appState.network.wifiNetwork !== '') return 'wifi';
  return appState.network.isConnected() ? 'ethernet-port' : 'wifi-off';
}

export class TopBarNode extends DisplayObject {
  constructor() {
    super('TopBar');
  }

  override onDraw(barWidth: number, barHeight: number): void {
    const textY = (barHeight - 22) / 2;
    const updateAvailable = appState.updates.hasUpdate();
    if (appState.page === PAGE_SETTINGS) {
      rect(0, 0, barWidth, barHeight, COLOR_SIDEBAR);
      rect(0, barHeight - 1, barWidth, 1, COLOR_SEPARATOR);
      drawIconButton('top/back', 'chevron-left', PAGE_PADDING, barHeight / 2, 24, COLOR_TEXT_PRIMARY, goBack);
      drawLabel(Fonts.heading, PAGE_PADDING + 26, textY, 'Settings', COLOR_TEXT_PRIMARY);
      drawLabel(Fonts.label, barWidth - PAGE_PADDING - textWidth(Fonts.label, appState.clockText, 0), textY + 2,
        appState.clockText, COLOR_TEXT_SECONDARY);
      if (updateAvailable) drawIconButton('top/update', 'download', barWidth - PAGE_PADDING - 90, barHeight / 2, 22,
        COLOR_TEXT_PRIMARY, () => openSettings(SECTION_UPDATES), 40);
      return;
    }
    if (appState.page === PAGE_APPS) {
      drawIconButton('top/back', 'chevron-left', PAGE_PADDING, barHeight / 2, 24, COLOR_WHITE, goBack);
      drawLabel(Fonts.heading, PAGE_PADDING + 26, textY, 'All apps', COLOR_WHITE);
      drawLabel(Fonts.label, barWidth - PAGE_PADDING - textWidth(Fonts.label, appState.clockText, 0), textY + 2,
        appState.clockText, COLOR_WHITE, 100, 200);
      return;
    }
    const name = appState.status.hostname;
    drawLabel(Fonts.labelBold, PAGE_PADDING, textY + 2, name, COLOR_WHITE, barWidth / 2);
    drawLabel(Fonts.label, PAGE_PADDING + textWidth(Fonts.labelBold, name, 0) + 12, textY + 2, appState.clockText, COLOR_WHITE, 100, 200);
    const settingsCenterX = barWidth - PAGE_PADDING - 6;
    drawIconButton('top/settings', 'settings', settingsCenterX, barHeight / 2, 24, COLOR_WHITE, () => openSettings(SECTION_WIFI), 40);
    drawGlyph(connectionIconName(), settingsCenterX - 56, barHeight / 2 - 11, 22, COLOR_WHITE, 220);
    if (updateAvailable) drawIconButton('top/update', 'download', settingsCenterX - 96, barHeight / 2, 22,
      COLOR_WHITE, () => openSettings(SECTION_UPDATES), 40);
  }
}
