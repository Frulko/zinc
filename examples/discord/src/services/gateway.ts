// The main gateway, v9 JSON: HELLO, heartbeats with the zombie check, IDENTIFY or RESUME, the dispatches handed to the state, and
// reconnection with backoff (docs/reports/discord-client-research.md 2.1). One long-lived connection: a drop resumes, it does not
// identify again, as the official client does.
// ponytail: no transport compression; add compress=zstd-stream (third_party/zstd) when READY's size matters on slow links.
import { WebSocket, MessageEvent, CloseEvent } from 'zinc:socket';
import { GATEWAY_URL, GATEWAY_QUERY, USER_AGENT, CAPABILITIES, RECONNECT_MAX_MS } from '../constants';
import { clientProperties } from './identity';

const OP_DISPATCH = 0, OP_HEARTBEAT = 1, OP_IDENTIFY = 2, OP_RESUME = 6, OP_RECONNECT = 7, OP_INVALID_SESSION = 9, OP_HELLO = 10, OP_ACK = 11;
const CLOSE_AUTH_FAILED = 4004;
// close codes after which a new connection cannot help: bad shard, sharding, bad version, bad or disallowed intents
const FATAL = [4010, 4011, 4012, 4013, 4014];

export interface GatewayHandler {
  dispatch(type: string, data: any): void;
  status(s: string): void;            // 'connecting' | 'ready' | 'reconnecting'
  authFailed(): void;
  log(line: string): void;
}

export class Gateway {
  private ws: WebSocket | null = null;
  private token = '';
  private seq: any = null;
  private sessionId = '';
  private resumeUrl = '';
  private beat = -1;
  private firstBeat = -1;
  private acked = true;
  private backoff = 1000;
  private stopped = true;
  private handler: GatewayHandler;

  constructor(handler: GatewayHandler) { this.handler = handler; }

  start(token: string): void {
    this.token = token; this.stopped = false; this.sessionId = ''; this.seq = null; this.resumeUrl = '';
    this.open();
  }
  /** Logs out: closes with 1000, which ends the session on Discord's side. */
  stop(): void {
    this.stopped = true;
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    if (ws !== null) ws.close(1000, '');
  }
  /** Drops the connection as a network failure would (tests): the next connection resumes. */
  drop(): void { const ws = this.ws; if (ws !== null) ws.close(4000, 'drop'); }

  private open(): void {
    const base = this.sessionId !== '' && this.resumeUrl !== '' ? this.resumeUrl : GATEWAY_URL;
    this.handler.status(this.sessionId !== '' ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(base + GATEWAY_QUERY, { headers: [['User-Agent', USER_AGENT]] });
    this.ws = ws;
    ws.onmessage = (e: MessageEvent): void => { if (this.ws === ws) this.receive(JSON.parse(e.data)); };
    ws.onclose = (e: CloseEvent): void => { if (this.ws === ws) this.closed(e.code); };
  }
  private send(op: i32, d: any): void { const ws = this.ws; if (ws !== null) ws.send(JSON.stringify({ op: op, d: d })); }

  private receive(m: any): void {
    const op: i32 = m.op;
    if (m.s !== null && m.s !== undefined) this.seq = m.s;
    if (op === OP_HELLO) {
      const interval: number = m.d.heartbeat_interval;
      this.clearTimers();
      this.acked = true;
      // the first beat at a random point of the interval, then every interval
      this.firstBeat = setTimeout(() => { this.heartbeat(); this.beat = setInterval(() => { this.heartbeat(); }, interval); }, interval * Math.random());
      if (this.sessionId !== '') this.send(OP_RESUME, { token: this.token, session_id: this.sessionId, seq: this.seq });
      else this.identify();
    } else if (op === OP_ACK) this.acked = true;
    else if (op === OP_HEARTBEAT) this.send(OP_HEARTBEAT, this.seq);
    else if (op === OP_RECONNECT) this.reconnect();
    else if (op === OP_INVALID_SESSION) {
      if (m.d !== true) { this.sessionId = ''; this.seq = null; this.resumeUrl = ''; }
      this.handler.log(`invalid session, ${m.d === true ? 'resume' : 'identify again'}`);
      this.reconnect();
    } else if (op === OP_DISPATCH) {
      const t: string = m.t;
      if (t === 'READY') { this.sessionId = m.d.session_id; this.resumeUrl = m.d.resume_gateway_url ?? ''; }
      if (t === 'READY' || t === 'RESUMED') { this.backoff = 1000; this.handler.status('ready'); }
      this.handler.dispatch(t, m.d);
    }
  }
  private identify(): void {
    this.send(OP_IDENTIFY, {
      token: this.token, capabilities: CAPABILITIES, properties: clientProperties(),
      presence: { status: 'unknown', since: 0, activities: [], afk: false }, compress: false,
      client_state: { guild_versions: {} },
    });
  }
  private heartbeat(): void {
    // no ACK since the last beat: the connection is a zombie, drop it and resume
    if (!this.acked) { this.handler.log('no heartbeat ack, reconnecting'); this.reconnect(); return; }
    this.acked = false;
    this.send(OP_HEARTBEAT, this.seq);
  }
  private clearTimers(): void {
    if (this.firstBeat >= 0) { clearTimeout(this.firstBeat); this.firstBeat = -1; }
    if (this.beat >= 0) { clearInterval(this.beat); this.beat = -1; }
  }
  /** Closes with a code that keeps the session and opens again at once. */
  private reconnect(): void {
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    if (ws !== null) ws.close(4000, 'reconnect');
    if (!this.stopped) this.open();
  }
  private closed(code: i32): void {
    this.ws = null;
    this.clearTimers();
    if (this.stopped) return;
    if (code === CLOSE_AUTH_FAILED) { this.stopped = true; this.handler.authFailed(); return; }
    if (FATAL.indexOf(code) >= 0) { this.stopped = true; this.handler.log(`gateway closed for good (${code})`); this.handler.status('failed'); return; }
    const wait = this.backoff;
    this.backoff = Math.min(this.backoff * 2, RECONNECT_MAX_MS);
    this.handler.log(`gateway closed (${code}), again in ${wait} ms`);
    this.handler.status('reconnecting');
    setTimeout(() => { if (!this.stopped && this.ws === null) this.open(); }, wait);
  }
}
