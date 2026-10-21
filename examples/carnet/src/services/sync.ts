// Real time between windows and machines over WebSocket (zinc:socket). The first window serves on SYNC_PORT and relays every
// message to the others; the next ones join it. When the host closes, the first window to retry becomes the host and the
// others join it. CARNET_JOIN=ws://host:port joins another machine; CARNET_LISTEN=0.0.0.0 lets the host accept them.
import { serveWebSocket, WebSocket, WebSocketServer, MessageEvent, CloseEvent, UpgradeRequest } from 'zinc:socket';
import { createSignal } from 'zinc:ui/solid';
import * as sys from 'zinc:sys';
import { SYNC_PORT, RECONNECT_DELAY_MS } from '../constants';

export const LINK_OFFLINE: i32 = 0, LINK_HOST: i32 = 1, LINK_JOINED: i32 = 2;
export const UPSTREAM: i32 = 0;   // the link id of the host, seen from a window that joined
export const [linkMode, setLinkMode] = createSignal<i32>(LINK_OFFLINE);
export const [linkAddress, setLinkAddress] = createSignal<string>('');

/** What the app does with the links (main.ts). */
export class SyncHooks {
  /** A message arrived on a link. */
  receive: (text: string, link: i32) => void = (text: string, link: i32) => {};
  /** A link opened: the messages to send on it first (the records, the presences). */
  opened: (link: i32) => string[] = (link: i32) => [];
  /** A link closed (UPSTREAM: the host is gone). */
  closed: (link: i32) => void = (link: i32) => {};
}

class Link {
  id: i32; ws: WebSocket;
  constructor(id: i32, ws: WebSocket) { this.id = id; this.ws = ws; }
}

let hooks = new SyncHooks();
let server: WebSocketServer | null = null;
let upstream: WebSocket | null = null;
const links: Link[] = [];
let nextLink: i32 = 1;
let port: i32 = SYNC_PORT;
let join = '';
let retrying = false;

/** Sends to everyone: the host to every link, a window that joined to the host. */
export function broadcast(text: string): void {
  if (server !== null) for (const l of links) l.ws.send(text);
  else if (upstream !== null && linkMode() === LINK_JOINED) (upstream as WebSocket).send(text);
}
/** Sends on one link. */
export function sendTo(link: i32, text: string): void {
  if (link === UPSTREAM) { if (upstream !== null) (upstream as WebSocket).send(text); return; }
  for (const l of links) if (l.id === link) l.ws.send(text);
}
export function peerLinks(): i32 { return links.length; }

function accept(ws: WebSocket, req: UpgradeRequest): void {
  const link = new Link(nextLink++, ws);
  links.push(link);
  ws.onmessage = (e: MessageEvent) => {
    for (const l of links) if (l !== link) l.ws.send(e.data);   // relay first: the others see it in the same tick
    hooks.receive(e.data, link.id);
  };
  ws.onclose = (e: CloseEvent) => {
    const i = links.indexOf(link);
    if (i >= 0) links.splice(i, 1);
    hooks.closed(link.id);
  };
  for (const m of hooks.opened(link.id)) ws.send(m);
}

function retryLater(): void {
  if (retrying) return;
  retrying = true;
  setTimeout(() => { retrying = false; connectOrServe(); }, RECONNECT_DELAY_MS);
}

function joinHost(url: string): void {
  const ws = new WebSocket(url);
  upstream = ws;
  let open = false;
  ws.onopen = (e: Event) => {
    open = true;
    setLinkMode(LINK_JOINED); setLinkAddress(url.slice(5));
    for (const m of hooks.opened(UPSTREAM)) ws.send(m);
  };
  ws.onmessage = (e: MessageEvent) => { hooks.receive(e.data, UPSTREAM); };
  ws.onclose = (e: CloseEvent) => {
    if (upstream === ws) upstream = null;
    if (open) hooks.closed(UPSTREAM);
    setLinkMode(LINK_OFFLINE);
    retryLater();
  };
}

async function connectOrServe(): Promise<void> {
  if (join !== '') { joinHost(join); return; }
  const listenOn = sys.env('CARNET_LISTEN');
  try {
    server = await serveWebSocket(port, accept, listenOn !== '' ? listenOn : '127.0.0.1');
    setLinkMode(LINK_HOST); setLinkAddress(`${listenOn !== '' ? listenOn : '127.0.0.1'}:${port}`);
  } catch (e) {
    server = null;
    joinHost(`ws://127.0.0.1:${port}`);   // someone serves already: join them
  }
}

/** Starts the collaboration (CARNET_PORT, CARNET_JOIN, CARNET_LISTEN; CARNET_OFFLINE=1 stays alone). */
export function startSync(h: SyncHooks): void {
  hooks = h;
  if (sys.env('CARNET_OFFLINE') === '1') return;
  const p = sys.env('CARNET_PORT');
  if (p !== '') port = parseInt(p);
  join = sys.env('CARNET_JOIN');
  connectOrServe();
}
