// Real time between windows and machines. The first window serves a relay on SYNC_PORT that speaks the protocol of Carnet's
// own (`nbe serve`, packages/cli/src/relay.ts: one room per document in `?room=`, binary frames forwarded to the room's other
// members, a members signal on join and leave), and is itself an in-process member of every room it has. The next windows
// join with @nbe/collab's `connectToRelay`, unchanged. What crosses is @nbe/collab's sync (version vectors, Loro updates) and
// presence; this file only moves bytes. When the host closes, the first window to retry serves and the others join it.
import { serveWebSocket, WebSocket as ZincSocket, WebSocketServer, MessageEvent, CloseEvent, UpgradeRequest } from 'zinc:socket';
import { createSignal } from 'zinc:ui/solid';
import * as sys from 'zinc:sys';
import { connectToRelay, envelope, Message } from '@nbe/collab';
import { SYNC_PORT, RECONNECT_DELAY_MS } from '../constants';

export const LINK_OFFLINE = 0, LINK_HOST = 1, LINK_JOINED = 2;
export const [linkMode, setLinkMode] = createSignal<number>(LINK_OFFLINE);
export const [linkAddress, setLinkAddress] = createSignal<string>('');

/** @nbe/collab's transport: bytes in, bytes out. */
export interface Transport {
  send(message: Uint8Array): void;
  onMessage(handler: (message: Uint8Array) => void): () => void;
  close?(): void;
}

/** A document's room: what to run when a link to it opens (attach returns how to stop), and who is in it. */
class Room {
  name: string;
  attach: ((t: Transport) => () => void) | null;
  stop: (() => void) | null = null;
  handlers = new Set<(m: Uint8Array) => void>();   // this window, when it serves
  members = new Set<ZincSocket>();                  // the windows that joined, when it serves
  constructor(name: string, attach: ((t: Transport) => () => void) | null) { this.name = name; this.attach = attach; }
}
const rooms = new Map<string, Room>();
let server: WebSocketServer | null = null;
let port = SYNC_PORT;
let joinUrl = '';
let retrying = false;
let decided: (mode: number) => void = () => {};

const bytes = (m: Uint8Array): number[] => Array.from(m);

function announce(r: Room): void {
  const frame = envelope(Message.Signal, new TextEncoder().encode(JSON.stringify({ from: 'relay', kind: 'members', count: r.members.size + 1 })));
  for (const m of r.members) m.sendBytes(bytes(frame));
  for (const h of r.handlers) h(frame);   // this window is a member too
}

/** This window's member of a room it serves. */
function localTransport(r: Room): Transport {
  return {
    send(message: Uint8Array) { for (const m of r.members) m.sendBytes(bytes(message)); },
    onMessage(handler: (m: Uint8Array) => void) { r.handlers.add(handler); return () => { r.handlers.delete(handler); }; },
  };
}

function accept(ws: ZincSocket, req: UpgradeRequest): void {
  const q = req.path.indexOf('room=');
  const name = q >= 0 ? decodeURIComponent(req.path.slice(q + 5).split('&')[0]) : 'default';
  let r = rooms.get(name);
  if (r === undefined) { r = new Room(name, null); rooms.set(name, r); }   // a room this window has not opened (yet): relayed all the same
  const room = r;
  room.members.add(ws);
  announce(room);
  ws.onmessage = (e: MessageEvent) => {
    if (e.bytes.length === 0) return;   // text: not ours
    for (const m of room.members) if (m !== ws) m.sendBytes(e.bytes);
    const message = new Uint8Array(e.bytes);
    for (const h of room.handlers) h(message);
  };
  ws.onclose = (e: CloseEvent) => { room.members.delete(ws); announce(room); };
}

function open(r: Room): void {
  if (r.attach === null || r.stop !== null) return;
  const mode = linkMode();
  if (mode === LINK_HOST) r.stop = r.attach(localTransport(r));
  else if (mode === LINK_JOINED) r.stop = r.attach(connectToRelay(joinUrl, r.name, { onClose: lost, onError: lost }));
}
function closeAll(): void { for (const r of rooms.values()) { const s = r.stop; r.stop = null; if (s !== null) try { s(); } catch (e) {} } }

