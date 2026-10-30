// The main gateway, v9 JSON: HELLO, heartbeats with the zombie check, IDENTIFY or RESUME, the dispatches handed to the state, and
// reconnection with backoff (docs/reports/discord-client-research.md 2.1). One long-lived connection: a drop resumes, it does not
// identify again, as the official client does. Discord closes a connection that sends more than 120 payloads a minute: heartbeats always
// go, everything else goes while fewer than SENDS_MAX were sent in the last minute and waits in order otherwise. IDENTIFY is spent with
// care (docs/reports/discord-client-requests.md): one connection per token, a drop resumes, an invalid session waits 1 to 5 s (longer each
// time in a row) before a new IDENTIFY, reconnections back off exponentially with jitter, and past IDENTIFY_MAX a day the client stops.
// ponytail: no transport compression; add compress=zstd-stream (third_party/zstd) when READY's size matters on slow links.
import { WebSocket, MessageEvent, CloseEvent } from 'zinc:socket';
import { GATEWAY_URL, GATEWAY_QUERY, USER_AGENT, CAPABILITIES, RECONNECT_MAX_MS } from '../constants';
import { clientProperties } from './identity';
import { Window } from './limits';

const OP_DISPATCH = 0, OP_HEARTBEAT = 1, OP_IDENTIFY = 2, OP_VOICE_STATE = 4, OP_RESUME = 6, OP_RECONNECT = 7, OP_INVALID_SESSION = 9, OP_HELLO = 10, OP_ACK = 11;
const OP_GUILD_SUBSCRIPTIONS_BULK = 37;
// Go Live: 18 creates our stream, 19 ends it or stops watching one, 20 watches one, 22 pauses ours or not
const OP_STREAM = [18, 19, 20, 22];
const CLOSE_AUTH_FAILED = 4004;
// close codes after which a new connection cannot help: bad shard, sharding, bad version, bad or disallowed intents
const FATAL = [4010, 4011, 4012, 4013, 4014];
// 120 a minute, less room for the heartbeats (one every ~41 s) and the answers to the server's heartbeat requests
export const SENDS_MAX = 110;
// Discord's budget is 1000 session starts a day (the bots' session_start_limit; user clients count too): a person needs a handful
export const IDENTIFY_MAX = 50;
// close codes after which the session cannot be resumed: invalid seq, session timed out
const NO_RESUME = [4007, 4009];

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
  private sent = new Window(SENDS_MAX, 60000);
  private queue: string[] = [];
  private flushing = -1;
  private identifies = new Window(IDENTIFY_MAX, 86400000);
  private identifySpacing = new Window(1, 5000);   // max_concurrency 1: one IDENTIFY in 5 s
  private invalidInARow = 0;   // op 9 answers since the last READY: each one waits longer before the next IDENTIFY

  constructor(handler: GatewayHandler) { this.handler = handler; }

  start(token: string): void {
    // one session per token: a connection still open (a second login) is closed first
    const old = this.ws;
    this.ws = null;
    this.clearTimers();
    if (old !== null) old.close(1000, '');
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
  /** Op 37: what the open server sends this client (its member list, typing): lazy guilds (docs/reports/discord-client-research.md 2.5). */
  subscribe(body: any): void { this.send(OP_GUILD_SUBSCRIPTIONS_BULK, body); }
  /** Op 4: joins a voice channel or a DM call ('' guild: a DM), moves, or leaves ('' channel), with our mute, deafen and camera. */
  voiceState(guildId: string, channelId: string, mute: boolean, deaf: boolean, video: boolean): void {
    this.send(OP_VOICE_STATE, { guild_id: guildId !== '' ? guildId : null, channel_id: channelId !== '' ? channelId : null, self_mute: mute, self_deaf: deaf, self_video: video });
  }
  /** Go Live (OP_STREAM): STREAM_CREATE and STREAM_SERVER_UPDATE answer with the stream's own voice server. */
  stream(op: i32, d: any): void { if (OP_STREAM.indexOf(op) >= 0) this.send(op, d); }
  /** Drops the connection as a network failure would (tests): the next connection resumes. */
  drop(): void { const ws = this.ws; if (ws !== null) ws.close(4000, 'drop'); }

  private open(): void {
    const base = this.sessionId !== '' && this.resumeUrl !== '' ? this.resumeUrl : GATEWAY_URL;
    this.handler.status(this.sessionId !== '' ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(base + GATEWAY_QUERY, { headers: [['User-Agent', USER_AGENT]] });
    this.ws = ws;
    // the limit is per connection; what waited for the old one is dropped (a new session subscribes again)
    this.sent.clear(); this.queue = [];
    if (this.flushing >= 0) { clearTimeout(this.flushing); this.flushing = -1; }
    const opened = Date.now();
    ws.onopen = (): void => { this.handler.log(`timing: socket open after ${Date.now() - opened} ms`); };
    ws.onmessage = (e: MessageEvent): void => {
      if (this.ws !== ws) return;
      if (e.data.length < 65536) { this.receive(JSON.parse(e.data)); return; }
      const t = Date.now(), m: any = JSON.parse(e.data), parsed = Date.now();
      this.receive(m);
      this.handler.log(`timing: ${m.t ?? m.op} of ${Math.round(e.data.length / 1024)} KB at ${t - opened} ms, parsed in ${parsed - t} ms, handled in ${Date.now() - parsed} ms`);
    };
    ws.onclose = (e: CloseEvent): void => { if (this.ws === ws) this.closed(e.code); };
  }
  private send(op: i32, d: any): void {
    const ws = this.ws;
    if (ws === null) return;
    const text = JSON.stringify({ op: op, d: d });
    if (op === OP_HEARTBEAT) { this.sent.add(Date.now()); ws.send(text); return; }
    this.queue.push(text);
    this.flush();
  }
  /** Sends what waits while the minute's window has room; the rest when the oldest send leaves it. */
  private flush(): void {
    const ws = this.ws;
    while (ws !== null && this.queue.length > 0) {
      const wait = this.sent.take(Date.now());
      if (wait > 0) {
        if (this.flushing < 0) {
          this.handler.log(`gateway: ${this.queue.length} sends wait ${Math.ceil(wait)} ms for the 120 a minute`);
          this.flushing = setTimeout(() => { this.flushing = -1; this.flush(); }, wait);
        }
        return;
      }
      ws.send(this.queue.shift() as string);
    }
  }

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
      if (m.d === true) { this.handler.log('invalid session, resume'); this.reconnect(); return; }
      // not resumable: Discord asks for a random 1 to 5 s before a new IDENTIFY; doubled each time in a row, never a loop
      this.sessionId = ''; this.seq = null; this.resumeUrl = '';
      const wait = Math.min((1000 + Math.random() * 4000) * Math.pow(2, this.invalidInARow), RECONNECT_MAX_MS);
      this.invalidInARow++;
      this.handler.log(`invalid session, identify again in ${Math.round(wait / 1000)} s`);
      this.clearTimers();
      const ws = this.ws;
      this.ws = null;
      if (ws !== null) ws.close(4000, 'invalid session');
      setTimeout(() => { if (!this.stopped && this.ws === null) this.open(); }, wait);
    } else if (op === OP_DISPATCH) {
      const t: string = m.t;
      if (t === 'READY') { this.sessionId = m.d.session_id; this.resumeUrl = m.d.resume_gateway_url ?? ''; }
      if (t === 'READY' || t === 'RESUMED') { this.backoff = 1000; this.invalidInARow = 0; this.handler.status('ready'); }
      this.handler.dispatch(t, m.d);
    }
  }
  private identify(): void {
    const soon = this.identifySpacing.take(Date.now());
    if (soon > 0) {
      const ws = this.ws;
      setTimeout(() => { if (this.ws === ws && ws !== null) this.identify(); }, soon);
      return;
    }
    if (this.identifies.take(Date.now()) > 0) {
      this.handler.log(`gateway: ${IDENTIFY_MAX} logins today, stopping`);
      this.stop();
      this.handler.status('failed');
      return;
    }
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
    if (NO_RESUME.indexOf(code) >= 0) { this.sessionId = ''; this.seq = null; this.resumeUrl = ''; }
    // jitter: clients cut off together do not come back together (the log gives the backoff, the same on every run)
    const wait = Math.round(this.backoff * (0.5 + Math.random() / 2));
    this.handler.log(`gateway closed (${code}), again in ${this.backoff} ms`);
    this.backoff = Math.min(this.backoff * 2, RECONNECT_MAX_MS);
    this.handler.status('reconnecting');
    setTimeout(() => { if (!this.stopped && this.ws === null) this.open(); }, wait);
  }
}
