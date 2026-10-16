// The live feed, WebSocket edition (macos and linux: zinc:socket is a desktop plugin). With SHOWCASE_WS=ws://host:port/path it talks to that server;
// otherwise the app starts its own WebSocket server on 127.0.0.1 (a ticker and an echo) and connects to it, so the round trip is real without
// depending on a public server (zinc:socket speaks ws:// only, and public echo servers are wss://). In the mock network mode it is the mock feed.
import { WebSocket, MessageEvent, CloseEvent, serveWebSocket, UpgradeRequest } from 'zinc:socket';
import { env } from 'zinc:sys';
import { api } from './api';
import { MockFeed, FeedMessage, message, tickerLine } from './feed-mock';

let serverPort = 0;
/** The app's own server: started once, it ticks every 1.5 s to each client and echoes what it receives. */
async function localServer(): Promise<number> {
  if (serverPort > 0) return serverPort;
  let n = 0;
  const wss = await serveWebSocket(0, (peer: WebSocket, req: UpgradeRequest): void => {
    peer.send('Welcome: this server runs inside the app, on 127.0.0.1.');
    const t = setInterval((): void => { if (peer.readyState === 1) peer.send(tickerLine(n++)); else clearInterval(t); }, 1500);
    peer.onmessage = (e: MessageEvent): void => { peer.send(`echo: ${e.data}`); };
  }, '127.0.0.1');
  serverPort = wss.port;
  return serverPort;
}

export class LiveFeed {
  onMessage: (m: FeedMessage) => void = (m: FeedMessage): void => {};
  onState: (s: string) => void = (s: string): void => {};
  private mock: MockFeed | null = null;
  private ws: WebSocket | null = null;
  kind(): string { return api.mock ? 'in-app mock server' : env('SHOWCASE_WS') !== '' ? `WebSocket ${env('SHOWCASE_WS')}` : 'WebSocket, local server'; }
  connect(): void {
    if (api.mock) {
      const m = new MockFeed();
      m.onMessage = this.onMessage; m.onState = this.onState;
      this.mock = m;
      m.connect();
      return;
    }
    if (this.ws !== null) return;
    this.onState('connecting');
    const url = env('SHOWCASE_WS');
    if (url !== '') this.open(url);
    else localServer().then((port: number): void => this.open(`ws://127.0.0.1:${port}/feed`)).catch((e: Error): void => { this.onMessage(message('server', e.message)); this.onState('closed'); });
  }
  private open(url: string): void {
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = (): void => this.onState('open');
    ws.onmessage = (e: MessageEvent): void => {
      const t = e.data;
      this.onMessage(message(t.startsWith('echo: ') || t.startsWith('Welcome') ? 'server' : 'ticker', t));
    };
    ws.onclose = (e: CloseEvent): void => { if (this.ws === ws) { this.ws = null; this.onState('closed'); } };   // the server went away
  }
  send(text: string): void {
    const m = this.mock;
    if (m !== null) { m.send(text); return; }
    const ws = this.ws;
    if (ws === null) return;
    this.onMessage(message('me', text));
    (ws as WebSocket).send(text);
  }
  close(): void {
    const m = this.mock;
    if (m !== null) { m.close(); this.mock = null; return; }
    const ws = this.ws;
    this.ws = null;
    if (ws !== null) (ws as WebSocket).close();
    this.onState('closed');
  }
}
