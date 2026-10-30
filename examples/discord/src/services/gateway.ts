// The main gateway, v9 JSON: HELLO, heartbeats with the zombie check, IDENTIFY or RESUME, the dispatches handed to the state, and
// reconnection (docs/reports/discord-client-research.md 2.1). One long-lived connection: a drop resumes, it does not identify again.
// The protocol only: every payload goes out through the guard (src/safety), which paces them, counts the IDENTIFYs across launches and
// gives the waits before a reconnection or after op 9 (docs/reports/discord-safety-model.md, layer 6).
// ponytail: no transport compression; add compress=zstd-stream (third_party/zstd) when READY's size matters on slow links.
import { WebSocket, MessageEvent, CloseEvent } from 'zinc:socket';
import { GATEWAY_URL, GATEWAY_QUERY, USER_AGENT, CAPABILITIES } from '../constants';
import { clientProperties } from './identity';
import * as guard from '../safety/index';

const OP_DISPATCH = 0, OP_HEARTBEAT = 1, OP_IDENTIFY = 2, OP_RESUME = 6, OP_RECONNECT = 7, OP_INVALID_SESSION = 9, OP_HELLO = 10, OP_ACK = 11;
const CLOSE_AUTH_FAILED = 4004;
// close codes after which a new connection cannot help: bad shard, sharding, bad version, bad or disallowed intents
const FATAL = [4010, 4011, 4012, 4013, 4014];
// close codes after which the session cannot be resumed: invalid seq, session timed out
const NO_RESUME = [4007, 4009];

export interface GatewayHandler {
  dispatch(type: string, data: any): void;
  status(s: string): void;            // 'connecting' | 'ready' | 'reconnecting' | 'failed'
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
  private stopped = true;
  private handler: GatewayHandler;
  private readySeq: i32 = 0;
  private readyAt: number = 0;

  constructor(handler: GatewayHandler) { this.handler = handler; }

  /** Connects with the token; `resume`: a session left by the last launch, resumed from READY's sequence number. One session per token:
   *  a connection still open (a second login) is closed first. */
  start(token: string, resume: guard.Saved | null = null): void {
    const old = this.ws;
    this.ws = null;
    this.clearTimers();
    if (old !== null) old.close(1000, '');
    this.token = token; this.stopped = false; this.sessionId = ''; this.seq = null; this.resumeUrl = '';
    if (resume !== null) { this.sessionId = resume.id; this.seq = resume.seq; this.resumeUrl = resume.url; this.readySeq = resume.seq; this.readyAt = resume.readyAt; }
    this.open();
  }
  /** Logs out: closes with 1000, which ends the session on Discord's side. */
  stop(): void { this.close(1000); }
  /** Quits: closes with 4000, which keeps the session for a quick restart. */
  suspend(): void { this.close(4000); }
  private close(code: i32): void {
    this.stopped = true;
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    guard.gatewayWire(null);
    if (ws !== null) ws.close(code, '');
  }
  /** The session to resume at the next launch, null when there is none. */
  saved(): guard.Saved | null {
    if (this.sessionId === '' || this.readyAt === 0) return null;
    const s = new guard.Saved();
    s.id = this.sessionId; s.seq = this.readySeq; s.url = this.resumeUrl; s.readyAt = this.readyAt; s.leftAt = Date.now();
    return s;
  }
  /** Drops the connection as a network failure would (tests): the next connection resumes. */
  drop(): void { const ws = this.ws; if (ws !== null) ws.close(4000, 'drop'); }

