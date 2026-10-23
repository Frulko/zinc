import { COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, ROW_HEIGHT } from '../../constants';
import { Fonts } from '../../fonts';
import { DisplayObject } from '../../core/display';
import { ScrollBox, beginScrollBox, endScrollBox, isLocalRectVisible } from '../../core/input';
import { appState, askUpdate, checkUpdates, installUpdate, refreshUpdates, selectUpdateVersion } from '../../state';
import { BUTTON_PRIMARY, BUTTON_SECONDARY, drawButton, measureButton } from '../../components/buttons';
import { drawLabel } from '../../components/primitives';
import { drawMessage, drawSectionHeading, drawSettingRow } from '../../components/rows';

export class UpdatesSectionNode extends DisplayObject {
  private scroll: ScrollBox = new ScrollBox();

  constructor() { super('UpdatesSection'); }

  override onAddedToStage(): void {
    refreshUpdates();
    if (!appState.updates.checked) checkUpdates();
  }

  override onDraw(sectionWidth: number, sectionHeight: number): void {
    const x = 24;
    const width = sectionWidth - 48;
    const updates = appState.updates;
    const busy = updates.isBusy();
    drawSectionHeading(x, 20, 'Updates');
    const checkWidth = measureButton('Check again', 'refresh-cw');
    drawButton('updates/check', x + width - checkWidth, 14, checkWidth, updates.checking ? 'Checking…' : 'Check again',
      'refresh-cw', BUTTON_SECONDARY, checkUpdates, !updates.checking && !busy);
    drawLabel(Fonts.label, x, 70, 'Installed: Zinc ' + updates.current + '  ·  ' + updates.architecture, COLOR_TEXT_PRIMARY, width);
    drawLabel(Fonts.small, x, 98, 'The same player is rebuilt and tested before switching engines.', COLOR_TEXT_SECONDARY, width);
    let y = 128;
    if (updates.error !== '') y += drawMessage(x, y, width, updates.error, true);
    if (updates.message !== '') y += drawMessage(x, y, width, updates.message, updates.phase === 'error');
    if (updates.pending !== '') {
      const target = updates.pending === 'rollback' ? updates.previous : updates.pending;
      drawLabel(Fonts.labelBold, x, y, 'Switch to Zinc ' + target + '?', COLOR_TEXT_PRIMARY, width);
      drawLabel(Fonts.small, x, y + 26, 'The player and remote apps restart. Newer apps may need a newer engine.', COLOR_TEXT_SECONDARY, width);
      drawButton('updates/confirm', x, y + 58, 150, 'Install now', 'download', BUTTON_PRIMARY, installUpdate, !busy);
      drawButton('updates/cancel', x + 162, y + 58, 110, 'Cancel', '', BUTTON_SECONDARY, () => askUpdate(''));
      return;
    }
    if (busy) return;
    const selected = updates.selected;
    drawButton('updates/install', x, y, 178, selected === updates.current ? 'Installed' : 'Install ' + selected, 'download',
      BUTTON_PRIMARY, () => askUpdate(selected), selected !== '' && selected !== updates.current);
    if (updates.previous !== '') drawButton('updates/rollback', x + 190, y, width - 190, 'Restore ' + updates.previous, 'rotate-ccw',
      BUTTON_SECONDARY, () => askUpdate('rollback'));
    y += 58;
    if (updates.versions.length === 0) {
      drawLabel(Fonts.label, x, y, updates.checking ? 'Looking for compatible versions…' : 'No compatible download found. Try checking again.',
        COLOR_TEXT_SECONDARY, width);
      return;
    }
    const scroll = this.scroll;
    scroll.contentHeight = updates.versions.length * (ROW_HEIGHT + 8);
    scroll.clamp();
    beginScrollBox(scroll, x - 4, y, width + 8, Math.max(40, sectionHeight - y - 12));
    for (let i = 0; i < updates.versions.length; i++) {
      const value = updates.versions[i];
      const rowY = y + i * (ROW_HEIGHT + 8) - scroll.scrollY;
      if (!isLocalRectVisible(x, rowY, width, ROW_HEIGHT)) continue;
      const detail = value === updates.current ? 'Installed' : value === updates.latest ? 'Latest available' : 'Previous release';
      drawSettingRow('updates/version/' + value, x, rowY, width, (value === selected ? '✓  ' : '') + 'Zinc ' + value,
        detail, 0, () => selectUpdateVersion(value));
    }
    endScrollBox();
  }
}
