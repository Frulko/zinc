// zinc:osc/full in the browser (docs/targets/web.md, "Plugins"): the whole protocol (messages, bundles, patterns, time tags) is index.ts, unchanged; what a page lacks is UDP.
// A browser cannot open a UDP socket, so `open` talks to a relay over a WebSocket: every binary frame is one OSC packet, the format of osc-js's bridge, node-osc relays and
// the OSC-over-WebSocket servers of most music software (TouchDesigner, Max, Pure Data's websocket externals, `oscd`...). The relay owns the UDP ports.
//   const osc = await open(0, 'ws://localhost:8080');  osc.on('/fader/1', m => ...);  osc.send('', 0, new Message('/cue').int(3));
// `host` is the relay's ws:// or wss:// URL (a page served over https needs wss://); `port` and the host and port of send() are the relay's business and are not used
// (a received message's `from` is the relay's URL). Without a URL, open() throws ZnUnsupported saying so. A WebRTC data channel works the same way: give Osc any object with
// onMessage, sendBytes and close, as WsSocket below does.
import { Osc, Message, Bundle, encode, decode } from '../index';

export * from '../index';

const g: any = globalThis;

/** A WebSocket dressed as the UdpSocket that Osc reads and writes. */
export class WsSocket {
  port: number = 0;
  private cbs: ((d: any) => void)[] = [];
  private ws: any;
  private url: string;
  constructor(ws: any, url: string) {
    this.ws = ws; this.url = url;
    ws.binaryType = 'arraybuffer';
    ws.addEventListener('message', (e: any) => {
      if (typeof e.data === 'string') return;
      const d = { bytes: Array.from(new Uint8Array(e.data)), address: url, port: 0 };
      for (const cb of this.cbs.slice()) cb(d);
    });
  }
  onMessage(cb: (d: any) => void): WsSocket { this.cbs.push(cb); return this; }
  send(_host: string, _port: number, text: string): boolean { return this.sendBytes(_host, _port, Array.from(new g.TextEncoder().encode(text))); }
  sendBytes(_host: string, _port: number, b: number[]): boolean {
    if (this.ws.readyState !== 1) return false;
    this.ws.send(Uint8Array.from(b));
    return true;
  }
  close(): void { this.cbs = []; this.ws.close(); }
}

/** Opens an endpoint through a relay: `host` is the relay's ws:// or wss:// URL. Resolves when the WebSocket is open; rejects when it cannot connect. */
export async function open(port: number = 0, host: string = ''): Promise<Osc> {
  if (!/^wss?:\/\//.test(host)) throw new g.ZnUnsupported('zinc:osc over UDP', 'a browser has no UDP: give open() the ws:// or wss:// URL of an OSC relay (osc-js bridge, node-osc over websocket...) as its host');
  const ws = new g.WebSocket(host);
  await new Promise<void>((ok, bad) => { ws.addEventListener('open', () => ok()); ws.addEventListener('error', () => bad(new Error('osc: cannot reach the relay ' + host))); });
  return new Osc(new WsSocket(ws, host) as any);
}
