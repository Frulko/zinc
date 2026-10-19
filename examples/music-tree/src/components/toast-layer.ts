// ============================================================================
// components/toast-layer.ts — Ephemeral message banner (Toast)
// ============================================================================

import { rrect, textWidth } from 'zinc:gfx';
import { COLOR_FILL, COLOR_TEXT_PRIMARY } from '../constants';
import { Fonts } from '../fonts';
import { DisplayObject } from '../core/display';
import { uiState } from '../core/input';
import { drawCardShadow, drawLabel } from './primitives';
import { appState } from '../state';

export class ToastLayerNode extends DisplayObject {
  constructor() {
    super('ToastLayer');
  }

  override onUpdate(deltaSeconds: number): void {
    if (appState.toastRemainingSeconds > 0) {
      appState.toastRemainingSeconds -= deltaSeconds;
      if (appState.toastRemainingSeconds <= 0) {
        uiState.dirty = true;
      }
    }
  }

  override onDraw(stageWidth: number, stageHeight: number): void {
    if (appState.toastRemainingSeconds <= 0 || appState.toastMessage === '') return;

    const pillWidth = Math.min(
      stageWidth - appState.sidebarWidth - 80,
      textWidth(Fonts.small, appState.toastMessage, 0) + 44
    );
    const pillX =
      appState.sidebarWidth + (stageWidth - appState.sidebarWidth - pillWidth) / 2;
    const pillY = stageHeight - 74;

    drawCardShadow(pillX, pillY, pillWidth, 46, 23);
    rrect(pillX, pillY, pillWidth, 46, 23, COLOR_FILL, 245);
    drawLabel(
      Fonts.small,
      pillX + 22,
      pillY + 13,
      appState.toastMessage,
      COLOR_TEXT_PRIMARY,
      pillWidth - 44
    );
  }
}
