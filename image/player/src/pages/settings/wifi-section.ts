// ============================================================================
// pages/settings/wifi-section.ts — Wi-Fi: the network joined, the networks around, the country
// ============================================================================
// A tap on a network joins it (the form asks for the password of a secured one); the one joined can be forgotten.

import { rrect } from 'zinc:gfx';
import { BUTTON_HEIGHT, COLOR_SUCCESS, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, ROW_HEIGHT } from '../../constants';
import { Fonts } from '../../fonts';
import { DisplayObject } from '../../core/display';
import { ScrollBox, beginScrollBox, endScrollBox, isLocalRectVisible } from '../../core/input';
import { NOT_MANAGED, WifiNetwork } from 'zinc:network';
import { appState, askPowerAction, cancelPowerAction, editWifiCountry, forgetNetwork, joinNetwork, restartNetwork, scanWifi } from '../../state';
import { BUTTON_SECONDARY, drawButton, measureButton } from '../../components/buttons';
import { drawGlyph, drawLabel } from '../../components/primitives';
import { drawMessage, drawSectionHeading, drawSettingRow } from '../../components/rows';

const SECTION_PADDING = 24;
const ROW_GAP = 8;

function signalIconName(signal: i32): string {
  if (signal >= 75) return 'wifi';
  if (signal >= 50) return 'wifi-high';
  if (signal >= 25) return 'wifi-low';
  return 'wifi-zero';
}

export class WifiSectionNode extends DisplayObject {
  private listScroll: ScrollBox = new ScrollBox();

  constructor() {
    super('WifiSection');
  }

  override onAddedToStage(): void {
    scanWifi(false);
  }

  override onDraw(sectionWidth: number, sectionHeight: number): void {
    const x = SECTION_PADDING;
    const width = sectionWidth - SECTION_PADDING * 2;
    let cursorY = 20;
    drawSectionHeading(x, cursorY, 'Wi-Fi');
    const isManaged = appState.network.managed;
    const isBusy = appState.isScanning || appState.busyAction !== '' || !isManaged;
    const scanWidth = measureButton('Scanning…', 'refresh-cw');
    drawButton('wifi/scan', x + width - scanWidth, cursorY - 6, scanWidth, appState.isScanning ? 'Scanning…' : 'Scan', 'refresh-cw',
      BUTTON_SECONDARY, () => scanWifi(true), !isBusy);
    const restarting = appState.pendingPowerAction === 'network';
    const restartLabel = restarting ? 'Restart now?' : 'Restart network';
    const restartWidth = measureButton(restartLabel, 'rotate-ccw');
    drawButton('wifi/restart', x + width - scanWidth - restartWidth - 10, cursorY - 6, restartWidth, restartLabel, 'rotate-ccw',
      BUTTON_SECONDARY, restarting ? restartNetwork : () => askPowerAction('network'), appState.busyAction === '' && !appState.updates.isBusy());
    cursorY += 60;
    if (restarting) {
      const cancelWidth = measureButton('Cancel', '');
      drawLabel(Fonts.small, x, cursorY - 8, 'This can disconnect remote sessions.', COLOR_TEXT_SECONDARY, width - cancelWidth - 12);
      drawButton('wifi/restart-cancel', x + width - cancelWidth, cursorY - 18, cancelWidth, 'Cancel', '', BUTTON_SECONDARY, cancelPowerAction);
      cursorY += 34;
    }

    const status = appState.status;
    const wifiNetwork = appState.network.wifiNetwork;
    const isConnected = wifiNetwork !== '';
    rrect(x, cursorY + 7, 10, 10, 5, isConnected ? COLOR_SUCCESS : COLOR_TEXT_SECONDARY, 255);
    const countryLabel = status.wifiCountry === '' ? 'Set the country' : 'Country: ' + status.wifiCountry;
    const countryWidth = measureButton(countryLabel, '');
    drawLabel(Fonts.label, x + 20, cursorY + 1, isConnected ? 'Connected to ' + wifiNetwork : 'Not connected to a Wi-Fi network',
      COLOR_TEXT_PRIMARY, width - countryWidth - 32);
    drawButton('wifi/country', x + width - countryWidth, cursorY - (BUTTON_HEIGHT - 24) / 2, countryWidth, countryLabel, '',
      BUTTON_SECONDARY, editWifiCountry, appState.busyAction === '');
    cursorY += 44;
    cursorY += drawMessage(x, cursorY, width, appState.message, appState.isMessageError);

    const listHeight = sectionHeight - cursorY - 12;
    const networks = appState.networks;
    if (!isManaged || networks.length === 0) {
      const empty = isManaged ? (appState.hasScanned ? 'No network found. Scan again in a moment.' : 'Looking for networks…') :
        status.isStarting() ? 'The network is starting with the system…' : NOT_MANAGED;
      drawLabel(Fonts.label, x, cursorY + 12, empty, COLOR_TEXT_SECONDARY, width);
      return;
    }
    const scroll = this.listScroll;
    scroll.contentHeight = networks.length * (ROW_HEIGHT + ROW_GAP);
    scroll.clamp();
    beginScrollBox(scroll, x - 4, cursorY, width + 8, listHeight);
    for (let index = 0; index < networks.length; index++) {
      const rowY = cursorY + index * (ROW_HEIGHT + ROW_GAP) - scroll.scrollY;
      if (!isLocalRectVisible(x, rowY, width, ROW_HEIGHT)) continue;
      this.drawNetworkRow(networks[index], x, rowY, width);
    }
    endScrollBox();
  }

  private drawNetworkRow(network: WifiNetwork, x: number, y: number, width: number): void {
    const isJoining = appState.busyAction === 'wifi/' + network.ssid;
    const subtitle = network.inUse ? 'Connected' : isJoining ? 'Joining…' : network.secured ? 'Secured' : 'Open';
    const forgetWidth = network.inUse ? measureButton('Forget', '') : 0;
    const controlWidth = 64 + (forgetWidth > 0 ? forgetWidth + 12 : 0);
    const onTap = network.inUse || appState.busyAction !== '' ? null : () => joinNetwork(network);
    drawSettingRow('wifi/' + network.ssid, x, y, width, network.ssid, subtitle, controlWidth, onTap);
    let iconX = x + width - 16 - 22;
    if (network.inUse) {
      drawButton('wifi/forget', x + width - 12 - forgetWidth, y + (ROW_HEIGHT - BUTTON_HEIGHT) / 2, forgetWidth, 'Forget', '',
        BUTTON_SECONDARY, () => forgetNetwork(network.ssid), appState.busyAction === '');
      iconX -= forgetWidth + 12;
    }
    drawGlyph(signalIconName(network.signal), iconX, y + (ROW_HEIGHT - 22) / 2, 22, COLOR_TEXT_PRIMARY);
    if (network.secured) drawGlyph('lock', iconX - 26, y + (ROW_HEIGHT - 18) / 2, 18, COLOR_TEXT_SECONDARY);
  }
}
