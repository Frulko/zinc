// A detail page: "Label: value" rows under a breadcrumb, scrolled by Up / Down. Stand-ins for the screens behind
// Settings and Network until they are ported (flipctl-slint detail.slint); the rows are simulated.
import { rect } from 'zinc:gfx';
import { W, H, CRUMB_X, CRUMB_Y, SUB_Y, BTN_H, WHITE, BLACK, DIVIDER, FIELD_LABEL } from './theme';
import { TITLE, text, tw, drawScrollbar } from './panel';
import { drawStatusBar } from './statusbar';
import { drawSoftBar } from './softbar';
import { Screen } from './screen';
import { status } from './state';

const ROW_H: i32 = 12;
const ROWS: i32 = 8;   // (H - BTN_H - SUB_Y + 3) / ROW_H

export class Page extends Screen {
  crumb: string; rows: string[]; offset: i32 = 0;   // rows are "Label|value"; no bar: a section title
  constructor(crumb: string, rows: string[]) { super(); this.crumb = crumb; this.rows = rows; }
  move(d: i32): void {
    const max = Math.max(0, this.rows.length - ROWS);
    this.offset = Math.min(max, Math.max(0, this.offset + d));
  }
  draw(tick: i32): void {
    rect(0, 0, W, H, WHITE);
    drawStatusBar(false);
    text(TITLE, CRUMB_X, CRUMB_Y, this.crumb, DIVIDER);
    for (let i = this.offset; i < this.rows.length && i < this.offset + ROWS; i++) {
      const y = SUB_Y - 3 + (i - this.offset) * ROW_H, bar = this.rows[i].indexOf('|');
      if (bar < 0) { text(TITLE, 6, y, this.rows[i], BLACK); rect(6, y + ROW_H - 1, W - 20, 1, DIVIDER); continue; }
      const label = this.rows[i].slice(0, bar) + ':';
      text(TITLE, 6, y, label, FIELD_LABEL);
      text(TITLE, 6 + tw(TITLE, label) + 4, y, this.rows[i].slice(bar + 1), BLACK);
    }
    drawScrollbar(this.rows.length, ROWS, this.offset);
    drawSoftBar(['Back', '', '', '', ''], -1);
  }
}

/** The fake page behind a menu row. */
export function pageFor(label: string): Page {
  const c = '> ' + label;
  if (label === 'Wi-Fi') return new Page(c, ['Status|Connected', 'SSID|Lab-5G', 'Signal|' + status.wifiQuality + '%', 'Security|WPA3', 'IPv4|192.168.1.57', 'Channel|44 (5 GHz)', 'Rate|866 Mbit/s', 'MAC|a4:cf:12:9e:07:b1', 'Saved networks|3']);
  if (label === 'Ethernet') return new Page(c, ['eth0|up, 1 Gbit/s', 'IPv4|192.168.1.42', 'IPv6|fe80::1a2b:3c4d', 'RX|1.2 GB', 'TX|340 MB', 'usb0|down']);
  if (label === '5G Modem') return new Page(c, ['Status|Registered', 'Technology|' + status.tech, 'Signal|' + status.modemQuality + '%', 'Operator|Free', 'SIM|Ready']);
  if (label === 'Routing info') return new Page(c, ['Default via|192.168.1.1', 'Interface|eth0', 'DNS|192.168.1.1', 'Metric|100']);
  if (label === 'Battery info') return new Page(c, ['Charge|' + status.battery + '%', 'State|' + (status.charging ? 'Charging' : 'Discharging'), 'Temperature|' + status.batteryTemp / 10 + ' C', 'Power|' + status.powerMw + ' mW', 'Health|Good']);
  if (label === 'Disk info') return new Page(c, ['Device|/dev/mmcblk0', 'Size|64 GB', 'Used|9.4 GB (15%)', 'Free|54.6 GB', 'Filesystem|ext4']);
  if (label === 'System info') return new Page(c, ['Hostname|' + status.hostname, 'Profile|' + status.profile, 'Kernel|6.12.0-flipper', 'CPU|RK3576, 8 cores', 'CPU temp|' + status.cpuTemp / 10 + ' C', 'Memory|1.1 / 8 GB', 'Uptime|3 h 12 min']);
  if (label === 'Update') return new Page(c, ['Channel|stable', 'Installed|0.9.4', 'Available|0.9.4', 'Status|Up to date']);
  if (label === 'Reboot' || label === 'Shutdown') return new Page(c, ['Not available in the simulator']);
  if (label === 'Apps') return new Page(c, ['Ping|network', 'Thermals|test tools', 'Breathing LED|test tools', 'Doom|game', 'Radio|sdr', 'Browser|web']);
  if (label === 'Files') return new Page(c, ['~/Apps|6 items', '~/Downloads|0 items', 'SD card|not inserted']);
  if (label === 'Boot Menu') return new Page(c, ['FlipperOS|default', 'Recovery|', 'Network boot|']);
  if (label === 'Desktop Computer') return new Page(c, ['Not ported']);
  return new Page(c, ['Not ported yet']);
}
