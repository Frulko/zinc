// The live feed, mock edition: a ticker and an echo whose "server" lives in the app (timers), so it works offline, in the browser build, on a board
// and in the tests. feed-live.ts is the WebSocket edition.
export class FeedMessage {
  id: number; from: string; text: string; at: number;
  constructor(id: number, from: string, text: string, at: number) { this.id = id; this.from = from; this.text = text; this.at = at; }
}
const SYMBOLS: string[] = ['ZNC', 'YOGA', 'SDL', 'GLES', 'TSX'];
let serial = 0;
/** One ticker line, deterministic for a given tick. */
export function tickerLine(n: number): string {
  const s = SYMBOLS[n % SYMBOLS.length];
  const price = 40 + ((n * 37) % 600) / 10, delta = ((n * 53) % 41 - 20) / 10;
  return `${s} ${price.toFixed(2)} ${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)}%`;
}
export function message(from: string, text: string): FeedMessage { return new FeedMessage(++serial, from, text, Date.now()); }

export class MockFeed {
  onMessage: (m: FeedMessage) => void = (m: FeedMessage): void => {};
  onState: (s: string) => void = (s: string): void => {};
  private timer: i32 = -1;
  private ticks: number = 0;
  /** What carries the messages, shown on the screen. */
  kind(): string { return 'in-app mock server'; }
  connect(): void {
    if (this.timer >= 0) return;
    this.onState('connecting');
    setTimeout((): void => {
      this.onState('open');
      this.onMessage(message('server', 'Welcome to the mock feed: a tick every 1.5 s, and what you send comes back.'));
      this.timer = setInterval((): void => this.onMessage(message('ticker', tickerLine(this.ticks++))), 1500);
    }, 300);
  }
  send(text: string): void {
    this.onMessage(message('me', text));
    setTimeout((): void => { if (this.timer >= 0) this.onMessage(message('server', `echo: ${text}`)); }, 250);
  }
  close(): void { if (this.timer >= 0) { clearInterval(this.timer); this.timer = -1; } this.onState('closed'); }
}
