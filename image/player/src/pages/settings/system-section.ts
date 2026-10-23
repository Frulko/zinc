// ============================================================================
// pages/settings/system-section.ts — The machine, and restart or shut down
// ============================================================================
// Restart and Shut down ask for a second press: the button becomes "Restart now", with Cancel beside it.

import { DisplayObject } from '../../core/display';
import { appState, askPowerAction, cancelPowerAction, confirmPowerAction, zincVersion } from '../../state';
import { BUTTON_DANGER, BUTTON_SECONDARY, drawButton, measureButton } from '../../components/buttons';
import { drawMessage, drawSectionHeading, drawValueLine } from '../../components/rows';

const SECTION_PADDING = 24;

function formatUptime(minutes: i32): string {
  if (minutes < 60) return minutes + ' min';
  const hours = Math.floor(minutes / 60) as i32;
  if (hours < 48) return hours + ' h ' + (minutes % 60) + ' min';
  return Math.floor(hours / 24) + ' days ' + (hours % 24) + ' h';
}

function formatMebibytes(mebibytes: i32): string {
  if (mebibytes < 1024) return mebibytes + ' MB';
  return Math.round((mebibytes / 1024) * 10) / 10 + ' GB';
}

/** "eth0 192.168.2.40   ·   wlan0 192.168.2.41". */
function addressesText(): string {
  const parts: string[] = [];
  for (const nic of appState.network.interfaces) if (nic.address !== '') parts.push(nic.name + ' ' + nic.address);
  return parts.join('   ·   ');
}

export class SystemSectionNode extends DisplayObject {
  constructor() {
    super('SystemSection');
  }

  override onDraw(sectionWidth: number, sectionHeight: number): void {
    const x = SECTION_PADDING;
    const width = sectionWidth - SECTION_PADDING * 2;
    let cursorY = 20;
    drawSectionHeading(x, cursorY, 'System');
    this.drawPowerButtons(x + width, cursorY - 6);
    cursorY += 56;

    const status = appState.status;
    cursorY += drawValueLine(x, cursorY, width, 'Model', status.model);
    cursorY += drawValueLine(x, cursorY, width, 'System', status.osName);
    cursorY += drawValueLine(x, cursorY, width, 'Kernel', status.kernel);
    cursorY += drawValueLine(x, cursorY, width, 'Zinc', zincVersion);
    cursorY += drawValueLine(x, cursorY, width, 'Up for', formatUptime(status.uptimeMinutes));
    cursorY += drawValueLine(x, cursorY, width, 'Temperature', status.temperature < 0 ? '' : status.temperature + ' °C');
    cursorY += drawValueLine(x, cursorY, width, 'Memory',
      status.memoryTotalMiB === 0 ? '' : formatMebibytes(status.memoryAvailableMiB) + ' free of ' + formatMebibytes(status.memoryTotalMiB));
    cursorY += drawValueLine(x, cursorY, width, 'Storage',
      status.diskTotalMiB === 0 ? '' : formatMebibytes(status.diskFreeMiB) + ' free of ' + formatMebibytes(status.diskTotalMiB));
    cursorY += drawValueLine(x, cursorY, width, 'Addresses', addressesText());
    cursorY += 10;
    drawMessage(x, cursorY, width, appState.message, appState.isMessageError);
  }

  /** Restart and Shut down, right-aligned at `rightX`; the one pressed asks again. */
  private drawPowerButtons(rightX: number, y: number): void {
    const pending = appState.pendingPowerAction;
    const isEnabled = appState.busyAction === '';
    if (pending !== '') {
      const confirmLabel = pending === 'reboot' ? 'Restart now' : 'Shut down now';
      const confirmWidth = measureButton(confirmLabel, 'power');
      drawButton('system/confirm', rightX - confirmWidth, y, confirmWidth, confirmLabel, 'power', BUTTON_DANGER, confirmPowerAction, isEnabled);
      const cancelWidth = measureButton('Cancel', '');
      drawButton('system/cancel', rightX - confirmWidth - 10 - cancelWidth, y, cancelWidth, 'Cancel', '', BUTTON_SECONDARY, cancelPowerAction);
      return;
    }
    const shutdownWidth = measureButton('Shut down', 'power');
    drawButton('system/poweroff', rightX - shutdownWidth, y, shutdownWidth, 'Shut down', 'power', BUTTON_SECONDARY,
      () => askPowerAction('poweroff'), isEnabled);
    const restartWidth = measureButton('Restart', 'rotate-ccw');
    drawButton('system/reboot', rightX - shutdownWidth - 10 - restartWidth, y, restartWidth, 'Restart', 'rotate-ccw', BUTTON_SECONDARY,
      () => askPowerAction('reboot'), isEnabled);
  }
}