  private open(): void {
    const base = this.sessionId !== '' && this.resumeUrl !== '' ? this.resumeUrl : GATEWAY_URL;
    this.handler.status(this.sessionId !== '' ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(base + GATEWAY_QUERY, { headers: [['User-Agent', USER_AGENT]] });
    this.ws = ws;
    guard.gatewayWire((text: string): void => { ws.send(text); });
    const opened = Date.now();
    ws.onopen = (): void => { this.handler.log(`timing: socket open after ${Date.now() - opened} ms`); };
    ws.onmessage = (e: MessageEvent): void => {
      if (this.ws !== ws) return;
      if (e.data.length < 65536) { const small: any = JSON.parse(e.data); this.receive(small, e.data); return; }
      const t = Date.now(), m: any = JSON.parse(e.data), parsed = Date.now();
      this.receive(m, e.data);
      this.handler.log(`timing: ${m.t ?? m.op} of ${Math.round(e.data.length / 1024)} KB at ${t - opened} ms, parsed in ${parsed - t} ms, handled in ${Date.now() - parsed} ms`);
    };
    ws.onclose = (e: CloseEvent): void => { if (this.ws === ws) this.closed(e.code); };
  }

  private receive(m: any, text: string): void {
    const op: i32 = m.op;
    if (m.s !== null && m.s !== undefined) this.seq = m.s;
    if (op === OP_HELLO) {
      const interval: number = m.d.heartbeat_interval;
      this.clearTimers();
      this.acked = true;
      // the first beat at a random point of the interval, then every interval
      this.firstBeat = setTimeout(() => { this.heartbeat(); this.beat = setInterval(() => { this.heartbeat(); }, interval); }, interval * Math.random());
      if (this.sessionId !== '') guard.protocol(OP_RESUME, { token: this.token, session_id: this.sessionId, seq: this.seq });
      else this.identify();
    } else if (op === OP_ACK) this.acked = true;
    else if (op === OP_HEARTBEAT) guard.heartbeat(JSON.stringify({ op: OP_HEARTBEAT, d: this.seq }));
    else if (op === OP_RECONNECT) this.reconnect();
    else if (op === OP_INVALID_SESSION) {
      guard.gatewayUp(false);
      if (m.d === true) { this.handler.log('invalid session, resume'); this.reconnect(); return; }
      // not resumable: a new IDENTIFY after the guard's wait
      this.sessionId = ''; this.seq = null; this.resumeUrl = '';
      const wait = guard.invalidSessionDelay();
      this.handler.log(`invalid session, identify again in ${Math.round(wait / 1000)} s`);
      this.clearTimers();
      const ws = this.ws;
      this.ws = null;
      guard.gatewayWire(null);
      if (ws !== null) ws.close(4000, 'invalid session');
      setTimeout(() => { if (!this.stopped && this.ws === null) this.open(); }, wait);
    } else if (op === OP_DISPATCH) {
      const t: string = m.t;
      if (t === 'READY') { this.sessionId = m.d.session_id; this.resumeUrl = m.d.resume_gateway_url ?? ''; this.readySeq = m.s; this.readyAt = Date.now(); guard.saveReady(text); }
      if (t === 'READY' || t === 'RESUMED') { guard.gatewayUp(true); this.handler.status('ready'); }
      guard.observe(t, m.d);
      this.handler.dispatch(t, m.d);
    }
  }
  private identify(): void {
    const ws = this.ws;
    const wait = guard.identify();
    if (wait < 0) { this.stop(); this.handler.status('failed'); return; }
    if (wait > 0) { setTimeout(() => { if (this.ws === ws && ws !== null) this.identify(); }, wait); return; }
    guard.protocol(OP_IDENTIFY, {
      token: this.token, capabilities: CAPABILITIES, properties: clientProperties(),
      presence: { status: 'unknown', since: 0, activities: [], afk: false }, compress: false,
      client_state: { guild_versions: {} },
    });
  }
  private heartbeat(): void {
    // no ACK since the last beat: the connection is a zombie, drop it and resume
    if (!this.acked) { this.handler.log('no heartbeat ack, reconnecting'); this.reconnect(); return; }
    this.acked = false;
    guard.heartbeat(JSON.stringify({ op: OP_HEARTBEAT, d: this.seq }));
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
    guard.gatewayWire(null);
    if (ws !== null) ws.close(4000, 'reconnect');
    if (!this.stopped) this.open();
  }
  private closed(code: i32): void {
    this.ws = null;
    this.clearTimers();
    guard.gatewayWire(null);
    if (this.stopped) return;
    if (code === CLOSE_AUTH_FAILED) { this.stopped = true; this.handler.authFailed(); return; }
    if (FATAL.indexOf(code) >= 0) { this.stopped = true; this.handler.log(`gateway closed for good (${code})`); this.handler.status('failed'); return; }
    if (NO_RESUME.indexOf(code) >= 0) { this.sessionId = ''; this.seq = null; this.resumeUrl = ''; }
    const d = guard.reconnectDelay();
    this.handler.log(`gateway closed (${code}), again in ${d[1]} ms`);
    this.handler.status('reconnecting');
    setTimeout(() => { if (!this.stopped && this.ws === null) this.open(); }, d[0]);
  }
}
