// ============================================================================
// pages/app/app-page.ts — The app the shell shows, below the bar
// ============================================================================
// The app draws into buffers zinc:shell gives it; its surface is one runtime image, drawn here whole. A press below
// the bar never reaches the player: zinc:shell forwards it to the app.
// Until the app has presented its first frame (shell.image() is -1) the black area says it is starting: its icon, its
// name and a spinner, and after a while that it is slow (a Pi 3 can take 25 s). The spinner steps 12 times a second and
// nothing runs once the first frame is there.

import { drawImage, rect, rrect } from 'zinc:gfx';
import * as shell from 'zinc:shell';
import * as sys from 'zinc:sys';
import { COLOR_TEXT_SECONDARY, COLOR_WHITE } from '../../constants';
import { Fonts } from '../../fonts';
import { DisplayObject } from '../../core/display';
import { uiState } from '../../core/input';
import { appIconImage } from '../../services/apps';
import { drawCenteredText, drawGlyph } from '../../components/primitives';
import { appState } from '../../state';

const ICON_SIZE = 72;
const ICON_RADIUS = 18;
const SPINNER_DOTS = 12;
const SPINNER_STEPS_PER_SECOND = 12;
const SPINNER_RADIUS = 16;
/** Seconds without a first frame before the second line (ZINC_PLAYER_SLOW_START_SECONDS: a test). */
const SLOW_START_SECONDS = sys.env('ZINC_PLAYER_SLOW_START_SECONDS') !== '' ? parseFloat(sys.env('ZINC_PLAYER_SLOW_START_SECONDS')) : 8;

export class AppPageNode extends DisplayObject {
  private waitedName: string = '';
  private waitedSeconds: number = 0;
  private stepSeconds: number = 0;
  private phase: i32 = 0;
  private wasSlow: boolean = false;

  constructor() {
    super('AppPage');
  }

  private isStarting(): boolean {
    return appState.shownAppName !== '' && shell.image() < 0;
  }

  override onUpdate(deltaSeconds: number): void {
    if (!this.isStarting()) {
      this.waitedSeconds = 0;
      this.wasSlow = false;
      return;
    }
    if (this.waitedName !== appState.shownAppName) {
      this.waitedName = appState.shownAppName;
      this.waitedSeconds = 0;
      this.wasSlow = false;
    }
    this.waitedSeconds += deltaSeconds;
    this.stepSeconds += deltaSeconds;
    const isSlow = this.waitedSeconds >= SLOW_START_SECONDS;
    if (this.stepSeconds >= 1 / SPINNER_STEPS_PER_SECOND || isSlow !== this.wasSlow) {
      this.stepSeconds = 0;
      this.phase = (this.phase + 1) % SPINNER_DOTS;
      this.wasSlow = isSlow;
      uiState.dirty = true;
    }
  }

  override onDraw(pageWidth: number, pageHeight: number): void {
    const bar = shell.barHeight();
    rect(0, bar, pageWidth, pageHeight - bar, 0xff000000);
    const surface = shell.image();
    if (surface >= 0) {
      drawImage(surface, 0, bar, pageWidth, pageHeight - bar, 255, 0);
      return;
    }
    if (appState.shownAppName === '') return;
    this.drawStarting(pageWidth / 2, bar + (pageHeight - bar) / 2);
  }

  private drawStarting(centerX: number, centerY: number): void {
    const title = appState.shownAppTitle !== '' ? appState.shownAppTitle : appState.shownAppName;
    let top = centerY - 100;
    let icon: i32 = -1;
    for (let index = 0; index < appState.apps.length; index++) {
      if (appState.apps[index].name === appState.shownAppName) icon = appIconImage(appState.apps[index]);
    }
    rrect(centerX - ICON_SIZE / 2, top, ICON_SIZE, ICON_SIZE, ICON_RADIUS, COLOR_WHITE, 28);
    if (icon >= 0) drawImage(icon, centerX - ICON_SIZE / 2, top, ICON_SIZE, ICON_SIZE, 255, ICON_RADIUS);
    else drawGlyph('app-window', centerX - 18, top + (ICON_SIZE - 36) / 2, 36, COLOR_WHITE);
    top += ICON_SIZE + 16;
    drawCenteredText(Fonts.labelBold, centerX, top, 'Starting ' + title + '…', COLOR_WHITE);
    top += 34;
    const spinnerY = top + SPINNER_RADIUS;
    for (let dot = 0; dot < SPINNER_DOTS; dot++) {
      const angle = (dot / SPINNER_DOTS) * Math.PI * 2;
      const age = (this.phase - dot + SPINNER_DOTS) % SPINNER_DOTS;
      rrect(centerX + Math.sin(angle) * SPINNER_RADIUS - 2.5, spinnerY - Math.cos(angle) * SPINNER_RADIUS - 2.5, 5, 5, 2.5,
        COLOR_WHITE, Math.max(40, 255 - age * 20));
    }
    if (this.waitedSeconds >= SLOW_START_SECONDS) {
      drawCenteredText(Fonts.small, centerX, spinnerY + SPINNER_RADIUS + 18, 'This app takes a while to start on this Raspberry Pi', COLOR_TEXT_SECONDARY);
    }
  }
}
