import { utf8Encode, utf8Decode } from 'zinc:sys';
import S from './native/wifi.spec';
export interface WifiInfo { state: string; ssid: string; ip: string; rssi: i32; name: string; portal: string; message: string; strength: i32 }
export interface Network { ssid: string; rssi: i32; secure: boolean; ssidBytes: u8[]; strength: i32 }
export interface WifiOptions { portal?: string; timezone?: string }
enum State { idle, observing, closed }
let state = State.idle;
let timer: i32 = -1;
let onChange: (info: WifiInfo) => void = (info: WifiInfo): void => {};
let scanResult: (networks: Network[]) => void = (networks: Network[]): void => {};
let scanning: boolean = false;
let last = '';
function unhex(s: string): u8[] { const out: u8[] = []; for (let i = 0; i < s.length; i += 2) out.push(parseInt(s.slice(i, i + 2), 16)); return out; }
function transition(next: State): void {
  if (next === State.observing || next === State.closed) state = next;
}
function wake(): void { if (timer < 0) timer = setInterval(() => poll(), 25); }
function parsed(raw: string): WifiInfo {
  const f = raw.split('\t');
  return { state: f[0], ssid: utf8Decode(unhex(f[1])), ip: f[2], rssi: 127, name: '', portal: '', message: S.error(), strength: parseInt(f[3]) };
}
function poll(): void {
  if (state !== State.observing) return;
  S.poll();
  const raw = S.info();
  const snapshot = raw + '\t' + S.error();
  if (snapshot !== last) { last = snapshot; onChange(parsed(raw)); }
  if (scanning && !S.busy()) {
    scanning = false;
    const out: Network[] = [];
    for (const row of S.networks().split('\n')) {
      if (row === '') continue;
      const f = row.split('\t'), bytes = unhex(f[0]);
      out.push({ ssid: utf8Decode(bytes), ssidBytes: bytes, rssi: 127, strength: parseInt(f[1]), secure: f[2] === '1' });
    }
    scanResult(out);
  }
}
/** Begins observation only. Linux never creates a setup hotspot without accessPoint(). Call stop() to end observation. */
export function start(change: (info: WifiInfo) => void = (info: WifiInfo): void => {}, options: WifiOptions = {}): void {
  if (options.portal !== undefined || options.timezone !== undefined) throw new Error('wifi: portal and timezone options belong to the ESP32 firmware');
  onChange = change; last = ''; S.start(); transition(State.observing); wake(); poll();
}
/** True only after observation found a NetworkManager Wi-Fi device; inspect info().state while discovery is pending. */
export function has(): boolean { return S.has(); }
export function info(): WifiInfo { return parsed(S.info()); }
export function scan(cb: (networks: Network[]) => void): void {
  if (!S.scan()) throw new Error('wifi: scan: ' + S.error());
  scanResult = cb; scanning = true; wake();
}
/** Uses a scanned SSID exactly, including SSIDs which are not UTF-8. Connections are temporary and end with stop(). */
export function connectBytes(ssid: u8[], password: string): void { if (!S.connect(ssid, password, false)) throw new Error('wifi: connect: ' + S.error()); }
export function connect(ssid: string, password: string): void { connectBytes(utf8Encode(ssid), password); }
/** Explicitly creates a temporary hotspot (NetworkManager shared IPv4/DHCP/NAT). Empty password makes it open. */
export function accessPoint(ssid: string, password: string): void { if (!S.connect(utf8Encode(ssid), password, true)) throw new Error('wifi: accessPoint: ' + S.error()); }
/** Disconnects only the temporary connection this program created. Never deletes a saved system profile. */
export function forget(): void { S.disconnect(); }
export function stop(): void { transition(State.closed); scanning = false; S.stop(); if (timer >= 0) clearInterval(timer); timer = -1; }
/** Linux uses the system clock; Wi-Fi never changes the machine's timezone or starts SNTP. */
export function clock(): string { return ''; }
