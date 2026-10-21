// What the board sent and heard: counts and the last packets.
import { Packet, BROADCAST, send, address } from 'zinc:espnow';
import { MAX_LINES } from './constants';

export class State {
  me: string = address();
  sent: i32 = 0;
  delivered: i32 = 0;
  heard: i32 = 0;
  lines: string[] = [];
  dirty: boolean = true;
}
export const state = new State();

export function hello(): void {
  const n = ++state.sent;
  send(BROADCAST, 'hello #' + n + ' from ' + state.me.slice(9), (ok: boolean) => {
    if (ok) state.delivered++;
    if (n <= 3) console.log('espnow: hello #' + n + (ok ? ' sent' : ' not sent'));
    state.dirty = true;
  });
}

export function heard(p: Packet): void {
  state.heard++;
  state.lines.push(p.from.slice(9) + ' ' + p.rssi + ' dBm: ' + p.data);
  if (state.lines.length > MAX_LINES) state.lines.shift();
  console.log('espnow: from ' + p.from + ' (' + p.rssi + ' dBm): ' + p.data);
  state.dirty = true;
}
