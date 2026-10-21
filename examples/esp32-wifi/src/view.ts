// The screen: the state of the connection, what to do in setup, the clock once the network set it, and the button that forgets the network.
import { clear, rect, rrect, text } from 'zinc:gfx';
import { BUTTON_H, BUTTON_W, BUTTON_X, BUTTON_Y, COLOR_BACKGROUND, COLOR_BUTTON, COLOR_BUTTON_DOWN, COLOR_MUTED, COLOR_OK, COLOR_PANEL,
  COLOR_SETUP, COLOR_TEXT, COLOR_WAIT } from './constants';
import { state } from './state';

function colorOf(s: string): u32 {
  return s === 'connected' ? COLOR_OK : s === 'setup' ? COLOR_SETUP : COLOR_WAIT;
}

export function draw(buttonDown: boolean): void {
  const w = state.wifi;
  clear(COLOR_BACKGROUND);
  text(16, 16, 'Wi-Fi', COLOR_TEXT, 3);
  rrect(16, 56, 208, 28, 8, colorOf(w.state), 255);
  text(28, 66, w.state.toUpperCase(), COLOR_BACKGROUND, 1);
  rrect(16, 96, 208, 144, 10, COLOR_PANEL, 255);
  if (w.state === 'setup') {
    text(28, 108, 'On your phone, join', COLOR_MUTED, 1);
    text(28, 124, w.portal, COLOR_TEXT, 2);
    text(28, 152, 'The setup page opens by', COLOR_MUTED, 1);
    text(28, 164, 'itself (else 192.168.4.1):', COLOR_MUTED, 1);
    text(28, 176, 'pick your network.', COLOR_MUTED, 1);
    if (w.message !== '') text(28, 200, w.message.slice(0, 24), COLOR_WAIT, 1);
  } else if (w.state === 'connected') {
    text(28, 108, w.ssid, COLOR_TEXT, 2);
    text(28, 132, w.ip + '  ' + w.rssi + ' dBm', COLOR_MUTED, 1);
    text(28, 148, w.name + '.local', COLOR_MUTED, 1);
    if (state.time !== '') {
      text(28, 172, state.time.slice(0, 10), COLOR_MUTED, 1);
      text(28, 188, state.time.slice(11), COLOR_TEXT, 4);
    } else text(28, 188, 'setting the clock...', COLOR_MUTED, 1);
  } else {
    text(28, 108, w.ssid !== '' ? 'Joining ' + w.ssid : 'Starting...', COLOR_TEXT, 1);
    rect(28, 130, 184, 2, COLOR_MUTED);
  }
  rrect(BUTTON_X, BUTTON_Y, BUTTON_W, BUTTON_H, 10, buttonDown ? COLOR_BUTTON_DOWN : COLOR_BUTTON, 255);
  text(BUTTON_X + 28, BUTTON_Y + 18, 'FORGET THE NETWORK', COLOR_TEXT, 1);
}
