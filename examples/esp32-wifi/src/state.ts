// What the screen shows: the Wi-Fi state as zinc:wifi reports it, the clock, and in setup the QR code of the setup network.
import { WifiInfo, info, clock } from 'zinc:wifi';
import { QrCode, encode, wifiText } from 'zinc:qrcode';

export class State {
  wifi: WifiInfo = info();
  time: string = '';
  join: QrCode | null = null;   // a phone's camera joins the setup network from it
  dirty: boolean = true;
}
export const state = new State();

export function changed(w: WifiInfo): void {
  state.wifi = w;
  state.dirty = true;
  if (w.state === 'setup' && w.portal !== '') state.join = encode(wifiText(w.portal, ''));
  if (w.state === 'setup') console.log('wifi: setup portal open, join the network ' + w.portal + (w.message !== '' ? ' (' + w.message + ')' : ''));
  else if (w.state === 'connected') console.log('wifi: connected to ' + w.ssid + ', ' + w.ip + ' (' + w.name + '.local), ' + w.rssi + ' dBm');
  else console.log('wifi: ' + w.state);
}

export function tick(): void {
  const t = clock();
  if (t === state.time) return;
  state.time = t;
  state.dirty = true;
}