/** The host is gone: every room closes, and the window serves or joins again shortly. */
function lost(): void {
  if (linkMode() !== LINK_JOINED) return;
  setLinkMode(LINK_OFFLINE);
  closeAll();
  if (retrying) return;
  retrying = true;
  setTimeout(() => { retrying = false; connectOrServe(); }, RECONNECT_DELAY_MS);
}

async function connectOrServe(): Promise<void> {
  const fixed = sys.env('CARNET_JOIN');
  const listenOn = sys.env('CARNET_LISTEN') !== '' ? sys.env('CARNET_LISTEN') : '127.0.0.1';
  if (fixed === '') {
    try {
      server = await serveWebSocket(port, accept, listenOn);
      setLinkMode(LINK_HOST); setLinkAddress(`${listenOn}:${port}`);
      decided(LINK_HOST);
      for (const r of rooms.values()) open(r);
      return;
    } catch (e) { server = null; }   // someone serves already: join them
  }
  joinUrl = fixed !== '' ? fixed : `ws://127.0.0.1:${port}`;
  setLinkMode(LINK_JOINED); setLinkAddress(joinUrl.slice(5));
  decided(LINK_JOINED);
  for (const r of rooms.values()) open(r);
}

/** Puts a document's room on the network: `attach` gets a transport each time a link to the room opens (@nbe/collab's
 *  `connect` or `createPresence`) and returns how to stop it. */
export function joinRoom(name: string, attach: (t: Transport) => () => void): void {
  let r = rooms.get(name);
  if (r === undefined) { r = new Room(name, attach); rooms.set(name, r); } else r.attach = attach;
  open(r);
}

/** Starts the collaboration (CARNET_PORT, CARNET_JOIN, CARNET_LISTEN; CARNET_OFFLINE=1 stays alone). `ready` hears once
 *  whether this window serves (it reads the vault) or joins (the documents come from the others). */
export function startSync(ready: (mode: number) => void): void {
  let first = true;
  decided = (mode: number) => { if (first) { first = false; ready(mode); } };
  if (sys.env('CARNET_OFFLINE') === '1') { decided(LINK_OFFLINE); return; }
  const p = sys.env('CARNET_PORT');
  if (p !== '') port = parseInt(p);
  connectOrServe();
}

// ---- the browser's WebSocket, for @nbe/collab's websocketTransport: zinc:socket's, with binary messages as ArrayBuffers
class BrowserWebSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  CONNECTING = 0; OPEN = 1; CLOSING = 2; CLOSED = 3;
  binaryType = 'arraybuffer';
  url: string;
  ws: ZincSocket;
  listeners = new Map<string, Array<{ f: (e: any) => void; once: boolean }>>();
  constructor(url: string) {
    this.url = url;
    this.ws = new ZincSocket(url);
    this.ws.onopen = () => this.emit('open', { type: 'open' });
    this.ws.onmessage = (e: MessageEvent) =>
      this.emit('message', { type: 'message', data: e.bytes.length > 0 ? new Uint8Array(e.bytes).buffer : e.data });
    this.ws.onclose = (e: CloseEvent) => this.emit('close', { type: 'close', code: e.code, reason: e.reason, wasClean: e.wasClean });
    this.ws.onerror = (e: any) => this.emit('error', { type: 'error', message: e.message });
  }
  get readyState(): number { return this.ws.readyState; }
  send(data: any): void {
    if (typeof data === 'string') this.ws.send(data);
    else this.ws.sendBytes(Array.from(data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)));
  }
  close(code?: number, reason?: string): void { this.ws.close(code ?? 1000, reason ?? ''); }
  addEventListener(type: string, f: (e: any) => void, opts?: { once?: boolean }): void {
    const list = this.listeners.get(type) ?? [];
    list.push({ f, once: opts?.once === true });
    this.listeners.set(type, list);
  }
  removeEventListener(type: string, f: (e: any) => void): void {
    const list = this.listeners.get(type);
    if (list !== undefined) this.listeners.set(type, list.filter((l) => l.f !== f));
  }
  emit(type: string, e: any): void {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter((l) => !l.once));
    for (const l of list) l.f(e);
  }
}
// ponytail: a page-wide WebSocket for the libraries that expect the browser's; the QuickJS web environment could give it to every program
(globalThis as any).WebSocket ??= BrowserWebSocket;
