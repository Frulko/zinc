// Status bar (flipctl-slint statusbar.slint). Inverted by default; `light` gives the Desktop override.
import { rect } from 'zinc:gfx';
import { W, STATUS_BAR_H, STATUS_PAD_TOP, BLACK, WHITE } from './theme';
import { TITLE, text, tw, icon, bolt } from './panel';
import { status } from './state';

export function drawStatusBar(light: boolean): void {
  const ground: u32 = light ? 0xeeeeee : BLACK;
  const ink: u32 = light ? BLACK : WHITE;
  const top = STATUS_PAD_TOP;
  rect(0, 0, W, STATUS_BAR_H, ground);

  const techW = status.modem ? tw(TITLE, status.tech) : 0;
  const modemW = status.modem ? 10 + techW + 2 : 0;
  const wifiX = 2 + modemW;
  const ethX = wifiX + (status.wifi ? 9 : 0);
  const recX = ethX + (status.ethernet !== 0 ? 15 : 0);

  if (status.modem) {
    const lit = Math.ceil(status.modemQuality / 20);
    for (let i = 0; i < 5; i++) {
      const bh = 3 + i;
      rect(2 + i * 2, top + 7 - bh, 1, bh, i < lit ? ink : ground);
    }
    text(TITLE, 2 + 10, top, status.tech, ink);
  }
  if (status.wifi) {
    const q = status.wifiQuality;
    icon(q >= 80 ? 'wifi_100' : q >= 60 ? 'wifi_75' : q >= 40 ? 'wifi_50' : q >= 20 ? 'wifi_25' : 'wifi_0', wifiX, top, 7, 7, ink);
  }
  if (status.ethernet !== 0) icon(status.ethernet === 2 ? 'usb_ethetrnet_status_bar' : 'ethernet_statusbar', ethX, top, 13, 7, ink);
  if (status.recording) icon('records_status_bar', recX, top, 7, 7, ink);

  if (status.battery >= 0) {
    const bx = W - 2 - 16;
    const label = status.battery + '%';
    text(TITLE, bx - 1 - tw(TITLE, label), top - 2, label, ink);
    icon('battery_statusbar', bx, top - 1, 16, 9, ink);
    rect(bx + 2, top + 1, Math.round(10 * Math.max(0, status.battery) / 100), 5, ink);
    if (status.charging) bolt(bx, top - 1);
  }
}
