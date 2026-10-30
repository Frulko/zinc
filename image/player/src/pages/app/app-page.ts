// ============================================================================
// pages/app/app-page.ts — The app the shell shows, below the bar
// ============================================================================
// The app draws into buffers zinc:shell gives it; its surface is one runtime image, drawn here whole. A press below
// the bar never reaches the player: zinc:shell forwards it to the app.

import { drawImage, rect } from 'zinc:gfx';
import * as shell from 'zinc:shell';
import { DisplayObject } from '../../core/display';

export class AppPageNode extends DisplayObject {
  constructor() {
    super('AppPage');
  }

  override onDraw(pageWidth: number, pageHeight: number): void {
    const bar = shell.barHeight();
    rect(0, bar, pageWidth, pageHeight - bar, 0xff000000);
    const surface = shell.image();
    if (surface >= 0) drawImage(surface, 0, bar, pageWidth, pageHeight - bar, 255, 0);
  }
}
