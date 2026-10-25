// The network of a match, on zinc:lan (the same calls on the Mac and in the PSP, Vita and 3DS cores): the Wi-Fi brought up, one UDP
// socket, the "who hosts?" broadcast and its answers. Every datagram is text: 'PA1|<kind>|<fields...>' (state.ts writes and reads them).
import * as lan from 'zinc:lan';
import { clock } from 'zinc:sys';
import { TAG, SEARCH_MS, HOST_FORGET_MS } from '../constants';

export class HostInfo {
  address: string; port: i32; name: string; players: i32; seenAt: number;
  constructor(address: string, port: i32, name: string, players: i32, seenAt: number) {
    this.address = address; this.port = port; this.name = name; this.players = players; this.seenAt = seenAt;
  }
}

export class Network {
  status: i32 = 0;        // 1 up, 0 joining the Wi-Fi, -1 none (why)
  why = '';
  port: i32;              // the match's port
  sock: lan.UdpSocket | null = null;
  bound: i32 = -1;        // the port the socket is bound to (0: any)
  hosts: HostInfo[] = [];
  searchedAt = -1e9;

  constructor(port: i32) { this.port = port; }

  /** A step of the Wi-Fi bring-up; true once it is up. */
  up(): boolean {
    if (this.status === 1) return true;
    this.status = lan.up();
    if (this.status < 0) this.why = lan.error();
    return this.status === 1;
  }
  address(): string { return lan.address(); }

  /** The socket on the match's port (a host) or any free port (a client); false when it cannot be bound. */
  open(asHost: boolean): boolean {
    const want = asHost ? this.port : 0;
    if (this.sock !== null && this.bound === want) return true;
    this.close();
    try {
      this.sock = lan.udp(want);
      this.bound = want;
      return true;
    } catch (e) {
      this.why = (e as Error).message;
      return false;
    }
  }
  close(): void {
    const s = this.sock;
    if (s !== null) s.close();
    this.sock = null;
    this.bound = -1;
  }

  send(address: string, port: i32, text: string): void {
    const s = this.sock;
    if (s !== null) s.send(address, port, TAG + '|' + text);
  }
  /** The next datagram of this game ('kind|fields'), null when none; its sender in from / fromPort. */
  from = '';
  fromPort: i32 = 0;
  receive(): string | null {
    const s = this.sock;
    if (s === null) return null;
    for (;;) {
      const d = s.receive();
      if (d === null) return null;
      if (!d.text.startsWith(TAG + '|')) continue;
      this.from = d.address;
      this.fromPort = d.port;
      return d.text.slice(TAG.length + 1);
    }
  }

  /** Asks the LAN who hosts, every SEARCH_MS: the /24 broadcast, the all-ones one, and this machine (a host started beside). */
  search(now: number): void {
    if (now - this.searchedAt < SEARCH_MS) return;
    this.searchedAt = now;
    this.send(lan.broadcastAddress(), this.port, '?');
    this.send('255.255.255.255', this.port, '?');
    this.send('127.0.0.1', this.port, '?');
    const kept: HostInfo[] = [];
    for (const h of this.hosts) if (now - h.seenAt < HOST_FORGET_MS) kept.push(h);
    this.hosts = kept;
  }
  /** A host's answer '!|name|players' from `from`. */
  heard(name: string, players: i32): void {
    const now = clock();
    for (const h of this.hosts) {
      if (h.address === this.from && h.port === this.fromPort) { h.name = name; h.players = players; h.seenAt = now; return; }
    }
    // this machine answers on loopback and on its LAN address: one entry
    if (this.from === '127.0.0.1' || this.from === lan.address()) {
      for (const h of this.hosts) if ((h.address === '127.0.0.1' || h.address === lan.address()) && h.port === this.fromPort) { h.seenAt = now; return; }
    }
    this.hosts.push(new HostInfo(this.from, this.fromPort, name, players, now));
  }
}
